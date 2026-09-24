-- ==============================================================================
-- MIGRATION: 20260924000000_fix_roster_sync_and_performance.sql
-- 
-- 1. Optimiza get_professor_day_roster para excluir alumnos cancelados/dados de baja
--    en la fecha consultada, garantizando que el profesor solo vea alumnos activos.
-- 2. Asegura que cancel_class_enrollment cancele reservas futuras tanto por user_id
--    como por student_id (alumnos particulares).
-- 3. Agrega índices estratégicos para agilizar consultas de reservas y sincronización.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: get_professor_day_roster OPTIMIZADA Y FILTRADA
-- ------------------------------------------------------------------------------
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
    WITH schedules_for_caller AS (
        SELECT 
            cs.id AS sched_id,
            ct.id AS ctype_id,
            ct.name AS c_name,
            ct.color AS c_color,
            cs.day_of_week AS d_dow,
            cs.start_time AS s_time,
            cs.end_time AS e_time,
            cs.capacity AS c_cap
        FROM public.class_schedules cs
        JOIN public.class_types ct ON ct.id = cs.class_type_id
        WHERE cs.organization_id = v_org_id
          AND cs.active = true
          AND ct.active = true
          AND cs.day_of_week = v_dow
          AND (v_role IN ('owner', 'admin', 'staff') OR cs.professor_id = auth.uid())
    ),
    weekly_enrolled AS (
        SELECT 
            ce.class_schedule_id,
            ce.user_id,
            ce.student_id,
            ce.created_at
        FROM public.class_enrollments ce
        JOIN schedules_for_caller sfc ON sfc.sched_id = ce.class_schedule_id
        WHERE ce.organization_id = v_org_id
          AND ce.status = 'active'
    ),
    date_reservations AS (
        SELECT 
            r.id AS res_id,
            r.class_schedule_id,
            r.user_id,
            r.student_id,
            r.status,
            r.created_at,
            r.attended_at,
            r.cancelled_at
        FROM public.reservations r
        JOIN schedules_for_caller sfc ON sfc.sched_id = r.class_schedule_id
        WHERE r.organization_id = v_org_id
          AND r.class_date = p_date
    ),
    unified_rows AS (
        -- 1. Alumnos con turno fijo semanal activo (que no hayan sido cancelados para esta fecha)
        SELECT 
            sfc.sched_id AS class_schedule_id,
            sfc.ctype_id AS class_type_id,
            sfc.c_name AS class_name,
            sfc.c_color AS class_color,
            sfc.d_dow AS day_of_week,
            sfc.s_time AS start_time,
            sfc.e_time AS end_time,
            sfc.c_cap AS capacity,
            COALESCE(we.user_id, p.id, s.id) AS user_id,
            COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(s.nombre_completo), ''), 'Alumno sin nombre') AS attendee_name,
            COALESCE(NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(s.telefono_raw), ''), NULLIF(TRIM(s.telefono), '')) AS attendee_phone,
            dr.res_id AS reservation_id,
            COALESCE(dr.status, 'confirmed') AS attendance_status,
            COALESCE(dr.created_at, we.created_at) AS sort_created_at
        FROM schedules_for_caller sfc
        JOIN weekly_enrolled we ON we.class_schedule_id = sfc.sched_id
        LEFT JOIN LATERAL (
            SELECT dr2.res_id, dr2.status, dr2.created_at
            FROM date_reservations dr2
            WHERE dr2.class_schedule_id = sfc.sched_id
              AND (
                  (we.user_id IS NOT NULL AND dr2.user_id = we.user_id) OR
                  (we.student_id IS NOT NULL AND dr2.student_id = we.student_id)
              )
            ORDER BY
                CASE dr2.status
                    WHEN 'attended' THEN 0
                    WHEN 'no_show' THEN 0
                    WHEN 'confirmed' THEN 1
                    ELSE 2
                END,
                dr2.created_at DESC
            LIMIT 1
        ) dr ON TRUE
        LEFT JOIN public.profiles p ON p.id = we.user_id
        LEFT JOIN public.students s ON s.id = COALESCE(we.student_id, p.student_id)
        WHERE (dr.status IS NULL OR dr.status != 'cancelled')

        UNION ALL

        -- 2. Reservas puntuales y particulares activas (excluyendo canceladas)
        SELECT 
            sfc.sched_id AS class_schedule_id,
            sfc.ctype_id AS class_type_id,
            sfc.c_name AS class_name,
            sfc.c_color AS class_color,
            sfc.d_dow AS day_of_week,
            sfc.s_time AS start_time,
            sfc.e_time AS end_time,
            sfc.c_cap AS capacity,
            COALESCE(dr.user_id, p.id, s.id) AS user_id,
            COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(s.nombre_completo), ''), 'Alumno sin nombre') AS attendee_name,
            COALESCE(NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(s.telefono_raw), ''), NULLIF(TRIM(s.telefono), '')) AS attendee_phone,
            dr.res_id AS reservation_id,
            dr.status AS attendance_status,
            dr.created_at AS sort_created_at
        FROM schedules_for_caller sfc
        JOIN (
            SELECT DISTINCT ON (
                r.class_schedule_id,
                COALESCE(r.user_id, p2.id, r.student_id)
            )
                r.id AS res_id,
                r.class_schedule_id,
                r.user_id,
                r.student_id,
                r.status,
                r.created_at
            FROM public.reservations r
            JOIN schedules_for_caller sfc2 ON sfc2.sched_id = r.class_schedule_id
            LEFT JOIN public.profiles p2 ON p2.student_id = r.student_id
            WHERE r.organization_id = v_org_id
              AND r.class_date = p_date
              AND r.status != 'cancelled'
            ORDER BY
                r.class_schedule_id,
                COALESCE(r.user_id, p2.id, r.student_id),
                CASE r.status
                    WHEN 'attended' THEN 0
                    WHEN 'no_show' THEN 0
                    WHEN 'confirmed' THEN 1
                    ELSE 2
                END,
                r.created_at DESC
        ) dr ON dr.class_schedule_id = sfc.sched_id
        LEFT JOIN public.profiles p ON p.id = dr.user_id
        LEFT JOIN public.students s ON s.id = COALESCE(dr.student_id, p.student_id)
        WHERE NOT EXISTS (
            SELECT 1 FROM weekly_enrolled we
            WHERE we.class_schedule_id = sfc.sched_id
              AND (
                  (dr.user_id IS NOT NULL AND we.user_id = dr.user_id) OR
                  (dr.student_id IS NOT NULL AND we.student_id = dr.student_id)
              )
        )
    )
    SELECT 
        ur.class_schedule_id,
        ur.class_type_id,
        ur.class_name,
        ur.class_color,
        ur.day_of_week,
        ur.start_time,
        ur.end_time,
        ur.capacity,
        ur.user_id,
        ur.attendee_name,
        ur.attendee_phone,
        ur.reservation_id,
        ur.attendance_status
    FROM unified_rows ur
    ORDER BY ur.start_time ASC, ur.class_name ASC, ur.attendee_name ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_professor_day_roster(DATE) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. RPC: cancel_class_enrollment SOPORTA user_id Y student_id
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
          AND (
            (v_enr.user_id IS NOT NULL AND user_id = v_enr.user_id) OR
            (v_enr.student_id IS NOT NULL AND student_id = v_enr.student_id)
          )
          AND class_date >= v_now_arg
          AND status = 'confirmed'
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER INTO v_cancelled_count FROM cancelled;

    RETURN jsonb_build_object('success', true, 'reservations_cancelled', v_cancelled_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cancel_class_enrollment(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ÍNDICES DE PERFORMANCE ESTRATÉGICOS
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_sched_date_status 
ON public.reservations(organization_id, class_schedule_id, class_date, status);

CREATE INDEX IF NOT EXISTS idx_students_org_socio_fast 
ON public.students(organization_id, id_socio);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_active_lookup
ON public.class_enrollments(organization_id, class_schedule_id, status);
