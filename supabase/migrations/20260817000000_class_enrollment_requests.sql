-- ==============================================================================
-- MIGRATION: 20260817000000_class_enrollment_requests.sql
-- Turno fijo semanal por alumno + flujo de aprobación del owner/staff.
--
-- Cambia el modelo de reserva de "drop-in, cualquier horario, cualquier día"
-- a "un turno semanal fijo por alumno", con aprobación manual antes de
-- confirmarse (para poder verificar el pago) y un canal de WhatsApp al owner
-- para pedir cambios de turno en lugar de que el alumno se reasigne solo.
--
-- No se toca el modelo anterior (public.reservations, book_class,
-- cancel_reservation, get_available_classes_for_date, panel admin de
-- clases por fecha): sigue funcionando igual para reservas puntuales ya
-- existentes y para las herramientas de administración por día. Este flujo
-- nuevo se apoya en la misma tabla `reservations` para la asistencia diaria:
-- al aprobar un turno se generan reservas confirmadas para las próximas
-- semanas automáticamente, así el panel de "Gestión de Clases" no necesita
-- cambios para tomar asistencia.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. WhatsApp del owner (para el botón "Solicitar cambio de turno")
-- ------------------------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;

-- ------------------------------------------------------------------------------
-- 2. TABLA CLASS_ENROLLMENTS (Turno fijo semanal + solicitud de aprobación)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    class_schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
    class_type_id UUID NOT NULL REFERENCES public.class_types(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected', 'cancelled')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_org ON public.class_enrollments(organization_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user ON public.class_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_status ON public.class_enrollments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_schedule ON public.class_enrollments(class_schedule_id);

-- Un alumno solo puede tener UN turno pendiente o activo a la vez ("por única vez").
-- Para cambiarlo tiene que pedirlo por WhatsApp; el staff cancela el viejo
-- (queda 'cancelled', libre del índice) y aprueba uno nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_or_pending_enrollment_per_user
ON public.class_enrollments (user_id)
WHERE (status IN ('pending', 'active'));

DROP TRIGGER IF EXISTS update_class_enrollments_updated_at ON public.class_enrollments;
CREATE TRIGGER update_class_enrollments_updated_at
    BEFORE UPDATE ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

-- Solo SELECT vía RLS. Todas las escrituras pasan por las funciones RPC de
-- abajo (SECURITY DEFINER), así un cliente nunca puede aprobarse su propio
-- turno ni tocar el de otro alumno directamente por PostgREST.
DROP POLICY IF EXISTS "class_enrollments_select" ON public.class_enrollments;
CREATE POLICY "class_enrollments_select" ON public.class_enrollments
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
        )
    );

-- ------------------------------------------------------------------------------
-- 3. RPC: ALUMNO SOLICITA UN TURNO (crea la "postulación" en estado pending)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_class_enrollment(
    p_schedule_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_student_id UUID;
    v_schedule RECORD;
    v_existing RECORD;
    v_enrollment_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    SELECT organization_id, student_id INTO v_org_id, v_student_id
    FROM public.profiles WHERE id = v_user_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil de usuario');
    END IF;

    SELECT cs.*, ct.name AS class_name, ct.active AS class_active
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_org_id AND cs.active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario seleccionado no existe o no se encuentra activo');
    END IF;

    IF NOT v_schedule.class_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'La actividad no está habilitada actualmente');
    END IF;

    SELECT * INTO v_existing FROM public.class_enrollments
    WHERE user_id = v_user_id AND status IN ('pending', 'active')
    LIMIT 1;

    IF FOUND THEN
        IF v_existing.status = 'pending' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Ya tenés una solicitud de turno pendiente de aprobación.');
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Ya tenés un turno activo. Para cambiarlo, solicitá el cambio al staff por WhatsApp.');
        END IF;
    END IF;

    INSERT INTO public.class_enrollments (
        organization_id, user_id, student_id, class_schedule_id, class_type_id, status
    ) VALUES (
        v_org_id, v_user_id, v_student_id, p_schedule_id, v_schedule.class_type_id, 'pending'
    ) RETURNING id INTO v_enrollment_id;

    RETURN jsonb_build_object(
        'success', true,
        'enrollment_id', v_enrollment_id,
        'class_name', v_schedule.class_name,
        'day_of_week', v_schedule.day_of_week,
        'start_time', v_schedule.start_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. RPC: ALUMNO CANCELA SU PROPIA SOLICITUD PENDIENTE (antes de ser revisada)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_enrollment_request(
    p_enrollment_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_enr RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    SELECT * INTO v_enr FROM public.class_enrollments
    WHERE id = p_enrollment_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
    END IF;

    IF v_enr.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo podés cancelar solicitudes que todavía están pendientes.');
    END IF;

    UPDATE public.class_enrollments
    SET status = 'cancelled', decided_at = timezone('utc'::text, now())
    WHERE id = p_enrollment_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 5. RPC: LISTAR SOLICITUDES PENDIENTES (Staff/Admin/Owner) con contexto de pago
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_enrollment_requests()
RETURNS TABLE (
    enrollment_id UUID,
    user_id UUID,
    profile_full_name TEXT,
    profile_email TEXT,
    profile_phone TEXT,
    student_id UUID,
    student_id_socio TEXT,
    student_nombre_completo TEXT,
    student_habilitado BOOLEAN,
    student_fecha_fin TIMESTAMPTZ,
    class_schedule_id UUID,
    class_type_id UUID,
    class_name TEXT,
    class_color TEXT,
    day_of_week INTEGER,
    start_time TIME,
    requested_at TIMESTAMPTZ
) AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'No tenés permisos para ver las solicitudes de turno.';
    END IF;

    RETURN QUERY
    SELECT
        ce.id AS enrollment_id,
        ce.user_id,
        p.full_name AS profile_full_name,
        p.email AS profile_email,
        p.phone AS profile_phone,
        ce.student_id,
        s.id_socio AS student_id_socio,
        s.nombre_completo AS student_nombre_completo,
        s.habilitado AS student_habilitado,
        s.fecha_fin AS student_fecha_fin,
        ce.class_schedule_id,
        ce.class_type_id,
        ct.name AS class_name,
        ct.color AS class_color,
        cs.day_of_week,
        cs.start_time,
        ce.requested_at
    FROM public.class_enrollments ce
    JOIN public.profiles p ON p.id = ce.user_id
    JOIN public.class_schedules cs ON cs.id = ce.class_schedule_id
    JOIN public.class_types ct ON ct.id = ce.class_type_id
    LEFT JOIN public.students s ON s.id = ce.student_id
    WHERE ce.organization_id = v_caller_org AND ce.status = 'pending'
    ORDER BY ce.requested_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. RPC: APROBAR SOLICITUD (Staff/Admin/Owner) — confirma el turno y genera
--    las reservas de las próximas semanas para que el panel de asistencia
--    diaria funcione sin cambios.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_class_enrollment(
    p_enrollment_id UUID,
    p_weeks_ahead INTEGER DEFAULT 26
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_enr RECORD;
    v_schedule RECORD;
    v_now_arg DATE;
    v_first_date DATE;
    v_date DATE;
    v_i INTEGER;
    v_current_count INTEGER;
    v_generated INTEGER := 0;
    v_skipped_full INTEGER := 0;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para aprobar solicitudes de turno.');
    END IF;

    SELECT * INTO v_enr FROM public.class_enrollments
    WHERE id = p_enrollment_id AND organization_id = v_caller_org
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
    END IF;

    IF v_enr.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta solicitud ya fue procesada.');
    END IF;

    SELECT cs.*, ct.name AS class_name, ct.active AS class_active
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = v_enr.class_schedule_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_schedule.active OR NOT v_schedule.class_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario de esta solicitud ya no está disponible.');
    END IF;

    IF v_schedule.capacity IS NULL OR v_schedule.capacity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este horario todavía no tiene cupo definido. Definilo en "Gestionar Horarios" antes de aceptar solicitudes.');
    END IF;

    UPDATE public.class_enrollments
    SET status = 'active', decided_at = timezone('utc'::text, now()), decided_by = auth.uid()
    WHERE id = p_enrollment_id;

    -- Generar reservas confirmadas para las próximas p_weeks_ahead ocurrencias
    -- de este horario, empezando hoy o la próxima fecha que coincida con el
    -- día de la semana del horario.
    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    v_first_date := v_now_arg + (((v_schedule.day_of_week - EXTRACT(DOW FROM v_now_arg)::int) + 7) % 7);

    FOR v_i IN 0..(GREATEST(p_weeks_ahead, 1) - 1) LOOP
        v_date := v_first_date + (v_i * 7);

        SELECT COUNT(*)::INTEGER INTO v_current_count
        FROM public.reservations
        WHERE class_schedule_id = v_enr.class_schedule_id
          AND class_date = v_date
          AND status = 'confirmed';

        IF v_current_count < v_schedule.capacity THEN
            INSERT INTO public.reservations (
                organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, notes
            ) VALUES (
                v_caller_org, v_enr.class_schedule_id, v_enr.class_type_id, v_enr.user_id, v_enr.student_id, v_date, 'confirmed', 'Turno fijo aprobado por el staff'
            )
            ON CONFLICT (organization_id, class_schedule_id, class_date, user_id) WHERE (status = 'confirmed') DO NOTHING;
            v_generated := v_generated + 1;
        ELSE
            v_skipped_full := v_skipped_full + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'class_name', v_schedule.class_name,
        'reservations_generated', v_generated,
        'weeks_skipped_full', v_skipped_full
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 7. RPC: RECHAZAR SOLICITUD PENDIENTE (Staff/Admin/Owner)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_class_enrollment(
    p_enrollment_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_enr RECORD;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para rechazar solicitudes.');
    END IF;

    SELECT * INTO v_enr FROM public.class_enrollments
    WHERE id = p_enrollment_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
    END IF;

    IF v_enr.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta solicitud ya fue procesada.');
    END IF;

    UPDATE public.class_enrollments
    SET status = 'rejected', decided_at = timezone('utc'::text, now()), decided_by = auth.uid(), decision_notes = p_reason
    WHERE id = p_enrollment_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 8. RPC: CANCELAR TURNO ACTIVO (Staff/Admin/Owner) — libera el cupo y
--    cancela las reservas futuras generadas automáticamente.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_class_enrollment(
    p_enrollment_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_enr RECORD;
    v_now_arg DATE;
    v_cancelled_count INTEGER;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para cancelar turnos.');
    END IF;

    SELECT * INTO v_enr FROM public.class_enrollments
    WHERE id = p_enrollment_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Turno no encontrado.');
    END IF;

    IF v_enr.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este turno no está activo.');
    END IF;

    UPDATE public.class_enrollments
    SET status = 'cancelled', decided_at = timezone('utc'::text, now()), decided_by = auth.uid()
    WHERE id = p_enrollment_id;

    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

    WITH cancelled AS (
        UPDATE public.reservations
        SET status = 'cancelled', cancelled_at = timezone('utc'::text, now())
        WHERE class_schedule_id = v_enr.class_schedule_id
          AND user_id = v_enr.user_id
          AND class_date >= v_now_arg
          AND status = 'confirmed'
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER INTO v_cancelled_count FROM cancelled;

    RETURN jsonb_build_object('success', true, 'reservations_cancelled', v_cancelled_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 9. RPC: LISTAR TURNOS ACTIVOS (Staff/Admin/Owner) — para poder liberar un
--    turno cuando el alumno pide un cambio por WhatsApp.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_enrollments()
RETURNS TABLE (
    enrollment_id UUID,
    user_id UUID,
    profile_full_name TEXT,
    profile_phone TEXT,
    student_id_socio TEXT,
    class_schedule_id UUID,
    class_name TEXT,
    class_color TEXT,
    day_of_week INTEGER,
    start_time TIME,
    decided_at TIMESTAMPTZ
) AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'No tenés permisos para ver los turnos activos.';
    END IF;

    RETURN QUERY
    SELECT
        ce.id AS enrollment_id,
        ce.user_id,
        p.full_name AS profile_full_name,
        p.phone AS profile_phone,
        s.id_socio AS student_id_socio,
        ce.class_schedule_id,
        ct.name AS class_name,
        ct.color AS class_color,
        cs.day_of_week,
        cs.start_time,
        ce.decided_at
    FROM public.class_enrollments ce
    JOIN public.profiles p ON p.id = ce.user_id
    JOIN public.class_schedules cs ON cs.id = ce.class_schedule_id
    JOIN public.class_types ct ON ct.id = ce.class_type_id
    LEFT JOIN public.students s ON s.id = ce.student_id
    WHERE ce.organization_id = v_caller_org AND ce.status = 'active'
    ORDER BY cs.day_of_week ASC, cs.start_time ASC, p.full_name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 10. RPC: HORARIOS DISPONIBLES PARA SOLICITAR TURNO (vista del alumno)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_class_schedules()
RETURNS TABLE (
    schedule_id UUID,
    class_type_id UUID,
    class_name TEXT,
    class_description TEXT,
    class_color TEXT,
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    capacity INTEGER,
    active_enrollments BIGINT,
    available_spots BIGINT
) AS $$
DECLARE
    v_org_id UUID := public.get_auth_org_id();
BEGIN
    RETURN QUERY
    SELECT
        cs.id AS schedule_id,
        ct.id AS class_type_id,
        ct.name AS class_name,
        ct.description AS class_description,
        ct.color AS class_color,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.capacity,
        COALESCE(e_stats.active_count, 0) AS active_enrollments,
        CASE WHEN cs.capacity IS NULL THEN NULL
             ELSE GREATEST(0, cs.capacity - COALESCE(e_stats.active_count, 0))
        END AS available_spots
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN (
        SELECT class_schedule_id, COUNT(*) AS active_count
        FROM public.class_enrollments
        WHERE status = 'active'
        GROUP BY class_schedule_id
    ) e_stats ON e_stats.class_schedule_id = cs.id
    WHERE cs.organization_id = v_org_id AND cs.active = true AND ct.active = true
    ORDER BY cs.day_of_week ASC, cs.start_time ASC, ct.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
