-- ==============================================================================
-- MIGRATION: 20260815_admin_class_management.sql
-- RPC functions for Administrative Class & Reservation Management (Staff/Admin)
-- ==============================================================================

-- 1. RPC: ADMIN OBTENER CLASES Y ESTADÍSTICAS POR FECHA
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

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos administrativos.';
    END IF;

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
        cs.active AS schedule_active,
        ct.active AS class_type_active,
        COALESCE(r_stats.confirmed_count, 0) AS confirmed_count,
        COALESCE(r_stats.attended_count, 0) AS attended_count,
        COALESCE(r_stats.no_show_count, 0) AS no_show_count,
        COALESCE(r_stats.cancelled_count, 0) AS cancelled_count,
        CASE 
            WHEN cs.capacity IS NULL THEN NULL
            ELSE GREATEST(0, cs.capacity - COALESCE(r_stats.confirmed_count, 0) - COALESCE(r_stats.attended_count, 0))
        END AS available_spots
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN (
        SELECT 
            class_schedule_id, 
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
            COUNT(*) FILTER (WHERE status = 'attended') AS attended_count,
            COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count
        FROM public.reservations
        WHERE class_date = p_date
        GROUP BY class_schedule_id
    ) r_stats ON r_stats.class_schedule_id = cs.id
    WHERE cs.organization_id = v_caller_org
      AND cs.day_of_week = v_dow
    ORDER BY cs.start_time ASC, ct.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. RPC: OBTENER LISTA DE INSCRIPTOS PARA UN HORARIO Y FECHA
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

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos administrativos.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id AS reservation_id,
        r.user_id,
        r.student_id,
        r.status,
        r.created_at,
        r.attended_at,
        r.cancelled_at,
        r.notes,
        p.full_name AS profile_full_name,
        p.email AS profile_email,
        p.phone AS profile_phone,
        s.id_socio AS student_id_socio,
        s.nombre_completo AS student_nombre,
        s.telefono AS student_telefono,
        s.membresia AS student_membresia
    FROM public.reservations r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.students s ON s.id = r.student_id
    WHERE r.organization_id = v_caller_org
      AND r.class_schedule_id = p_schedule_id
      AND r.class_date = p_class_date
    ORDER BY 
        CASE r.status 
            WHEN 'attended' THEN 1 
            WHEN 'confirmed' THEN 2 
            WHEN 'no_show' THEN 3 
            ELSE 4 
        END ASC,
        r.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. RPC: REGISTRAR ASISTENCIA (PRESENTE / AUSENTE / RESTABLECER)
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

-- 4. RPC: RESERVA MANUAL ADMINISTRATIVA CON ANTI-SOBREVENTA
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
BEGIN
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para realizar reservas administrativas.');
    END IF;

    -- Si no se pasó user_id explícito pero hay student_id, buscar si tiene profile
    IF v_effective_user_id IS NULL AND p_student_id IS NOT NULL THEN
        SELECT id INTO v_effective_user_id FROM public.profiles 
        WHERE student_id = p_student_id AND organization_id = v_caller_org LIMIT 1;
    END IF;

    -- Si aún no tiene perfil, usar el usuario del admin que realiza la reserva
    IF v_effective_user_id IS NULL THEN
        v_effective_user_id := auth.uid();
    END IF;

    -- Bloqueo FOR UPDATE sobre el horario
    SELECT cs.*, ct.name AS class_name
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id AND cs.organization_id = v_caller_org
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario no existe.');
    END IF;

    IF v_schedule.capacity IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta clase aún no tiene cupo definido.');
    END IF;

    -- Contar reservas activas
    SELECT COUNT(*)::INTEGER INTO v_current_count
    FROM public.reservations
    WHERE organization_id = v_caller_org
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND status IN ('confirmed', 'attended');

    IF v_current_count >= v_schedule.capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cupo completo. No quedan lugares disponibles.');
    END IF;

    -- Insertar reserva
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
        p_student_id,
        p_class_date,
        'confirmed',
        'Reserva manual ingresada por administración'
    ) RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'spots_left', v_schedule.capacity - (v_current_count + 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: ACTUALIZAR CUPO DE UN HORARIO
CREATE OR REPLACE FUNCTION public.admin_update_schedule_capacity(
    p_schedule_id UUID,
    p_capacity INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
BEGIN
    IF p_capacity IS NOT NULL AND p_capacity < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El cupo debe ser mayor a cero.');
    END IF;

    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes.');
    END IF;

    UPDATE public.class_schedules
    SET capacity = p_capacity,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_schedule_id AND organization_id = v_caller_org;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Horario no encontrado.');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
