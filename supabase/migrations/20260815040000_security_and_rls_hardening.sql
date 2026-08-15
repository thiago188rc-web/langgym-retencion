-- ==============================================================================
-- LANGGYM: AUDITORÍA Y FORTALECIMIENTO DE SEGURIDAD RLS Y MULTI-TENANT (PASO 7)
-- Migration: 20260815_security_and_rls_hardening.sql
-- ==============================================================================

-- 1. HELPER: VERIFICAR SI EL USUARIO AUTENTICADO ES ADMIN O STAFF
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('owner', 'admin', 'staff')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. FORTALECIMIENTO RLS: PROFILES
-- Clientes solo ven su propio perfil; Staff/Admin ven los de su organización
DROP POLICY IF EXISTS "profiles_select_same_org" ON public.profiles;
CREATE POLICY "profiles_select_secure" ON public.profiles
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            id = auth.uid() OR public.is_admin_or_staff()
        )
    );

-- 3. FORTALECIMIENTO RLS: STUDENTS
-- Clientes solo pueden ver su propia ficha vinculada (si existe); Staff/Admin ven todo el padrón de la org
DROP POLICY IF EXISTS "students_select_own" ON public.students;
CREATE POLICY "students_select_secure" ON public.students
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND (
            public.is_admin_or_staff() OR 
            id = (SELECT student_id FROM public.profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "students_insert_own" ON public.students;
CREATE POLICY "students_insert_secure" ON public.students
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "students_update_own" ON public.students;
CREATE POLICY "students_update_secure" ON public.students
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "students_delete_own" ON public.students;
CREATE POLICY "students_delete_secure" ON public.students
    FOR DELETE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

-- 4. FORTALECIMIENTO RLS: CONFIGURATIONS
-- Exclusivo para admin/staff de la organización
DROP POLICY IF EXISTS "config_select_own" ON public.configurations;
CREATE POLICY "config_select_secure" ON public.configurations
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "config_insert_own" ON public.configurations;
CREATE POLICY "config_insert_secure" ON public.configurations
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "config_update_own" ON public.configurations;
CREATE POLICY "config_update_secure" ON public.configurations
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

-- 5. FORTALECIMIENTO RLS: SNAPSHOTS & FOLLOW_UPS & IMPORT_RECORDS
-- Exclusivo para admin/staff de la organización
DROP POLICY IF EXISTS "snapshots_select_own" ON public.snapshots;
CREATE POLICY "snapshots_select_secure" ON public.snapshots
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "snapshots_insert_own" ON public.snapshots;
CREATE POLICY "snapshots_insert_secure" ON public.snapshots
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "follow_ups_select_own" ON public.follow_ups;
CREATE POLICY "follow_ups_select_secure" ON public.follow_ups
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "follow_ups_insert_own" ON public.follow_ups;
CREATE POLICY "follow_ups_insert_secure" ON public.follow_ups
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "follow_ups_update_own" ON public.follow_ups;
CREATE POLICY "follow_ups_update_secure" ON public.follow_ups
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "follow_ups_delete_own" ON public.follow_ups;
CREATE POLICY "follow_ups_delete_secure" ON public.follow_ups
    FOR DELETE USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "import_records_select_own" ON public.import_records;
CREATE POLICY "import_records_select_secure" ON public.import_records
    FOR SELECT USING (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );

DROP POLICY IF EXISTS "import_records_insert_own" ON public.import_records;
CREATE POLICY "import_records_insert_secure" ON public.import_records
    FOR INSERT WITH CHECK (
        organization_id = public.get_auth_org_id() AND public.is_admin_or_staff()
    );
