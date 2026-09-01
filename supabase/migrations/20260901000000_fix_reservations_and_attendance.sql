-- ==============================================================================
-- LANGGYM: CORRECCIÓN COMPLETA DE RESERVAS, ASISTENCIA Y UNIQUE CONSTRAINTS
-- Migration: 20260901000000_fix_reservations_and_attendance.sql
-- ==============================================================================

-- 1. PERMITIR RESERVAS CON user_id NULO (Para alumnos sin perfil de usuario registrado)
ALTER TABLE public.reservations ALTER COLUMN user_id DROP NOT NULL;

-- 2. INTEGRIDAD: Al menos user_id o student_id debe estar presente
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_user_or_student_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_user_or_student_check
    CHECK (user_id IS NOT NULL OR student_id IS NOT NULL);

-- 3. REESTRUCTURAR ÍNDICES ÚNICOS DE RESERVAS ACTIVAS
DROP INDEX IF EXISTS public.unique_active_reservation_slot;

-- Índice A: Un usuario (profile) no puede tener más de una reserva activa en el mismo turno y fecha
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_reservation_user_slot
ON public.reservations (organization_id, class_schedule_id, class_date, user_id)
WHERE (status IN ('confirmed', 'attended') AND user_id IS NOT NULL);

-- Índice B: Un alumno (student record) no puede tener más de una reserva activa en el mismo turno y fecha
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_reservation_student_slot
ON public.reservations (organization_id, class_schedule_id, class_date, student_id)
WHERE (status IN ('confirmed', 'attended') AND student_id IS NOT NULL);

-- 4. REPARAR DATOS HISTÓRICOS INCONSISTENTES
-- Si user_id fue asignado por error a un admin/profesor para la reserva de un alumno sin perfil:
UPDATE public.reservations r
SET user_id = (
    SELECT p.id FROM public.profiles p 
    WHERE p.student_id = r.student_id AND p.organization_id = r.organization_id 
    LIMIT 1
)
WHERE r.student_id IS NOT NULL 
  AND r.user_id IN (
      SELECT id FROM public.profiles WHERE role IN ('owner', 'admin', 'staff')
  )
  AND NOT EXISTS (
      SELECT 1 FROM public.profiles p2 WHERE p2.id = r.user_id AND p2.student_id = r.student_id
  );

-- 5. RPC: RESERVA MANUAL ADMINISTRATIVA IDEMPOTENTE Y ATÓMICA
CREATE OR REPLACE FUNCTION public.admin_manual_book_class(
    p_schedule_id UUID,
    p_class_date DATE,
    p_user_id UUID,
    p_student_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_schedule RECORD;
    v_current_count INTEGER;
    v_reservation_id UUID;
    v_effective_user_id UUID := p_user_id;
    v_effective_student_id UUID := p_student_id;
    v_existing RECORD;
BEGIN
    -- Permisos del usuario que invoca
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para realizar reservas administrativas.');
    END IF;

    IF v_caller_org IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró la organización del usuario.');
    END IF;

    -- Vincular user_id y student_id si corresponde sin forzar auth.uid()
    IF v_effective_user_id IS NULL AND v_effective_student_id IS NOT NULL THEN
        SELECT id INTO v_effective_user_id 
        FROM public.profiles 
        WHERE student_id = v_effective_student_id AND organization_id = v_caller_org 
        LIMIT 1;
    END IF;

    IF v_effective_student_id IS NULL AND v_effective_user_id IS NOT NULL THEN
        SELECT student_id INTO v_effective_student_id 
        FROM public.profiles 
        WHERE id = v_effective_user_id AND organization_id = v_caller_org 
        LIMIT 1;
    END IF;

    IF v_effective_user_id IS NULL AND v_effective_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe especificar un alumno para realizar la reserva.');
    END IF;

    -- Verificar reserva previa
    SELECT * INTO v_existing
    FROM public.reservations
    WHERE organization_id = v_caller_org
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND (
        (v_effective_student_id IS NOT NULL AND student_id = v_effective_student_id) OR
        (v_effective_user_id IS NOT NULL AND user_id = v_effective_user_id)
      )
    ORDER BY created_at DESC
    LIMIT 1;

    -- Idempotencia: Si ya tiene reserva ACTIVA ('confirmed' o 'attended')
    IF v_existing.id IS NOT NULL AND v_existing.status IN ('confirmed', 'attended') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_booked', true,
            'reservation_id', v_existing.id,
            'message', 'El alumno ya se encuentra anotado en este turno.'
        );
    END IF;

    -- Bloqueo transaccional sobre el horario (FOR UPDATE)
    SELECT cs.*, ct.name AS class_name
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_caller_org AND cs.active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario seleccionado no existe o está inactivo.');
    END IF;

    IF v_schedule.capacity IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta clase aún no tiene cupo definido.');
    END IF;

    -- Si existía una reserva CANCELADA -> Reactivarla
    IF v_existing.id IS NOT NULL AND v_existing.status = 'cancelled' THEN
        SELECT COUNT(*)::INTEGER INTO v_current_count
        FROM public.reservations
        WHERE organization_id = v_caller_org
          AND class_schedule_id = p_schedule_id
          AND class_date = p_class_date
          AND status IN ('confirmed', 'attended');

        IF v_current_count >= v_schedule.capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cupo completo. No quedan lugares disponibles.');
        END IF;

        UPDATE public.reservations
        SET status = 'confirmed',
            cancelled_at = NULL,
            user_id = v_effective_user_id,
            student_id = v_effective_student_id,
            notes = 'Reserva reactivada por administración'
        WHERE id = v_existing.id;

        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', v_existing.id,
            'spots_left', v_schedule.capacity - (v_current_count + 1)
        );
    END IF;

    -- Inserción de NUEVA reserva
    SELECT COUNT(*)::INTEGER INTO v_current_count
    FROM public.reservations
    WHERE organization_id = v_caller_org
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND status IN ('confirmed', 'attended');

    IF v_current_count >= v_schedule.capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cupo completo. No quedan lugares disponibles.');
    END IF;

    BEGIN
        INSERT INTO public.reservations (
            organization_id,
            class_schedule_id,
            class_type_id,
            user_id,
            student_id,
            class_date,
            status,
            notes
        ) VALUES (
            v_caller_org,
            p_schedule_id,
            v_schedule.class_type_id,
            v_effective_user_id,
            v_effective_student_id,
            p_class_date,
            'confirmed',
            'Reserva manual ingresada por administración'
        ) RETURNING id INTO v_reservation_id;

        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', v_reservation_id,
            'spots_left', v_schedule.capacity - (v_current_count + 1)
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_booked', true,
            'message', 'El alumno ya tiene una reserva activa para este turno.'
        );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: REGISTRAR Y ACTUALIZAR ASISTENCIA (PRESENTE / AUSENTE / RESTABLECER)
CREATE OR REPLACE FUNCTION public.admin_update_attendance(
    p_reservation_id UUID,
    p_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_res RECORD;
BEGIN
    IF p_status NOT IN ('confirmed', 'attended', 'no_show', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de asistencia inválido.');
    END IF;

    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para registrar asistencia.');
    END IF;

    IF v_caller_org IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organización no encontrada.');
    END IF;

    SELECT * INTO v_res FROM public.reservations
    WHERE id = p_reservation_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada.');
    END IF;

    UPDATE public.reservations
    SET status = p_status,
        attended_at = CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END,
        cancelled_at = CASE WHEN p_status = 'cancelled' THEN timezone('utc'::text, now()) ELSE NULL END
    WHERE id = p_reservation_id;

    -- Si se marca Presente, actualizar última asistencia del socio en la tabla students
    IF p_status = 'attended' AND v_res.student_id IS NOT NULL THEN
        UPDATE public.students
        SET ultima_asistencia = timezone('utc'::text, now())
        WHERE id = v_res.student_id AND organization_id = v_caller_org;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: RESERVA DE ALUMNO (DESDE CLIENTE) CON IDEMPOTENCIA
CREATE OR REPLACE FUNCTION public.book_class(
    p_schedule_id UUID,
    p_class_date DATE
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_student_id UUID;
    v_role TEXT;
    v_schedule RECORD;
    v_current_count INTEGER;
    v_reservation_id UUID;
    v_dow INTEGER;
    v_now_arg DATE;
    v_existing RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    SELECT organization_id, student_id, role
    INTO v_org_id, v_student_id, v_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil de usuario');
    END IF;

    SELECT cs.*, ct.name AS class_name, ct.active AS class_active
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id 
      AND cs.organization_id = v_org_id 
      AND cs.active = true
    FOR UPDATE;

    IF NOT FOUND OR NOT v_schedule.class_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario seleccionado no existe o no está habilitado');
    END IF;

    IF v_schedule.capacity IS NULL OR v_schedule.capacity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta clase aún no tiene cupo definido');
    END IF;

    v_dow := EXTRACT(DOW FROM p_class_date);
    IF v_dow != v_schedule.day_of_week THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha seleccionada no corresponde al día de esta actividad');
    END IF;

    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    IF p_class_date < v_now_arg THEN
        RETURN jsonb_build_object('success', false, 'error', 'No es posible reservar clases para fechas pasadas');
    END IF;

    -- Verificar reserva existente
    SELECT * INTO v_existing
    FROM public.reservations
    WHERE organization_id = v_org_id
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND (
        user_id = v_user_id OR
        (v_student_id IS NOT NULL AND student_id = v_student_id)
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing.id IS NOT NULL AND v_existing.status IN ('confirmed', 'attended') THEN
        RETURN jsonb_build_object('success', true, 'already_booked', true, 'message', 'Ya tenés una reserva confirmada para este horario');
    END IF;

    -- Si estaba cancelada -> Reactivar
    IF v_existing.id IS NOT NULL AND v_existing.status = 'cancelled' THEN
        SELECT COUNT(*)::INTEGER INTO v_current_count
        FROM public.reservations
        WHERE organization_id = v_org_id
          AND class_schedule_id = p_schedule_id
          AND class_date = p_class_date
          AND status IN ('confirmed', 'attended');

        IF v_current_count >= v_schedule.capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cupo completo. No quedan lugares disponibles.');
        END IF;

        UPDATE public.reservations
        SET status = 'confirmed', cancelled_at = NULL
        WHERE id = v_existing.id;

        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', v_existing.id,
            'class_name', v_schedule.class_name,
            'start_time', v_schedule.start_time,
            'class_date', p_class_date,
            'spots_left', v_schedule.capacity - (v_current_count + 1)
        );
    END IF;

    -- Contar cupos
    SELECT COUNT(*)::INTEGER INTO v_current_count
    FROM public.reservations
    WHERE organization_id = v_org_id
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND status IN ('confirmed', 'attended');

    IF v_current_count >= v_schedule.capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cupo completo. No quedan lugares disponibles.');
    END IF;

    BEGIN
        INSERT INTO public.reservations (
            organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status
        ) VALUES (
            v_org_id, p_schedule_id, v_schedule.class_type_id, v_user_id, v_student_id, p_class_date, 'confirmed'
        ) RETURNING id INTO v_reservation_id;

        RETURN jsonb_build_object(
            'success', true,
            'reservation_id', v_reservation_id,
            'class_name', v_schedule.class_name,
            'start_time', v_schedule.start_time,
            'class_date', p_class_date,
            'spots_left', v_schedule.capacity - (v_current_count + 1)
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', true, 'already_booked', true, 'message', 'Ya tenés una reserva confirmada para este horario');
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. FORTALECER POLÍTICAS DE RLS EN RESERVATIONS
DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
CREATE POLICY "reservations_select" ON public.reservations
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            public.is_admin_or_staff()
        )
    );

DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
CREATE POLICY "reservations_insert" ON public.reservations
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            public.is_admin_or_staff()
        )
    );

DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
CREATE POLICY "reservations_update" ON public.reservations
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            public.is_admin_or_staff()
        )
    );

DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;
CREATE POLICY "reservations_delete" ON public.reservations
    FOR DELETE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );
