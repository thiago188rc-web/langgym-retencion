-- Tracks which import batch last touched each student, so the app can offer
-- a "solo esta importación" view instead of always showing the full
-- cumulative roster. Without this, importing a small file (e.g. 36 contacts)
-- merges into the existing roster with no way to see just those 36 again.
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS last_import_id UUID REFERENCES public.import_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_org_last_import ON public.students(organization_id, last_import_id);
