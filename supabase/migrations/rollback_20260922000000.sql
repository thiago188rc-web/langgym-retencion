-- ==============================================================================
-- ROLLBACK SCRIPT: rollback_20260922000000.sql
-- Restaura el esquema y funciones al estado previo exacto a la migración 20260922000000
-- ==============================================================================

-- 1. Restaurar policy de class_schedules
DROP POLICY IF EXISTS "class_schedules_select" ON public.class_schedules;
CREATE POLICY "class_schedules_select" ON public.class_schedules
    FOR SELECT USING (organization_id = public.get_auth_org_id());

-- 2. Eliminar RPC admin_assign_professor_to_schedule
DROP FUNCTION IF EXISTS public.admin_assign_professor_to_schedule(UUID, UUID);

-- 3. Restaurar get_professor_day_roster previa (migración 20260904010000)
CREATE OR REPLACE FUNCTION public.get_professor_day_roster(p_date DATE)
RETURNS TABLE (
    class_schedule_id UUID,
    class_type_id UUID,
    class_name TEXT,
    class_color TEXT,
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    capacity INTEGER,
    user_id UUID,
    attendee_name TEXT,
    attendee_phone TEXT,
    reservation_id UUID,
    attendance_status TEXT
) AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
    v_dow INTEGER := EXTRACT(DOW FROM p_date);
BEGIN
    SELECT organization_id, role INTO v_org_id, v_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    RETURN QUERY
    SELECT
        cs.id,
        ct.id,
        ct.name,
        ct.color,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.capacity,
        ce.user_id,
        NULLIF(TRIM(p.full_name), '') AS attendee_name,
        NULLIF(TRIM(p.phone), '') AS attendee_phone,
        r.id AS reservation_id,
        COALESCE(r.status, 'confirmed') AS attendance_status
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    JOIN public.class_enrollments ce
        ON ce.class_schedule_id = cs.id
       AND ce.organization_id = v_org_id
       AND ce.status = 'active'
    JOIN public.profiles p ON p.id = ce.user_id
    LEFT JOIN LATERAL (
        SELECT r2.id, r2.status
        FROM public.reservations r2
        WHERE r2.class_schedule_id = cs.id
          AND r2.class_date = p_date
          AND r2.user_id = ce.user_id
          AND r2.organization_id = v_org_id
        ORDER BY
            CASE r2.status
                WHEN 'attended' THEN 0
                WHEN 'no_show' THEN 0
                WHEN 'confirmed' THEN 1
                ELSE 2
            END,
            r2.created_at DESC
        LIMIT 1
    ) r ON TRUE
    WHERE cs.organization_id = v_org_id
      AND cs.active = true
      AND ct.active = true
      AND cs.day_of_week = v_dow
    ORDER BY cs.start_time ASC, ct.name ASC, attendee_name ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_professor_day_roster(DATE) TO authenticated;

-- 4. Restaurar get_professor_class_roster previa (migración 20260904010000)
CREATE OR REPLACE FUNCTION public.get_professor_class_roster()
RETURNS TABLE (
    class_schedule_id UUID,
    class_type_id UUID,
    class_name TEXT,
    class_color TEXT,
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    capacity INTEGER,
    enrollment_id UUID,
    enrolled_name TEXT,
    enrolled_phone TEXT,
    enrollment_status TEXT
) AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
BEGIN
    SELECT organization_id, role INTO v_org_id, v_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    RETURN QUERY
    SELECT
        cs.id AS class_schedule_id,
        ct.id AS class_type_id,
        ct.name AS class_name,
        ct.color AS class_color,
        cs.day_of_week,
        cs.start_time,
        cs.end_time,
        cs.capacity,
        ce.id AS enrollment_id,
        NULLIF(TRIM(p.full_name), '') AS enrolled_name,
        NULLIF(TRIM(p.phone), '') AS enrolled_phone,
        ce.status AS enrollment_status
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN public.class_enrollments ce
        ON ce.class_schedule_id = cs.id
       AND ce.organization_id = v_org_id
       AND ce.status IN ('pending', 'active')
    LEFT JOIN public.profiles p ON p.id = ce.user_id
    WHERE cs.organization_id = v_org_id
      AND cs.active = true
      AND ct.active = true
    ORDER BY cs.day_of_week ASC, cs.start_time ASC, enrolled_name ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_professor_class_roster() TO authenticated;

-- 5. Restaurar professor_mark_attendance previa (migración 20260904000000)
CREATE OR REPLACE FUNCTION public.professor_mark_attendance(
    p_schedule_id UUID,
    p_class_date DATE,
    p_user_id UUID,
    p_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
    v_schedule RECORD;
    v_reservation_id UUID;
    v_student_id UUID;
BEGIN
    SELECT organization_id, role INTO v_org_id, v_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
    END IF;

    IF p_status NOT IN ('attended', 'no_show', 'confirmed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado invalido');
    END IF;

    SELECT cs.id, cs.class_type_id INTO v_schedule
    FROM public.class_schedules cs
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Horario inexistente');
    END IF;

    SELECT r.id INTO v_reservation_id
    FROM public.reservations r
    WHERE r.organization_id = v_org_id
      AND r.class_schedule_id = p_schedule_id
      AND r.class_date = p_class_date
      AND r.user_id = p_user_id
    ORDER BY
        CASE r.status
            WHEN 'attended' THEN 0
            WHEN 'no_show' THEN 0
            WHEN 'confirmed' THEN 1
            ELSE 2
        END,
        r.created_at DESC
    LIMIT 1;

    IF v_reservation_id IS NOT NULL THEN
        UPDATE public.reservations
        SET status = p_status,
            attended_at = CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END,
            cancelled_at = NULL
        WHERE id = v_reservation_id;
    ELSE
        SELECT ce.student_id INTO v_student_id
        FROM public.class_enrollments ce
        WHERE ce.organization_id = v_org_id
          AND ce.class_schedule_id = p_schedule_id
          AND ce.user_id = p_user_id
          AND ce.status = 'active'
        LIMIT 1;

        INSERT INTO public.reservations (
            organization_id, class_schedule_id, class_type_id, user_id,
            student_id, class_date, status, attended_at
        ) VALUES (
            v_org_id, p_schedule_id, v_schedule.class_type_id, p_user_id,
            v_student_id, p_class_date, p_status,
            CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END
        )
        RETURNING id INTO v_reservation_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.professor_mark_attendance(UUID, DATE, UUID, TEXT) TO authenticated;

-- 6. Restaurar admin_update_attendance previa (2 parámetros)
DROP FUNCTION IF EXISTS public.admin_update_attendance(UUID, TEXT, UUID, DATE, UUID, UUID);

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
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes.');
    END IF;

    SELECT * INTO v_res FROM public.reservations
    WHERE id = p_reservation_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada.');
    END IF;

    UPDATE public.reservations
    SET status = p_status,
        attended_at = CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE attended_at END,
        cancelled_at = CASE WHEN p_status = 'cancelled' THEN timezone('utc'::text, now()) ELSE cancelled_at END
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_update_attendance(UUID, TEXT) TO authenticated;

-- 7. Eliminar índice y columna professor_id
DROP INDEX IF EXISTS public.idx_class_schedules_professor;
ALTER TABLE public.class_schedules DROP COLUMN IF EXISTS professor_id;
