-- ==============================================================================
-- MIGRATION: 20260821000000_multi_turno_free_days.sql
-- Pasa el modelo de "un turno fijo por alumno" a "varios turnos fijos libres
-- por alumno" (lunes a sábado, tantos días como el alumno quiera: 1, 3, 6...).
--
-- Se mantiene intacta la aprobación manual del staff (para poder verificar
-- el pago antes de confirmar) y se mantiene la regla de "por única vez": el
-- alumno elige TODOS sus horarios semanales en un solo paso irreversible.
-- Una vez que hizo esa elección (tiene aunque sea una solicitud pendiente o
-- un turno activo), no puede volver a solicitar horarios por su cuenta desde
-- la app nunca más — cualquier cambio futuro lo pide por WhatsApp y lo
-- resuelve el staff, liberando un turno existente (ya existía) y/o
-- asignando uno nuevo directamente (nuevo en esta migración).
--
-- No se toca la tabla class_enrollments ni las funciones que ya funcionan
-- correctamente con múltiples filas por alumno (get_pending_enrollment_requests,
-- approve_class_enrollment, reject_class_enrollment, cancel_class_enrollment,
-- get_active_enrollments, get_available_class_schedules) — todas ya operan
-- fila por fila y no asumían "una sola fila por alumno" en su lógica.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Reemplazar el índice "un solo turno por alumno" por uno por (alumno,
--    horario): ahora un alumno puede tener varios turnos pending/active a la
--    vez (uno por cada día que eligió), pero nunca dos solicitudes para el
--    mismo horario exacto.
-- ------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.unique_active_or_pending_enrollment_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_or_pending_enrollment_per_user_schedule
ON public.class_enrollments (user_id, class_schedule_id)
WHERE (status IN ('pending', 'active'));

-- ------------------------------------------------------------------------------
-- 2. RPC: ALUMNO SOLICITA SUS TURNOS SEMANALES, TODOS JUNTOS, POR ÚNICA VEZ.
--    Reemplaza a request_class_enrollment (un solo horario): ahora recibe un
--    array de horarios (uno o varios días) y los crea todos como 'pending' en
--    una sola operación atómica ("todo o nada": si un horario del lote no es
--    válido, no se crea ninguno). Si el alumno ya tiene CUALQUIER solicitud
--    pendiente o turno activo (de una elección anterior), se bloquea por
--    completo — la elección es irreversible por su cuenta.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_class_enrollment(UUID);

CREATE OR REPLACE FUNCTION public.request_class_enrollments_bulk(
    p_schedule_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_student_id UUID;
    v_existing_count INTEGER;
    v_unique_ids UUID[];
    v_schedule_id UUID;
    v_class_type_id UUID;
    v_class_active BOOLEAN;
    v_created JSONB := '[]'::JSONB;
    v_enrollment_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado');
    END IF;

    IF p_schedule_ids IS NULL OR array_length(p_schedule_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Elegí al menos un horario.');
    END IF;

    SELECT organization_id, student_id INTO v_org_id, v_student_id
    FROM public.profiles WHERE id = v_user_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil de usuario');
    END IF;

    -- "Por única vez": si ya tiene cualquier solicitud pendiente o turno
    -- activo (de una elección anterior), no puede volver a elegir por su
    -- cuenta. Los cambios a partir de acá los resuelve el staff por WhatsApp.
    SELECT COUNT(*) INTO v_existing_count
    FROM public.class_enrollments
    WHERE user_id = v_user_id AND status IN ('pending', 'active');

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ya anotaste tus horarios semanales. Para modificarlos, solicitá el cambio al staff por WhatsApp.'
        );
    END IF;

    SELECT array_agg(DISTINCT sid) INTO v_unique_ids FROM unnest(p_schedule_ids) AS sid;

    -- Validar TODOS los horarios antes de insertar nada (todo o nada).
    FOR v_schedule_id IN SELECT unnest(v_unique_ids) LOOP
        SELECT ct.active INTO v_class_active
        FROM public.class_schedules cs
        JOIN public.class_types ct ON ct.id = cs.class_type_id
        WHERE cs.id = v_schedule_id AND cs.organization_id = v_org_id AND cs.active = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Uno de los horarios seleccionados ya no está disponible. Volvé a intentarlo.');
        END IF;

        IF NOT v_class_active THEN
            RETURN jsonb_build_object('success', false, 'error', 'Una de las actividades seleccionadas se encuentra temporalmente inactiva.');
        END IF;
    END LOOP;

    FOR v_schedule_id IN SELECT unnest(v_unique_ids) LOOP
        SELECT cs.class_type_id INTO v_class_type_id
        FROM public.class_schedules cs WHERE cs.id = v_schedule_id;

        INSERT INTO public.class_enrollments (
            organization_id, user_id, student_id, class_schedule_id, class_type_id, status
        ) VALUES (
            v_org_id, v_user_id, v_student_id, v_schedule_id, v_class_type_id, 'pending'
        ) RETURNING id INTO v_enrollment_id;

        v_created := v_created || jsonb_build_object('enrollment_id', v_enrollment_id, 'schedule_id', v_schedule_id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'created', v_created, 'count', jsonb_array_length(v_created));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. RPC: STAFF APRUEBA VARIAS SOLICITUDES DE UN SAQUE EN UN SOLO CLIC
--    (conveniencia de UI: un alumno puede pedir varios días a la vez, esto
--    evita tener que aceptar uno por uno). Reutiliza approve_class_enrollment
--    fila por fila, cada llamada re-valida permisos y cupo por su cuenta.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_class_enrollments_bulk(
    p_enrollment_ids UUID[],
    p_weeks_ahead INTEGER DEFAULT 26
)
RETURNS JSONB AS $$
DECLARE
    v_id UUID;
    v_result JSONB;
    v_results JSONB := '[]'::JSONB;
    v_total_generated INTEGER := 0;
    v_ok_count INTEGER := 0;
    v_fail_count INTEGER := 0;
BEGIN
    IF p_enrollment_ids IS NULL OR array_length(p_enrollment_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se especificaron solicitudes.');
    END IF;

    FOR v_id IN SELECT unnest(p_enrollment_ids) LOOP
        v_result := public.approve_class_enrollment(v_id, p_weeks_ahead);
        v_results := v_results || jsonb_build_object('enrollment_id', v_id, 'result', v_result);
        IF (v_result->>'success')::boolean THEN
            v_ok_count := v_ok_count + 1;
            v_total_generated := v_total_generated + COALESCE((v_result->>'reservations_generated')::int, 0);
        ELSE
            v_fail_count := v_fail_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'approved_count', v_ok_count,
        'failed_count', v_fail_count,
        'reservations_generated', v_total_generated,
        'details', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. RPC: STAFF ASIGNA UN TURNO DIRECTAMENTE A UN ALUMNO (sin pasar por el
--    estado 'pending'). Necesario para poder resolver los pedidos de cambio
--    que llegan por WhatsApp: el alumno ya no puede auto-solicitar una vez
--    que hizo su elección inicial, así que el staff carga el turno nuevo a
--    mano después de confirmar el pedido/pago con el alumno.
-- ------------------------------------------------------------------------------
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

        SELECT COUNT(*)::INTEGER INTO v_current_count
        FROM public.reservations
        WHERE class_schedule_id = p_schedule_id AND class_date = v_date AND status = 'confirmed';

        IF v_current_count < v_schedule.capacity THEN
            INSERT INTO public.reservations (
                organization_id, class_schedule_id, class_type_id, user_id, student_id, class_date, status, notes
            ) VALUES (
                v_caller_org, p_schedule_id, v_schedule.class_type_id, p_user_id, v_target_student_id, v_date, 'confirmed', 'Turno fijo asignado directamente por el staff'
            )
            ON CONFLICT (organization_id, class_schedule_id, class_date, user_id) WHERE (status = 'confirmed') DO NOTHING;
            v_generated := v_generated + 1;
        ELSE
            v_skipped_full := v_skipped_full + 1;
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
