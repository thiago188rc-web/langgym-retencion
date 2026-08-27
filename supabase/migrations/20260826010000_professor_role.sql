-- ==============================================================================
-- MIGRATION: 20260826010000_professor_role.sql
-- Rol "profesor": panel de solo lectura para ver las actividades del
-- gimnasio y quién está anotado en cada una, sin acceso a cobros, alumnos,
-- importación ni configuración (eso queda reservado a owner/admin/staff).
-- ==============================================================================

-- 1. Permitir el rol 'profesor' en profiles.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('owner', 'admin', 'staff', 'cliente', 'profesor'));

-- 2. RPC de solo lectura: horarios activos de la organización + quién está
-- anotado (turno activo/pendiente) en cada uno. Devuelve únicamente nombre,
-- teléfono y estado — nunca cuota/membresía/vencimiento — así un profesor
-- no tiene visibilidad sobre datos de cobro aunque pueda ver el roster.
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
        COALESCE(p.full_name, s.nombre_completo) AS enrolled_name,
        COALESCE(p.phone, s.telefono_raw) AS enrolled_phone,
        ce.status AS enrollment_status
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN public.class_enrollments ce
        ON ce.class_schedule_id = cs.id
       AND ce.organization_id = v_org_id
       AND ce.status IN ('pending', 'active')
    LEFT JOIN public.profiles p ON p.id = ce.user_id
    LEFT JOIN public.students s ON s.id = ce.student_id
    WHERE cs.organization_id = v_org_id
      AND cs.active = true
      AND ct.active = true
    ORDER BY cs.day_of_week ASC, cs.start_time ASC, enrolled_name ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_professor_class_roster() TO authenticated;
