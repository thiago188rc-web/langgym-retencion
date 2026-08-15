-- ==============================================================================
-- MIGRATION: 20260815060000_profiles_update_policy_hardening.sql
-- Closes a privilege-escalation gap left by the original "profiles_update_own_or_admin"
-- policy (20260814_initial_schema.sql): it only checked organization_id, so ANY
-- authenticated member of an organization could UPDATE ANY OTHER profile row in
-- that same organization (not just their own). Combined with the role-protection
-- trigger from 20260815050000_student_linking_security.sql, role/organization_id/
-- student_id are already blocked from tampering — but non-admin/staff members
-- should not be able to touch other users' rows at all.
--
-- This mirrors the same pattern already used for "profiles_select_secure" in
-- 20260815040000_security_and_rls_hardening.sql: a user may update their own
-- row, and admin/owner/staff may update any row in their organization.
-- ==============================================================================

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_secure" ON public.profiles;

CREATE POLICY "profiles_update_secure" ON public.profiles
    FOR UPDATE USING (
        organization_id = public.get_auth_org_id() AND (
            id = auth.uid() OR public.is_admin_or_staff()
        )
    )
    WITH CHECK (
        organization_id = public.get_auth_org_id() AND (
            id = auth.uid() OR public.is_admin_or_staff()
        )
    );
