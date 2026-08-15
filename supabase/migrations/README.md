# Migraciones — orden de aplicación

Este proyecto no tiene el Supabase CLI vinculado (`supabase link`) ni
`supabase/config.toml`, así que estas migraciones no se aplican solas: hay que
pegarlas manualmente en **Supabase Dashboard → SQL Editor** (o correr
`supabase db push` una vez que el proyecto esté linkeado), **en este orden
exacto**, un archivo a la vez:

1. `20260814_initial_schema.sql` — **ya aplicada en producción, no re-ejecutar** (re-ejecutarla falla en los `CREATE POLICY`, que ya existen)
2. `20260815005000_repair_initial_schema_triggers.sql` — **corre esta primero**: repara `handle_updated_at()`/`handle_new_user()`, que quedaron sin crear en la corrida original de `initial_schema.sql`
3. `20260815010000_classes_and_reservations.sql`
4. `20260815020000_admin_class_management.sql`
5. `20260815030000_fix_auth_trigger_and_registration.sql`
6. `20260815040000_security_and_rls_hardening.sql`
7. `20260815050000_student_linking_security.sql`
8. `20260815060000_profiles_update_policy_hardening.sql`

> Los archivos 2–7 (originalmente sufijados solo con `20260815_`) fueron
> renombrados con timestamps completos porque su orden alfabético original
> era incorrecto: `20260815_admin_class_management.sql` ordenaba antes que
> `20260815_classes_and_reservations.sql`, pero sus funciones referencian
> tablas (`reservations`, `class_schedules`, `class_types`) y columnas
> (`profiles.student_id`) que solo existen después de correr
> `classes_and_reservations`. Con `check_function_bodies` en su valor por
> defecto (`on`), Postgres valida esas referencias al crear las funciones, así
> que aplicar el orden alfabético viejo rompe el deploy en el segundo archivo.

## Verificar qué está aplicado

Todas las migraciones son idempotentes (`IF NOT EXISTS`, `DROP ... IF EXISTS`,
`CREATE OR REPLACE`), así que re-ejecutarlas no rompe nada si alguna ya corrió
parcialmente. Para confirmar el estado actual de una tabla, se puede consultar
el schema cache de PostgREST:

```
GET {SUPABASE_URL}/rest/v1/?apikey={service_role_key}
```

y revisar `definitions.profiles.properties` — si falta `phone` o `student_id`,
esas migraciones no están aplicadas todavía.
