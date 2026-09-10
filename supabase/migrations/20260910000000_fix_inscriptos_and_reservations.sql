-- ==============================================================================
-- MIGRATION: 20260910000000_fix_inscriptos_and_reservations.sql
-- Corrección definitiva para evitar que se borren o desaparezcan inscriptos,
-- e integración unificada de turnos fijos semanales y reservas por fecha.
-- ==============================================================================

-- 1. CORREGIR RPC: get_admin_classes_for_date
-- Ahora une tanto los turnos fijos activos (class_enrollments) como las reservas
-- puntuales (reservations) para la fecha dada, deduplicando por usuario.
CREATE OR REPLACE FUNCTION public.get_admin_classes_for_date(
    p_date DATE
)
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
    schedule_active BOOLEAN,
    class_type_active BOOLEAN,
    confirmed_count BIGINT,
    attended_count BIGINT,
    no_show_count BIGINT,
    cancelled_count BIGINT,
    available_spots BIGINT
) AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_dow INTEGER := EXTRACT(DOW FROM p_date);
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos administrativos o de profesor.';
    END IF;

    RETURN QUERY
    WITH schedule_enrolled AS (
        -- Socios con turno fijo activo para este horario
        SELECT 
            ce.class_schedule_id,
            ce.user_id,
            ce.student_id
        FROM public.class_enrollments ce
        WHERE ce.organization_id = v_caller_org
          AND ce.status = 'active'
    ),
    date_reservations AS (
        -- Reservas concretas para esta fecha
        SELECT 
            r.class_schedule_id,
            r.user_id,
            r.student_id,
            r.status
        FROM public.reservations r
        WHERE r.organization_id = v_caller_org
          AND r.class_date = p_date
    ),
    unified_attendees AS (
        -- Todos los que tienen turno semanal activo
        SELECT 
            se.class_schedule_id,
            se.user_id,
            se.student_id,
            COALESCE(dr.status, 'confirmed') AS effective_status
        FROM schedule_enrolled se
        LEFT JOIN date_reservations dr 
            ON dr.class_schedule_id = se.class_schedule_id
           AND (dr.user_id = se.user_id OR (se.student_id IS NOT NULL AND dr.student_id = se.student_id))

        UNION

        -- Más cualquier reserva puntual para esta fecha que no venga de un turno fijo
        SELECT 
            dr.class_schedule_id,
            dr.user_id,
            dr.student_id,
            dr.status AS effective_status
        FROM date_reservations dr
        WHERE NOT EXISTS (
            SELECT 1 FROM schedule_enrolled se
            WHERE se.class_schedule_id = dr.class_schedule_id
              AND (se.user_id = dr.user_id OR (dr.student_id IS NOT NULL AND se.student_id = dr.student_id))
        )
    ),
    stats AS (
        SELECT 
            ua.class_schedule_id,
            COUNT(*) FILTER (WHERE ua.effective_status = 'confirmed') AS confirmed_count,
            COUNT(*) FILTER (WHERE ua.effective_status = 'attended') AS attended_count,
            COUNT(*) FILTER (WHERE ua.effective_status = 'no_show') AS no_show_count,
            COUNT(*) FILTER (WHERE ua.effective_status = 'cancelled') AS cancelled_count
        FROM unified_attendees ua
        GROUP BY ua.class_schedule_id
    )
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
        cs.active AS schedule_active,
        ct.active AS class_type_active,
        COALESCE(s.confirmed_count, 0) AS confirmed_count,
        COALESCE(s.attended_count, 0) AS attended_count,
        COALESCE(s.no_show_count, 0) AS no_show_count,
        COALESCE(s.cancelled_count, 0) AS cancelled_count,
        CASE 
            WHEN cs.capacity IS NULL THEN NULL
            ELSE GREATEST(0, cs.capacity - COALESCE(s.confirmed_count, 0) - COALESCE(s.attended_count, 0))
        END AS available_spots
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN stats s ON s.class_schedule_id = cs.id
    WHERE cs.organization_id = v_caller_org
      AND cs.day_of_week = v_dow
    ORDER BY cs.start_time ASC, ct.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. CORREGIR RPC: get_class_attendees
-- Retorna de forma unificada tanto los inscriptos semanales fijos como las reservas individuales
CREATE OR REPLACE FUNCTION public.get_class_attendees(
    p_schedule_id UUID,
    p_class_date DATE
)
RETURNS TABLE (
    reservation_id UUID,
    user_id UUID,
    student_id UUID,
    status TEXT,
    created_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    notes TEXT,
    profile_full_name TEXT,
    profile_email TEXT,
    profile_phone TEXT,
    student_id_socio TEXT,
    student_nombre TEXT,
    student_telefono TEXT,
    student_membresia TEXT
) AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos administrativos o de profesor.';
    END IF;

    RETURN QUERY
    WITH weekly_enrolled AS (
        SELECT 
            ce.id AS enrollment_id,
            ce.user_id,
            ce.student_id,
            ce.created_at
        FROM public.class_enrollments ce
        WHERE ce.organization_id = v_caller_org
          AND ce.class_schedule_id = p_schedule_id
          AND ce.status = 'active'
    ),
    date_reservations AS (
        SELECT 
            r.id AS res_id,
            r.user_id,
            r.student_id,
            r.status,
            r.created_at,
            r.attended_at,
            r.cancelled_at,
            r.notes
        FROM public.reservations r
        WHERE r.organization_id = v_caller_org
          AND r.class_schedule_id = p_schedule_id
          AND r.class_date = p_class_date
    )
    -- 1. Alumnos con turno semanal activo
    SELECT 
        dr.res_id AS reservation_id,
        we.user_id,
        COALESCE(we.student_id, p.student_id) AS student_id,
        COALESCE(dr.status, 'confirmed') AS status,
        COALESCE(dr.created_at, we.created_at) AS created_at,
        dr.attended_at,
        dr.cancelled_at,
        COALESCE(dr.notes, 'Turno fijo semanal') AS notes,
        p.full_name AS profile_full_name,
        p.email AS profile_email,
        p.phone AS profile_phone,
        s.id_socio AS student_id_socio,
        s.nombre_completo AS student_nombre,
        s.telefono AS student_telefono,
        s.membresia AS student_membresia
    FROM weekly_enrolled we
    LEFT JOIN date_reservations dr 
        ON (dr.user_id = we.user_id OR (we.student_id IS NOT NULL AND dr.student_id = we.student_id))
    LEFT JOIN public.profiles p ON p.id = we.user_id
    LEFT JOIN public.students s ON s.id = COALESCE(we.student_id, p.student_id)

    UNION ALL

    -- 2. Reservas puntuales que no provengan de un turno semanal fijo
    SELECT 
        dr.res_id AS reservation_id,
        dr.user_id,
        COALESCE(dr.student_id, p.student_id) AS student_id,
        dr.status,
        dr.created_at,
        dr.attended_at,
        dr.cancelled_at,
        dr.notes,
        p.full_name AS profile_full_name,
        p.email AS profile_email,
        p.phone AS profile_phone,
        s.id_socio AS student_id_socio,
        s.nombre_completo AS student_nombre,
        s.telefono AS student_telefono,
        s.membresia AS student_membresia
    FROM date_reservations dr
    LEFT JOIN public.profiles p ON p.id = dr.user_id
    LEFT JOIN public.students s ON s.id = COALESCE(dr.student_id, p.student_id)
    WHERE NOT EXISTS (
        SELECT 1 FROM weekly_enrolled we
        WHERE we.user_id = dr.user_id OR (dr.student_id IS NOT NULL AND we.student_id = dr.student_id)
    )
    ORDER BY 
        CASE status 
            WHEN 'attended' THEN 1 
            WHEN 'confirmed' THEN 2 
            WHEN 'no_show' THEN 3 
            ELSE 4 
        END ASC,
        created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. CORREGIR RPC: approve_class_enrollment (Eliminar ON CONFLICT propenso a errores)
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

    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    v_first_date := v_now_arg + (((v_schedule.day_of_week - EXTRACT(DOW FROM v_now_arg)::int) + 7) % 7);

    FOR v_i IN 0..(GREATEST(p_weeks_ahead, 1) - 1) LOOP
        v_date := v_first_date + (v_i * 7);

        -- Verificar si ya existe una reserva activa para este alumno en esa fecha
        IF NOT EXISTS (
            SELECT 1 FROM public.reservations
            WHERE class_schedule_id = v_enr.class_schedule_id
              AND class_date = v_date
              AND (user_id = v_enr.user_id OR (v_enr.student_id IS NOT NULL AND student_id = v_enr.student_id))
              AND status IN ('confirmed', 'attended')
        ) THEN
            SELECT COUNT(*)::INTEGER INTO v_current_count
            FROM public.reservations
            WHERE class_schedule_id = v_enr.class_schedule_id
              AND class_date = v_date
              AND status IN ('confirmed', 'attended');

            IF v_current_count < v_schedule.capacity THEN
                INSERT INTO public.reservations (
                    organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, notes
                ) VALUES (
                    v_caller_org, v_enr.class_schedule_id, v_enr.class_type_id, v_enr.user_id, v_enr.student_id, v_date, 'confirmed', 'Turno fijo aprobado por el staff'
                );
                v_generated := v_generated + 1;
            ELSE
                v_skipped_full := v_skipped_full + 1;
            END IF;
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

-- 4. CORREGIR RPC: admin_assign_enrollment (Eliminar ON CONFLICT propenso a errores)
CREATE OR REPLACE FUNCTION public.admin_assign_enrollment(
    p_user_id UUID,
    p_schedule_id UUID,
    p_weeks_ahead INTEGER DEFAULT 26
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_target_org UUID;
    v_target_student_id UUID;
    v_schedule RECORD;
    v_enrollment_id UUID;
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
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para asignar turnos.');
    END IF;

    SELECT organization_id, student_id INTO v_target_org, v_target_student_id
    FROM public.profiles WHERE id = p_user_id AND role = 'cliente';

    IF v_target_org IS NULL OR v_target_org != v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Alumno no encontrado en tu organización.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.class_enrollments
        WHERE user_id = p_user_id AND class_schedule_id = p_schedule_id AND status IN ('pending', 'active')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este alumno ya tiene una solicitud o turno para este horario.');
    END IF;

    SELECT cs.*, ct.name AS class_name, ct.active AS class_active
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_caller_org
    FOR UPDATE;

    IF NOT FOUND OR NOT v_schedule.active OR NOT v_schedule.class_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario seleccionado no está disponible.');
    END IF;

    IF v_schedule.capacity IS NULL OR v_schedule.capacity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este horario todavía no tiene cupo definido. Definilo en "Gestionar Horarios" antes de asignar alumnos.');
    END IF;

    INSERT INTO public.class_enrollments (
        organization_id, user_id, student_id, class_schedule_id, class_type_id, status, decided_at, decided_by, decision_notes
    ) VALUES (
        v_caller_org, p_user_id, v_target_student_id, p_schedule_id, v_schedule.class_type_id, 'active',
        timezone('utc'::text, now()), auth.uid(), 'Asignado directamente por el staff'
    ) RETURNING id INTO v_enrollment_id;

    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    v_first_date := v_now_arg + (((v_schedule.day_of_week - EXTRACT(DOW FROM v_now_arg)::int) + 7) % 7);

    FOR v_i IN 0..(GREATEST(p_weeks_ahead, 1) - 1) LOOP
        v_date := v_first_date + (v_i * 7);

        IF NOT EXISTS (
            SELECT 1 FROM public.reservations
            WHERE class_schedule_id = p_schedule_id
              AND class_date = v_date
              AND (user_id = p_user_id OR (v_target_student_id IS NOT NULL AND student_id = v_target_student_id))
              AND status IN ('confirmed', 'attended')
        ) THEN
            SELECT COUNT(*)::INTEGER INTO v_current_count
            FROM public.reservations
            WHERE class_schedule_id = p_schedule_id
              AND class_date = v_date
              AND status IN ('confirmed', 'attended');

            IF v_current_count < v_schedule.capacity THEN
                INSERT INTO public.reservations (
                    organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, notes
                ) VALUES (
                    v_caller_org, p_schedule_id, v_schedule.class_type_id, p_user_id, v_target_student_id, v_date, 'confirmed', 'Turno fijo asignado directamente por el staff'
                );
                v_generated := v_generated + 1;
            ELSE
                v_skipped_full := v_skipped_full + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'enrollment_id', v_enrollment_id,
        'class_name', v_schedule.class_name,
        'reservations_generated', v_generated,
        'weeks_skipped_full', v_skipped_full
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. BACKFILL: Generar reservas para todas las inscripciones activas existentes
DO $$
DECLARE
    r_enr RECORD;
    v_now_arg DATE;
    v_first_date DATE;
    v_date DATE;
    v_i INTEGER;
    v_current_count INTEGER;
BEGIN
    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

    FOR r_enr IN 
        SELECT ce.*, cs.day_of_week, cs.capacity, cs.active AS sched_active
        FROM public.class_enrollments ce
        JOIN public.class_schedules cs ON cs.id = ce.class_schedule_id
        WHERE ce.status = 'active'
    LOOP
        v_first_date := v_now_arg + (((r_enr.day_of_week - EXTRACT(DOW FROM v_now_arg)::int) + 7) % 7);

        -- Generar reservas para las próximas 8 semanas si faltaban
        FOR v_i IN 0..7 LOOP
            v_date := v_first_date + (v_i * 7);

            IF NOT EXISTS (
                SELECT 1 FROM public.reservations
                WHERE class_schedule_id = r_enr.class_schedule_id
                  AND class_date = v_date
                  AND (user_id = r_enr.user_id OR (r_enr.student_id IS NOT NULL AND student_id = r_enr.student_id))
                  AND status IN ('confirmed', 'attended')
            ) THEN
                SELECT COUNT(*)::INTEGER INTO v_current_count
                FROM public.reservations
                WHERE class_schedule_id = r_enr.class_schedule_id
                  AND class_date = v_date
                  AND status IN ('confirmed', 'attended');

                IF r_enr.capacity IS NULL OR v_current_count < r_enr.capacity THEN
                    INSERT INTO public.reservations (
                        organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, notes
                    ) VALUES (
                        r_enr.organization_id, r_enr.class_schedule_id, r_enr.class_type_id, r_enr.user_id, r_enr.student_id, v_date, 'confirmed', 'Reserva generada automáticamente por turno activo'
                    );
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END $$;
