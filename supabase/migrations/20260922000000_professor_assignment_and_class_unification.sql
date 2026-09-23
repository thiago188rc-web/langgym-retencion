-- ==============================================================================
-- MIGRATION: 20260922000000_professor_assignment_and_class_unification.sql
-- 
-- 1. Agrega asignación de profesor a horarios (class_schedules.professor_id).
-- 2. Protege RLS para que los profesores solo consulten sus clases asignadas
--    y los clientes solo horarios activos.
-- 3. Unifica la visualización de alumnos en get_professor_day_roster
--    y get_professor_class_roster (turnos fijos + reservas puntuales/particulares + padrón).
-- 4. Protege el marcado de asistencia para que un profesor no pueda marcar en clases ajenas.
-- 5. Sincroniza la asistencia tomada por profesor con students.ultima_asistencia.
-- 6. Corrige admin_update_attendance (elimina sobrecarga previa de 2 parámetros,
--    crea reservas al vuelo si faltaban y sincroniza students.ultima_asistencia).
-- 7. Asigna inicialmente los horarios activos al profesor existente profes@langgym.com.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MODIFICAR TABLA CLASS_SCHEDULES (Asignación de Profesor)
-- ------------------------------------------------------------------------------
ALTER TABLE public.class_schedules 
ADD COLUMN IF NOT EXISTS professor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_schedules_professor 
ON public.class_schedules(organization_id, professor_id);

-- Asignación inicial controlada para los horarios activos existentes de Lang Gym
UPDATE public.class_schedules
SET professor_id = '77dc9cbc-c71c-4387-abb3-82dcd19c207b'
WHERE organization_id = '8d1d8291-05aa-4449-9923-2cab5835a74b'
  AND active = true
  AND professor_id IS NULL;

-- ------------------------------------------------------------------------------
-- 2. POLÍTICA RLS ESTRICTA PARA CLASS_SCHEDULES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "class_schedules_select" ON public.class_schedules;
CREATE POLICY "class_schedules_select" ON public.class_schedules
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            public.is_admin_or_staff() OR 
            (
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'profesor')
                AND professor_id = auth.uid()
            ) OR (
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'cliente')
                AND active = true
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 3. RPC: ADMIN ASIGNA O DESASIGNA PROFESOR A UN HORARIO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_professor_to_schedule(
    p_schedule_id UUID,
    p_professor_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_target_prof_org UUID;
    v_target_prof_role TEXT;
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para asignar profesores a clases.');
    END IF;

    -- Si se especifica un profesor, verificar que pertenezca a la misma org y sea profesor/admin/staff
    IF p_professor_id IS NOT NULL THEN
        SELECT organization_id, role INTO v_target_prof_org, v_target_prof_role
        FROM public.profiles WHERE id = p_professor_id;

        IF v_target_prof_org IS NULL OR v_target_prof_org != v_caller_org THEN
            RETURN jsonb_build_object('success', false, 'error', 'El profesor seleccionado no pertenece a tu organización.');
        END IF;

        IF v_target_prof_role NOT IN ('profesor', 'admin', 'staff', 'owner') THEN
            RETURN jsonb_build_object('success', false, 'error', 'El usuario seleccionado no tiene rol de profesor o staff.');
        END IF;
    END IF;

    UPDATE public.class_schedules
    SET professor_id = p_professor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_schedule_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Horario no encontrado en tu organización.');
    END IF;

    RETURN jsonb_build_object('success', true, 'schedule_id', p_schedule_id, 'professor_id', p_professor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.admin_assign_professor_to_schedule(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: PLANILLA DEL DÍA UNIFICADA PARA PROFESOR (CON FILTRO ESTRICTO DE PROFESOR)
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
          -- Aislamiento estricto: el profesor SOLO ve las clases asignadas a él
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
        -- 1. Alumnos con turno fijo semanal activo
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

        UNION ALL

        -- 2. Reservas puntuales y particulares que no tengan turno fijo semanal
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
            -- Deduplicar reservas para la misma persona en este horario
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
-- 5. RPC: VISTA SEMANAL PARA PROFESOR (CON FILTRO ESTRICTO DE PROFESOR)
-- ------------------------------------------------------------------------------
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
        COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(s.nombre_completo), ''), 'Alumno sin nombre') AS enrolled_name,
        COALESCE(NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(s.telefono_raw), ''), NULLIF(TRIM(s.telefono), '')) AS enrolled_phone,
        ce.status AS enrollment_status
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN public.class_enrollments ce
        ON ce.class_schedule_id = cs.id
       AND ce.organization_id = v_org_id
       AND ce.status IN ('pending', 'active')
    LEFT JOIN public.profiles p ON p.id = ce.user_id
    LEFT JOIN public.students s ON s.id = COALESCE(ce.student_id, p.student_id)
    WHERE cs.organization_id = v_org_id
      AND cs.active = true
      AND ct.active = true
      AND (v_role IN ('owner', 'admin', 'staff') OR cs.professor_id = auth.uid())
    ORDER BY cs.day_of_week ASC, cs.start_time ASC, enrolled_name ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_professor_class_roster() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: PROFESOR MARCA ASISTENCIA (VALIDACIÓN DE ASIGNACIÓN + SYNC RETENCIÓN)
-- ------------------------------------------------------------------------------
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
    v_effective_user_id UUID := NULL;
    v_effective_student_id UUID := NULL;
BEGIN
    SELECT organization_id, role INTO v_org_id, v_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_role NOT IN ('owner', 'admin', 'staff', 'profesor') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
    END IF;

    IF p_status NOT IN ('attended', 'no_show', 'confirmed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado invalido');
    END IF;

    -- El horario tiene que existir en la organización y, si es profesor, DEBE estarle asignado
    SELECT cs.id, cs.class_type_id, cs.professor_id INTO v_schedule
    FROM public.class_schedules cs
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Horario inexistente');
    END IF;

    IF v_role = 'profesor' AND (v_schedule.professor_id IS NULL OR v_schedule.professor_id != auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autorizado para gestionar asistencia en esta clase.');
    END IF;

    -- Resolver si p_user_id corresponde a profiles o a students
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND organization_id = v_org_id) THEN
        v_effective_user_id := p_user_id;
        SELECT student_id INTO v_effective_student_id FROM public.profiles WHERE id = p_user_id;
    ELSIF EXISTS (SELECT 1 FROM public.students WHERE id = p_user_id AND organization_id = v_org_id) THEN
        v_effective_student_id := p_user_id;
        SELECT id INTO v_effective_user_id FROM public.profiles WHERE student_id = p_user_id AND organization_id = v_org_id LIMIT 1;
    END IF;

    -- Si aún falta student_id, intentar buscarlo en class_enrollments
    IF v_effective_student_id IS NULL AND v_effective_user_id IS NOT NULL THEN
        SELECT ce.student_id INTO v_effective_student_id
        FROM public.class_enrollments ce
        WHERE ce.organization_id = v_org_id
          AND ce.class_schedule_id = p_schedule_id
          AND ce.user_id = v_effective_user_id
        LIMIT 1;
    END IF;

    -- Buscar reserva previa para este horario, fecha y alumno
    SELECT r.id INTO v_reservation_id
    FROM public.reservations r
    WHERE r.organization_id = v_org_id
      AND r.class_schedule_id = p_schedule_id
      AND r.class_date = p_class_date
      AND (
          (v_effective_user_id IS NOT NULL AND r.user_id = v_effective_user_id) OR
          (v_effective_student_id IS NOT NULL AND r.student_id = v_effective_student_id)
      )
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
        INSERT INTO public.reservations (
            organization_id, class_schedule_id, class_type_id, user_id,
            student_id, class_date, status, attended_at
        ) VALUES (
            v_org_id, p_schedule_id, v_schedule.class_type_id, v_effective_user_id,
            v_effective_student_id, p_class_date, p_status,
            CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END
        )
        RETURNING id INTO v_reservation_id;
    END IF;

    -- SINCRONIZACIÓN CON RETENCIÓN: Si se marca presente, actualizar students.ultima_asistencia
    -- Usar GREATEST para nunca retroceder la fecha de última asistencia si ya tenía una posterior
    IF p_status = 'attended' AND v_effective_student_id IS NOT NULL THEN
        UPDATE public.students
        SET ultima_asistencia = GREATEST(COALESCE(ultima_asistencia, '-infinity'::timestamptz), p_class_date::timestamptz + interval '12 hours')
        WHERE id = v_effective_student_id AND organization_id = v_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.professor_mark_attendance(UUID, DATE, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. RPC: ADMIN ACTUALIZA ASISTENCIA (IDEMPOTENTE Y CREA RESERVA SI NO EXISTÍA)
-- ------------------------------------------------------------------------------
-- Eliminar explícitamente la sobrecarga anterior de 2 parámetros para evitar conflictos
DROP FUNCTION IF EXISTS public.admin_update_attendance(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_attendance(
    p_reservation_id UUID,
    p_status TEXT,
    p_schedule_id UUID DEFAULT NULL,
    p_class_date DATE DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_student_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_res RECORD;
    v_effective_res_id UUID := p_reservation_id;
    v_schedule RECORD;
    v_eff_student_id UUID := p_student_id;
    v_eff_user_id UUID := p_user_id;
BEGIN
    IF p_status NOT IN ('confirmed', 'attended', 'no_show', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de asistencia inválido.');
    END IF;

    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para registrar asistencia.');
    END IF;

    -- 1. Si no vino reservation_id o es nulo, intentar ubicarla o crearla al vuelo
    IF v_effective_res_id IS NULL AND p_schedule_id IS NOT NULL AND p_class_date IS NOT NULL THEN
        SELECT r.id, r.student_id, r.user_id INTO v_res
        FROM public.reservations r
        WHERE r.organization_id = v_caller_org
          AND r.class_schedule_id = p_schedule_id
          AND r.class_date = p_class_date
          AND (
              (p_user_id IS NOT NULL AND r.user_id = p_user_id) OR
              (p_student_id IS NOT NULL AND r.student_id = p_student_id)
          )
        LIMIT 1;

        IF v_res.id IS NOT NULL THEN
            v_effective_res_id := v_res.id;
            v_eff_student_id := COALESCE(v_res.student_id, p_student_id);
            v_eff_user_id := COALESCE(v_res.user_id, p_user_id);
        ELSE
            -- Obtener class_type_id
            SELECT cs.id, cs.class_type_id INTO v_schedule
            FROM public.class_schedules cs
            WHERE cs.id = p_schedule_id AND cs.organization_id = v_caller_org;

            IF v_schedule.id IS NOT NULL THEN
                INSERT INTO public.reservations (
                    organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, attended_at
                ) VALUES (
                    v_caller_org, p_schedule_id, v_schedule.class_type_id, p_user_id, p_student_id, p_class_date, p_status,
                    CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END
                ) RETURNING id INTO v_effective_res_id;

                v_eff_student_id := p_student_id;
            END IF;
        END IF;
    END IF;

    -- 2. Si tenemos reservation_id, actualizar
    IF v_effective_res_id IS NOT NULL THEN
        SELECT * INTO v_res FROM public.reservations
        WHERE id = v_effective_res_id AND organization_id = v_caller_org;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada.');
        END IF;

        UPDATE public.reservations
        SET status = p_status,
            attended_at = CASE WHEN p_status = 'attended' THEN timezone('utc'::text, now()) ELSE NULL END,
            cancelled_at = CASE WHEN p_status = 'cancelled' THEN timezone('utc'::text, now()) ELSE NULL END
        WHERE id = v_effective_res_id;

        v_eff_student_id := COALESCE(v_res.student_id, v_eff_student_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'No se pudo identificar la reserva para registrar asistencia.');
    END IF;

    -- Sincronizar retención con students.ultima_asistencia
    -- Usar GREATEST para nunca retroceder la fecha de última asistencia
    IF p_status = 'attended' AND v_eff_student_id IS NOT NULL THEN
        UPDATE public.students
        SET ultima_asistencia = GREATEST(COALESCE(ultima_asistencia, '-infinity'::timestamptz), COALESCE(p_class_date::timestamptz + interval '12 hours', timezone('utc'::text, now())))
        WHERE id = v_eff_student_id AND organization_id = v_caller_org;
    END IF;

    RETURN jsonb_build_object('success', true, 'reservation_id', v_effective_res_id, 'status', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.admin_update_attendance(UUID, TEXT, UUID, DATE, UUID, UUID) TO authenticated;
