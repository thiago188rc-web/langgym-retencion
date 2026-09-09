-- Migration: Habilitar clase de Yoga Deportivo / Yoga los viernes a las 19:00 hs
-- day_of_week: 5 = Viernes, start_time: 19:00

DO $$
DECLARE
    r_org RECORD;
    v_yoga_id UUID;
BEGIN
    FOR r_org IN SELECT id FROM public.organizations LOOP
        -- 1. Buscar o registrar el tipo de clase 'Yoga' o 'Yoga Deportivo'
        SELECT id INTO v_yoga_id
        FROM public.class_types
        WHERE organization_id = r_org.id
          AND (LOWER(name) = 'yoga' OR LOWER(name) = 'yoga deportivo')
        LIMIT 1;

        IF v_yoga_id IS NULL THEN
            INSERT INTO public.class_types (organization_id, name, description, color, default_capacity, active)
            VALUES (r_org.id, 'Yoga Deportivo', 'Conexión cuerpo, mente y entrenamiento físico.', '#a855f7', NULL, true)
            RETURNING id INTO v_yoga_id;
        END IF;

        -- 2. Habilitar horario de la clase para el Viernes (5) a las 19:00 hs
        IF v_yoga_id IS NOT NULL THEN
            INSERT INTO public.class_schedules (organization_id, class_type_id, day_of_week, start_time, capacity, active)
            VALUES (r_org.id, v_yoga_id, 5, '19:00', NULL, true)
            ON CONFLICT (organization_id, class_type_id, day_of_week, start_time)
            DO UPDATE SET active = true;
        END IF;
    END LOOP;
END $$;
