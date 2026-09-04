-- ==============================================================================
-- MIGRATION: 20260904000000_professor_attendance.sql
-- Permite que un profesor tome asistencia (presente / ausente) de los alumnos
-- anotados en sus clases, sin darle acceso a cobros, membresias ni al resto
-- del panel administrativo.
--
-- La asistencia vive en public.reservations (status attended / no_show /
-- confirmed), que es la misma tabla que ya usa el panel admin — asi ambos ven
-- exactamente lo mismo, sin un segundo registro paralelo que se desincronice.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Planilla del dia: clases de esa fecha + quien deberia ir + como quedo marcado
-- ------------------------------------------------------------------------------
-- La fuente de "quien deberia ir" son los turnos fijos activos
-- (class_enrollments.status = 'active') del horario, no las reservas: una
-- reserva puede no haberse generado todavia para esa fecha, y en ese caso el
-- profesor igual tiene que poder marcar al alumno.
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
        COALESCE(p.full_name, s.nombre_completo) AS attendee_name,
        COALESCE(p.phone, s.telefono_raw) AS attendee_phone,
        r.id AS reservation_id,
        -- Sin reserva generada todavia para esa fecha, el alumno cuenta como
        -- esperado ('confirmed') y el profesor puede marcarlo igual.
        COALESCE(r.status, 'confirmed') AS attendance_status
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    JOIN public.class_enrollments ce
        ON ce.class_schedule_id = cs.id
       AND ce.organization_id = v_org_id
       AND ce.status = 'active'
    LEFT JOIN public.profiles p ON p.id = ce.user_id
    LEFT JOIN public.students s ON s.id = ce.student_id
    -- LATERAL + LIMIT 1: un mismo alumno puede tener VARIAS reservas para el
    -- mismo horario y fecha (p. ej. una cancelada y una confirmada). Con un
    -- LEFT JOIN comun eso multiplica filas y el profesor ve a la misma persona
    -- dos o tres veces en la planilla. Se elige UNA sola, con esta precedencia:
    -- una marca explicita de asistencia gana, despues la confirmada, y por
    -- ultimo la cancelada.
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

-- ------------------------------------------------------------------------------
-- 2. Marcar presente / ausente / sin marcar
-- ------------------------------------------------------------------------------
-- Se identifica por (horario, fecha, alumno) en vez de por reservation_id
-- porque la reserva puede no existir aun: en ese caso se crea. Asi tomar
-- asistencia nunca queda bloqueado por una reserva que no se genero.
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

    -- El horario tiene que ser de la organizacion del que llama.
    SELECT cs.id, cs.class_type_id INTO v_schedule
    FROM public.class_schedules cs
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Horario inexistente');
    END IF;

    -- Misma precedencia que get_professor_day_roster, si no el profesor
    -- actualizaria una reserva distinta de la que esta viendo en pantalla y el
    -- estado marcado no se reflejaria.
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
