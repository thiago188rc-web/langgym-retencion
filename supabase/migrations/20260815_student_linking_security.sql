-- ==============================================================================
-- MIGRATION: 20260815_student_linking_security.sql
-- Security triggers and RPC functions for SIGA student linking and role protection
-- ==============================================================================

-- 1. TRIGGER: Protect profile role, organization_id and student_id from unauthorized tampering
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Only check if security-sensitive columns are modified
    IF (NEW.role IS DISTINCT FROM OLD.role) OR 
       (NEW.organization_id IS DISTINCT FROM OLD.organization_id) OR
       (NEW.student_id IS DISTINCT FROM OLD.student_id) THEN
        
        -- Get role of currently authenticated caller
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
        
        -- If caller is 'cliente' or not in staff/admin roles, deny mutation
        IF v_caller_role = 'cliente' OR (v_caller_role NOT IN ('owner', 'admin', 'staff') AND auth.uid() IS NOT NULL) THEN
            RAISE EXCEPTION 'Operación no permitida: No podés modificar tu rol, organización o vinculación de socio.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_profile_security ON public.profiles;
CREATE TRIGGER trigger_protect_profile_security
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_security_fields();

-- 2. RPC: Link a client profile to an existing SIGA student record (Staff / Admin only)
CREATE OR REPLACE FUNCTION public.link_profile_to_student(
    p_profile_id UUID,
    p_student_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_target_profile_org UUID;
    v_target_student_org UUID;
    v_student_name TEXT;
BEGIN
    -- Verify caller authentication and role
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'No tenés permisos para realizar vinculaciones de alumnos.';
    END IF;

    -- Verify target profile belongs to same organization
    SELECT organization_id INTO v_target_profile_org
    FROM public.profiles
    WHERE id = p_profile_id;

    IF v_target_profile_org IS NULL OR v_target_profile_org <> v_caller_org THEN
        RAISE EXCEPTION 'El perfil de usuario no pertenece a tu gimnasio.';
    END IF;

    -- Verify target student belongs to same organization
    SELECT organization_id, nombre_completo INTO v_target_student_org, v_student_name
    FROM public.students
    WHERE id = p_student_id;

    IF v_target_student_org IS NULL OR v_target_student_org <> v_caller_org THEN
        RAISE EXCEPTION 'La ficha de alumno no pertenece a tu gimnasio.';
    END IF;

    -- Update profile linking
    UPDATE public.profiles
    SET student_id = p_student_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_profile_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Perfil vinculado exitosamente con %s.', v_student_name)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Unlink a client profile from a SIGA student record (Staff / Admin only)
CREATE OR REPLACE FUNCTION public.unlink_profile_from_student(
    p_profile_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_org UUID;
    v_caller_role TEXT;
    v_target_profile_org UUID;
BEGIN
    -- Verify caller
    SELECT organization_id, role INTO v_caller_org, v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('owner', 'admin', 'staff') THEN
        RAISE EXCEPTION 'No tenés permisos para desvincular alumnos.';
    END IF;

    -- Verify profile org
    SELECT organization_id INTO v_target_profile_org
    FROM public.profiles
    WHERE id = p_profile_id;

    IF v_target_profile_org IS NULL OR v_target_profile_org <> v_caller_org THEN
        RAISE EXCEPTION 'El perfil de usuario no pertenece a tu gimnasio.';
    END IF;

    UPDATE public.profiles
    SET student_id = NULL,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_profile_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Vinculación eliminada correctamente.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
