-- ==============================================================================
-- MIGRATION: 20260815005000_repair_initial_schema_triggers.sql
-- Repairs a PARTIAL application of 20260814_initial_schema.sql on production.
--
-- Diagnosed live on 2026-08-15: the tables, indexes and RLS policies from
-- initial_schema.sql exist and work (confirmed public.get_auth_org_id() runs
-- fine), but public.handle_updated_at() and public.handle_new_user() were
-- never created (confirmed via PGRST202 "function does not exist" on both).
-- This is why classes_and_reservations.sql fails: its CREATE TRIGGER
-- statements reference public.handle_updated_at(), which isn't there.
--
-- This file recreates ONLY the missing functions/triggers using
-- CREATE OR REPLACE / DROP...IF EXISTS, so it is safe to run even though the
-- surrounding tables and policies already exist. It intentionally does NOT
-- touch ALTER TABLE ... ENABLE ROW LEVEL SECURITY or any CREATE POLICY
-- statement, since those already exist in production and would error with
-- "policy already exists" (which previously appears to have aborted the
-- whole batch and rolled back this section along with it).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- updated_at trigger function + triggers (identical to initial_schema.sql)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_configurations_updated_at
    BEFORE UPDATE ON public.configurations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- handle_new_user() — recreated with the ORIGINAL initial_schema.sql body on
-- purpose. 20260815030000_fix_auth_trigger_and_registration.sql (which runs
-- right after this one) immediately replaces it with the corrected version
-- that does not create a new organization for 'cliente' signups. Recreating
-- the original here first just restores the trigger wiring; the very next
-- migration in the sequence fixes the actual bug in its logic.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    gym_title TEXT;
BEGIN
    gym_title := COALESCE(NEW.raw_user_meta_data->>'gym_name', 'Mi Gimnasio');

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
    );

    INSERT INTO public.configurations (organization_id)
    VALUES (new_org_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
