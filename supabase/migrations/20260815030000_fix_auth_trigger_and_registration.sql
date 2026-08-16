-- ==============================================================================
-- MIGRATION: 20260815_fix_auth_trigger_and_registration.sql
-- Fix auth trigger so client self-registrations do not create dummy organizations,
-- and repair any existing client accounts that were assigned owner role by mistake.
-- ==============================================================================

-- 1. UPDATE handle_new_user TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    gym_title TEXT;
    reg_role TEXT;
    primary_org_id UUID;
BEGIN
    -- Check if user registered explicitly as 'cliente'
    reg_role := COALESCE(NEW.raw_user_meta_data->>'registered_as', 'owner');
    
    IF reg_role = 'cliente' THEN
        -- Get the primary gym organization ID
        SELECT id INTO primary_org_id 
        FROM public.organizations 
        ORDER BY created_at ASC 
        LIMIT 1;

        -- Insert client profile directly without creating a new organization
        INSERT INTO public.profiles (
            id, 
            organization_id, 
            email, 
            full_name, 
            role,
            phone
        )
        VALUES (
            NEW.id,
            primary_org_id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', 'Alumno'),
            'cliente',
            NEW.raw_user_meta_data->>'phone'
        )
        ON CONFLICT (id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = 'cliente',
            phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
            updated_at = timezone('utc'::text, now());

        RETURN NEW;
    END IF;

    -- Standard Owner Onboarding: Create a new gym organization
    gym_title := COALESCE(NEW.raw_user_meta_data->>'gym_name', 'Lang Gym');
    
    INSERT INTO public.organizations (name, slug, owner_name)
    VALUES (
        gym_title,
        LOWER(REGEXP_REPLACE(gym_title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(NEW.id::text, 1, 6),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Administrador')
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, organization_id, email, full_name, role)
    VALUES (
        NEW.id,
        new_org_id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Administrador'),
        'owner'
    )
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        role = 'owner';

    INSERT INTO public.configurations (organization_id)
    VALUES (new_org_id)
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. REPAIR ANY EXISTING CLIENT USERS IN PROFILES
DO $$
DECLARE
    v_main_org_id UUID;
BEGIN
    SELECT id INTO v_main_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    
    IF v_main_org_id IS NOT NULL THEN
        -- If any user in auth.users was registered with registered_as = 'cliente', ensure their profile is role = 'cliente' and belongs to main org
        UPDATE public.profiles p
        SET role = 'cliente',
            organization_id = v_main_org_id,
            updated_at = timezone('utc'::text, now())
        FROM auth.users u
        WHERE p.id = u.id
          AND u.raw_user_meta_data->>'registered_as' = 'cliente'
          AND (p.role <> 'cliente' OR p.organization_id <> v_main_org_id);
    END IF;
END $$;
