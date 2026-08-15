-- ==============================================================================
-- LANGGYM: SISTEMA DE CLASES, HORARIOS Y RESERVAS (MULTI-TENANT + RLS)
-- Migration: 20260815_classes_and_reservations.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENDER TABLA PROFILES (Sin alterar datos existentes)
-- ------------------------------------------------------------------------------

-- Permitir rol 'cliente' junto a los roles administrativos existentes
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('owner', 'admin', 'staff', 'cliente'));

-- Campo opcional para vincular el perfil con su ficha de socio en students
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id UUID 
    REFERENCES public.students(id) ON DELETE SET NULL;

-- Teléfono del perfil del usuario
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Índice para búsquedas rápidas por socio
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);

-- ------------------------------------------------------------------------------
-- 2. TABLA CLASS_TYPES (Actividades del gimnasio)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#22a058',
    default_capacity INTEGER CHECK (default_capacity IS NULL OR default_capacity > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_class_type_name_per_org UNIQUE (organization_id, name)
);

-- ------------------------------------------------------------------------------
-- 3. TABLA CLASS_SCHEDULES (Horarios semanales recurrentes)
-- ------------------------------------------------------------------------------
-- day_of_week: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
CREATE TABLE IF NOT EXISTS public.class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    class_type_id UUID NOT NULL REFERENCES public.class_types(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_schedule_slot UNIQUE (organization_id, class_type_id, day_of_week, start_time)
);

-- ------------------------------------------------------------------------------
-- 4. TABLA RESERVATIONS (Reservas individuales por fecha concreta)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    class_schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
    class_type_id UUID NOT NULL REFERENCES public.class_types(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    class_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' 
        CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    cancelled_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    notes TEXT
);

-- ------------------------------------------------------------------------------
-- 5. ÍNDICES DE RENDIMIENTO Y RESTRICCIÓN ANTI-DUPLICADOS
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_class_types_org ON public.class_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_org ON public.class_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_type ON public.class_schedules(class_type_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_day ON public.class_schedules(organization_id, day_of_week, active);
CREATE INDEX IF NOT EXISTS idx_reservations_org ON public.reservations(organization_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON public.reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_schedule_date ON public.reservations(class_schedule_id, class_date);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON public.reservations(organization_id, class_date);
CREATE INDEX IF NOT EXISTS idx_reservations_student ON public.reservations(student_id);

-- Restricción crítica: Un alumno NO puede tener más de una reserva activa para el mismo horario en la misma fecha
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_reservation_slot
ON public.reservations (organization_id, class_schedule_id, class_date, user_id)
WHERE (status = 'confirmed');

-- ------------------------------------------------------------------------------
-- 6. TRIGGERS AUTOMÁTICOS PARA updated_at
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_class_types_updated_at ON public.class_types;
CREATE TRIGGER update_class_types_updated_at
    BEFORE UPDATE ON public.class_types
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_class_schedules_updated_at ON public.class_schedules;
CREATE TRIGGER update_class_schedules_updated_at
    BEFORE UPDATE ON public.class_schedules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Class Types: Consulta para todos en la org; Modificación solo admin/staff
DROP POLICY IF EXISTS "class_types_select" ON public.class_types;
CREATE POLICY "class_types_select" ON public.class_types
    FOR SELECT USING (organization_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "class_types_insert" ON public.class_types;
CREATE POLICY "class_types_insert" ON public.class_types
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

DROP POLICY IF EXISTS "class_types_update" ON public.class_types;
CREATE POLICY "class_types_update" ON public.class_types
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

DROP POLICY IF EXISTS "class_types_delete" ON public.class_types;
CREATE POLICY "class_types_delete" ON public.class_types
    FOR DELETE USING (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

-- Class Schedules: Consulta para todos en la org; Modificación solo admin/staff
DROP POLICY IF EXISTS "class_schedules_select" ON public.class_schedules;
CREATE POLICY "class_schedules_select" ON public.class_schedules
    FOR SELECT USING (organization_id = public.get_auth_org_id());

DROP POLICY IF EXISTS "class_schedules_insert" ON public.class_schedules;
CREATE POLICY "class_schedules_insert" ON public.class_schedules
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

DROP POLICY IF EXISTS "class_schedules_update" ON public.class_schedules;
CREATE POLICY "class_schedules_update" ON public.class_schedules
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

DROP POLICY IF EXISTS "class_schedules_delete" ON public.class_schedules;
CREATE POLICY "class_schedules_delete" ON public.class_schedules
    FOR DELETE USING (
        organization_id = public.get_auth_org_id() AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
    );

-- Reservations:
-- SELECT: Clientes ven solo las suyas; Admin/Staff ven todas de la organización
DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
CREATE POLICY "reservations_select" ON public.reservations
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
        )
    );

-- INSERT: Usuario autenticado para sí mismo en su organización
DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
CREATE POLICY "reservations_insert" ON public.reservations
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
        )
    );

-- UPDATE: Cliente puede cancelar su propia reserva; Admin/Staff puede gestionar asistencia
DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
CREATE POLICY "reservations_update" ON public.reservations
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND (
            user_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin', 'staff'))
        )
    );

-- ------------------------------------------------------------------------------
-- 8. FUNCIONES RPC ATÓMICAS (Anti-Sobreventa Concurrente & Seguridad)
-- ------------------------------------------------------------------------------

-- Función 1: RESERVA ATÓMICA DE CLASE
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
BEGIN
    -- 1. Validar usuario autenticado
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    -- 2. Obtener organización, rol y socio vinculado
    SELECT organization_id, student_id, role
    INTO v_org_id, v_student_id, v_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil de usuario');
    END IF;

    -- 3. Bloqueo transaccional de fila sobre el horario para evitar condiciones de carrera (FOR UPDATE)
    SELECT cs.*, ct.name AS class_name, ct.active AS class_active
    INTO v_schedule
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    WHERE cs.id = p_schedule_id 
      AND cs.organization_id = v_org_id 
      AND cs.active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El horario seleccionado no existe o no se encuentra activo');
    END IF;

    IF NOT v_schedule.class_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'La actividad no está habilitada actualmente');
    END IF;

    -- 4. Validar cupo definido
    IF v_schedule.capacity IS NULL OR v_schedule.capacity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta clase aún no tiene cupo definido por el administrador');
    END IF;

    -- 5. Validar que el día de la semana coincida con la fecha
    v_dow := EXTRACT(DOW FROM p_class_date);
    IF v_dow != v_schedule.day_of_week THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha seleccionada no corresponde al día en que se dicta esta clase');
    END IF;

    -- 6. Validar que no sea una fecha pasada en horario de Argentina
    v_now_arg := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    IF p_class_date < v_now_arg THEN
        RETURN jsonb_build_object('success', false, 'error', 'No es posible reservar clases para fechas pasadas');
    END IF;

    -- 7. Validar duplicados para el mismo alumno
    IF EXISTS (
        SELECT 1 FROM public.reservations
        WHERE organization_id = v_org_id
          AND class_schedule_id = p_schedule_id
          AND class_date = p_class_date
          AND user_id = v_user_id
          AND status = 'confirmed'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya tenés una reserva confirmada para este horario');
    END IF;

    -- 8. Contar cupos confirmados de forma atómica bajo el bloqueo
    SELECT COUNT(*)::INTEGER INTO v_current_count
    FROM public.reservations
    WHERE organization_id = v_org_id
      AND class_schedule_id = p_schedule_id
      AND class_date = p_class_date
      AND status = 'confirmed';

    IF v_current_count >= v_schedule.capacity THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cupo completo. No quedan lugares disponibles para este horario.'
        );
    END IF;

    -- 9. Insertar la reserva
    INSERT INTO public.reservations (
        organization_id,
        class_schedule_id,
        class_type_id,
        user_id,
        student_id,
        class_date,
        status
    ) VALUES (
        v_org_id,
        p_schedule_id,
        v_schedule.class_type_id,
        v_user_id,
        v_student_id,
        p_class_date,
        'confirmed'
    ) RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'class_name', v_schedule.class_name,
        'start_time', v_schedule.start_time,
        'class_date', p_class_date,
        'spots_left', v_schedule.capacity - (v_current_count + 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función 2: CANCELACIÓN SEGURA DE RESERVA
CREATE OR REPLACE FUNCTION public.cancel_reservation(
    p_reservation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_role TEXT;
    v_res RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    SELECT organization_id, role INTO v_org_id, v_role
    FROM public.profiles WHERE id = v_user_id;

    SELECT * INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id AND organization_id = v_org_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada');
    END IF;

    -- Los clientes solo pueden cancelar sus propias reservas
    IF v_role = 'cliente' AND v_res.user_id != v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tenés permisos para cancelar esta reserva');
    END IF;

    IF v_res.status != 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'La reserva ya no se encuentra confirmada');
    END IF;

    UPDATE public.reservations
    SET status = 'cancelled',
        cancelled_at = timezone('utc'::text, now())
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función 3: OBTENER CLASES Y CUPOS DISPONIBLES POR FECHA
CREATE OR REPLACE FUNCTION public.get_available_classes_for_date(
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
    confirmed_reservations BIGINT,
    available_spots BIGINT,
    is_user_reserved BOOLEAN
) AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := public.get_auth_org_id();
    v_dow INTEGER := EXTRACT(DOW FROM p_date);
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
        COALESCE(r_stats.confirmed_count, 0) AS confirmed_reservations,
        CASE 
            WHEN cs.capacity IS NULL THEN NULL
            ELSE GREATEST(0, cs.capacity - COALESCE(r_stats.confirmed_count, 0))
        END AS available_spots,
        EXISTS (
            SELECT 1 FROM public.reservations r_user
            WHERE r_user.class_schedule_id = cs.id
              AND r_user.class_date = p_date
              AND r_user.user_id = v_user_id
              AND r_user.status = 'confirmed'
        ) AS is_user_reserved
    FROM public.class_schedules cs
    JOIN public.class_types ct ON ct.id = cs.class_type_id
    LEFT JOIN (
        SELECT class_schedule_id, COUNT(*) as confirmed_count
        FROM public.reservations
        WHERE class_date = p_date AND status = 'confirmed'
        GROUP BY class_schedule_id
    ) r_stats ON r_stats.class_schedule_id = cs.id
    WHERE cs.organization_id = v_org_id
      AND cs.active = true
      AND ct.active = true
      AND cs.day_of_week = v_dow
    ORDER BY cs.start_time ASC, ct.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 9. CARGA INICIAL DE ACTIVIDADES Y HORARIOS (PARA TODAS LAS ORGANIZACIONES)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r_org RECORD;
    v_func_id UUID;
    v_yoga_id UUID;
    v_flexi_id UUID;
    v_stretching_id UUID;
BEGIN
    FOR r_org IN SELECT id FROM public.organizations LOOP
        -- 1. ENTRENAMIENTO FUNCIONAL (Cupo: 30)
        INSERT INTO public.class_types (organization_id, name, description, color, default_capacity, active)
        VALUES (r_org.id, 'Entrenamiento Funcional', 'Circuito de fuerza, resistencia y agilidad.', '#22a058', 30, true)
        ON CONFLICT (organization_id, name) DO UPDATE SET default_capacity = 30
        RETURNING id INTO v_func_id;

        -- Horarios Funcional:
        -- Lunes (1): 08:00, 17:00, 18:00
        -- Martes (2): 17:00, 18:00
        -- Miércoles (3): 08:00, 17:00, 18:00
        -- Jueves (4): 17:00, 18:00
        -- Viernes (5): 08:00, 17:00, 18:00
        INSERT INTO public.class_schedules (organization_id, class_type_id, day_of_week, start_time, capacity)
        VALUES 
            (r_org.id, v_func_id, 1, '08:00', 30),
            (r_org.id, v_func_id, 1, '17:00', 30),
            (r_org.id, v_func_id, 1, '18:00', 30),
            (r_org.id, v_func_id, 2, '17:00', 30),
            (r_org.id, v_func_id, 2, '18:00', 30),
            (r_org.id, v_func_id, 3, '08:00', 30),
            (r_org.id, v_func_id, 3, '17:00', 30),
            (r_org.id, v_func_id, 3, '18:00', 30),
            (r_org.id, v_func_id, 4, '17:00', 30),
            (r_org.id, v_func_id, 4, '18:00', 30),
            (r_org.id, v_func_id, 5, '08:00', 30),
            (r_org.id, v_func_id, 5, '17:00', 30),
            (r_org.id, v_func_id, 5, '18:00', 30)
        ON CONFLICT (organization_id, class_type_id, day_of_week, start_time) 
        DO UPDATE SET capacity = 30;

        -- 2. YOGA (Cupo: NULL - Pendiente de confirmar por Admin)
        INSERT INTO public.class_types (organization_id, name, description, color, default_capacity, active)
        VALUES (r_org.id, 'Yoga', 'Conexión cuerpo, mente y respiración.', '#a855f7', NULL, true)
        ON CONFLICT (organization_id, name) DO NOTHING
        RETURNING id INTO v_yoga_id;

        IF v_yoga_id IS NULL THEN
            SELECT id INTO v_yoga_id FROM public.class_types WHERE organization_id = r_org.id AND name = 'Yoga';
        END IF;

        -- Horarios Yoga:
        -- Lunes (1): 08:00
        -- Miércoles (3): 08:00
        INSERT INTO public.class_schedules (organization_id, class_type_id, day_of_week, start_time, capacity)
        VALUES 
            (r_org.id, v_yoga_id, 1, '08:00', NULL),
            (r_org.id, v_yoga_id, 3, '08:00', NULL)
        ON CONFLICT (organization_id, class_type_id, day_of_week, start_time) DO NOTHING;

        -- 3. FLEXI-RUN (Cupo: NULL - Pendiente de confirmar por Admin)
        INSERT INTO public.class_types (organization_id, name, description, color, default_capacity, active)
        VALUES (r_org.id, 'Flexi-Run', 'Entrenamiento de flexibilidad y carrera progresiva.', '#0284c7', NULL, true)
        ON CONFLICT (organization_id, name) DO NOTHING
        RETURNING id INTO v_flexi_id;

        IF v_flexi_id IS NULL THEN
            SELECT id INTO v_flexi_id FROM public.class_types WHERE organization_id = r_org.id AND name = 'Flexi-Run';
        END IF;

        -- Horarios Flexi-Run:
        -- Lunes (1): 17:00, 18:00, 19:15
        -- Martes (2): 06:30, 18:00
        -- Miércoles (3): 17:00, 18:00, 19:15
        -- Jueves (4): 06:30, 18:00
        -- Sábado (6): 10:30, 11:30
        INSERT INTO public.class_schedules (organization_id, class_type_id, day_of_week, start_time, capacity)
        VALUES 
            (r_org.id, v_flexi_id, 1, '17:00', NULL),
            (r_org.id, v_flexi_id, 1, '18:00', NULL),
            (r_org.id, v_flexi_id, 1, '19:15', NULL),
            (r_org.id, v_flexi_id, 2, '06:30', NULL),
            (r_org.id, v_flexi_id, 2, '18:00', NULL),
            (r_org.id, v_flexi_id, 3, '17:00', NULL),
            (r_org.id, v_flexi_id, 3, '18:00', NULL),
            (r_org.id, v_flexi_id, 3, '19:15', NULL),
            (r_org.id, v_flexi_id, 4, '06:30', NULL),
            (r_org.id, v_flexi_id, 4, '18:00', NULL),
            (r_org.id, v_flexi_id, 6, '10:30', NULL),
            (r_org.id, v_flexi_id, 6, '11:30', NULL)
        ON CONFLICT (organization_id, class_type_id, day_of_week, start_time) DO NOTHING;

        -- 4. STRETCHING (Cupo: 15)
        INSERT INTO public.class_types (organization_id, name, description, color, default_capacity, active)
        VALUES (r_org.id, 'Stretching', 'Elongación muscular profunda y movilidad articular.', '#eab308', 15, true)
        ON CONFLICT (organization_id, name) DO UPDATE SET default_capacity = 15
        RETURNING id INTO v_stretching_id;

        -- Horarios Stretching:
        -- Martes (2): 09:00, 19:00
        -- Jueves (4): 09:00, 19:00
        INSERT INTO public.class_schedules (organization_id, class_type_id, day_of_week, start_time, capacity)
        VALUES 
            (r_org.id, v_stretching_id, 2, '09:00', 15),
            (r_org.id, v_stretching_id, 2, '19:00', 15),
            (r_org.id, v_stretching_id, 4, '09:00', 15),
            (r_org.id, v_stretching_id, 4, '19:00', 15)
        ON CONFLICT (organization_id, class_type_id, day_of_week, start_time) 
        DO UPDATE SET capacity = 15;

    END LOOP;
END;
$$ LANGUAGE plpgsql;
