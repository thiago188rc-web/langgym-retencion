-- ==============================================================================
-- LANGGYM PRODUCTION DATABASE SCHEMA (MULTI-TENANT + ROW LEVEL SECURITY)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Gimnasios / Tenants)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    owner_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    country_code TEXT NOT NULL DEFAULT '54',
    mobile_prefix TEXT NOT NULL DEFAULT '9',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. PROFILES (Usuarios y Miembros del Staff asociados a una Organización)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 3. CONFIGURATIONS (Reglas de retención y plantillas por Gimnasio)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    dias_riesgo_nivel1 INTEGER NOT NULL DEFAULT 7,
    dias_riesgo_nivel2 INTEGER NOT NULL DEFAULT 15,
    dias_riesgo_nivel3 INTEGER NOT NULL DEFAULT 30,
    por_vencer_dias INTEGER NOT NULL DEFAULT 7,
    template_recuperacion TEXT NOT NULL DEFAULT 'Hola {{nombre}} 👋

Vimos que hace unos días no estás viniendo al gimnasio.

¿Todo bien? ¿Podemos ayudarte en algo?',
    template_cobro TEXT NOT NULL DEFAULT 'Hola {{nombre}} 👋

Te escribimos para recordarte que tu cuota se encuentra vencida.

Cuando quieras podemos ayudarte con la renovación.',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. STUDENTS (Base de alumnos por Organización)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id_socio TEXT NOT NULL,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL DEFAULT '',
    nombre_completo TEXT NOT NULL,
    telefono TEXT,
    telefono_raw TEXT,
    email TEXT,
    habilitado BOOLEAN NOT NULL DEFAULT true,
    id_membresia TEXT,
    membresia TEXT,
    fecha_fin TIMESTAMPTZ,
    fecha_alta TIMESTAMPTZ,
    ultima_asistencia TIMESTAMPTZ,
    observacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_socio_per_org UNIQUE (organization_id, id_socio)
);

-- ------------------------------------------------------------------------------
-- 5. SNAPSHOTS (Historial de cambios e importaciones por alumno)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    fecha TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    fecha_fin TIMESTAMPTZ,
    ultima_asistencia TIMESTAMPTZ,
    membresia TEXT,
    habilitado BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 6. FOLLOW_UPS (Seguimientos, notas y mensajes de WhatsApp enviados)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    tipo TEXT NOT NULL CHECK (tipo IN ('recuperacion', 'cobro', 'nota')),
    canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'manual')),
    mensaje TEXT,
    resultado TEXT NOT NULL DEFAULT 'contactado' CHECK (resultado IN ('pendiente', 'contactado', 'recuperado', 'sin_respuesta')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 7. IMPORT_RECORDS (Historial de importaciones de archivos Excel)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    archivo TEXT NOT NULL,
    nuevos INTEGER NOT NULL DEFAULT 0,
    actualizados INTEGER NOT NULL DEFAULT 0,
    bajas INTEGER NOT NULL DEFAULT 0,
    permanecen INTEGER NOT NULL DEFAULT 0,
    errores INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_org ON public.students(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_org_socio ON public.students(organization_id, id_socio);
CREATE INDEX IF NOT EXISTS idx_students_org_fin ON public.students(organization_id, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_students_org_asistencia ON public.students(organization_id, ultima_asistencia);
CREATE INDEX IF NOT EXISTS idx_snapshots_org_student ON public.snapshots(organization_id, student_id);
CREATE INDEX IF NOT EXISTS idx_followups_org_student ON public.follow_ups(organization_id, student_id);
CREATE INDEX IF NOT EXISTS idx_followups_org_fecha ON public.follow_ups(organization_id, fecha);
CREATE INDEX IF NOT EXISTS idx_import_records_org ON public.import_records(organization_id);

-- ------------------------------------------------------------------------------
-- AUTOMATIC updated_at TRIGGER FUNCTION
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
-- AUTOMATIC USER ONBOARDING TRIGGER (ORGANIZATION + PROFILE CREATION)
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

-- Trigger on auth.users (Executed automatically by Supabase Auth engine)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Helper function: Get the organization_id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
    SELECT organization_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_records ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS: ORGANIZATIONS
-- ------------------------------------------------------------------------------
CREATE POLICY "org_select_own" ON public.organizations
    FOR SELECT USING (id = public.get_auth_org_id());

CREATE POLICY "org_update_own" ON public.organizations
    FOR UPDATE USING (id = public.get_auth_org_id())
    WITH CHECK (id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: PROFILES
-- ------------------------------------------------------------------------------
CREATE POLICY "profiles_select_same_org" ON public.profiles
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
    FOR UPDATE USING (organization_id = public.get_auth_org_id())
    WITH CHECK (organization_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: CONFIGURATIONS
-- ------------------------------------------------------------------------------
CREATE POLICY "config_select_own" ON public.configurations
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "config_insert_own" ON public.configurations
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org_id());

CREATE POLICY "config_update_own" ON public.configurations
    FOR UPDATE USING (organization_id = public.get_auth_org_id())
    WITH CHECK (organization_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: STUDENTS
-- ------------------------------------------------------------------------------
CREATE POLICY "students_select_own" ON public.students
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "students_insert_own" ON public.students
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org_id());

CREATE POLICY "students_update_own" ON public.students
    FOR UPDATE USING (organization_id = public.get_auth_org_id())
    WITH CHECK (organization_id = public.get_auth_org_id());

CREATE POLICY "students_delete_own" ON public.students
    FOR DELETE USING (organization_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: SNAPSHOTS
-- ------------------------------------------------------------------------------
CREATE POLICY "snapshots_select_own" ON public.snapshots
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "snapshots_insert_own" ON public.snapshots
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: FOLLOW_UPS
-- ------------------------------------------------------------------------------
CREATE POLICY "follow_ups_select_own" ON public.follow_ups
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "follow_ups_insert_own" ON public.follow_ups
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org_id());

CREATE POLICY "follow_ups_update_own" ON public.follow_ups
    FOR UPDATE USING (organization_id = public.get_auth_org_id())
    WITH CHECK (organization_id = public.get_auth_org_id());

CREATE POLICY "follow_ups_delete_own" ON public.follow_ups
    FOR DELETE USING (organization_id = public.get_auth_org_id());

-- ------------------------------------------------------------------------------
-- RLS: IMPORT_RECORDS
-- ------------------------------------------------------------------------------
CREATE POLICY "import_records_select_own" ON public.import_records
    FOR SELECT USING (organization_id = public.get_auth_org_id());

CREATE POLICY "import_records_insert_own" ON public.import_records
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org_id());
