-- ==============================================================================
-- MIGRATION: 20260904010000_professor_panel_accounts_only.sql
--
-- El panel de profesores pasa a depender UNICAMENTE de las cuentas
-- registradas (profiles) que eligieron turno, sin ninguna lectura de la tabla
-- `students` (el padron que se importa por Excel). Son dos circuitos
-- distintos: el Excel alimenta retencion/cobros del panel admin, y las
-- cuentas registradas alimentan las clases.
--
-- Antes el nombre y el telefono hacian COALESCE contra students como
-- respaldo. Verificado contra produccion: de 73 personas con turno activo, 0
-- dependian de ese respaldo para el nombre y 0 para el telefono — era codigo
-- muerto que solo acoplaba los dos circuitos.
--
-- Nota: reservations.student_id se sigue completando en
-- professor_mark_attendance. Eso NO es mezclar el Excel en el panel (el
-- profesor nunca lo ve): es la misma columna que ya completa el flujo de
-- aprobacion de turnos, y dejarla vacia haria que las reservas creadas por un
-- profesor quedaran inconsistentes con el resto del sistema.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Planilla del dia — solo cuentas registradas
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
    -- Una sola reserva por alumno: una marca explicita gana, luego la
    -- confirmada, y por ultimo la cancelada. Sin esto, quien tiene varias
    -- reservas para la misma fecha aparece duplicado en la planilla.
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
-- 2. Vista semanal — solo cuentas registradas
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
