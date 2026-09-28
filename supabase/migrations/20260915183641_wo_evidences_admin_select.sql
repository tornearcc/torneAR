-- ============================================================
-- storage.objects: los admins leen las evidencias de WO — 2026-09-15
-- ------------------------------------------------------------
-- Contexto:
--   `wo_evidences` va a pasar a privado (P0-4 del backlog). Con el bucket
--   privado, la única forma de mostrar una evidencia es una URL firmada, y
--   Storage firma sólo si quien la pide puede leer el objeto según las
--   policies SELECT de storage.objects.
--
--   Hoy la única policy SELECT del bucket es "Usuarios leen las evidencias que
--   subieron" (owner = auth.uid()). Un admin no puede firmar la evidencia de un
--   reclamo ajeno, y eso ya es así con el bucket todavía público: por eso esta
--   policy tiene que estar aplicada ANTES de que el dashboard pase a
--   createSignedUrl.
--
-- Por qué una policy y no service_role:
--   el dashboard opera siempre con la sesión del admin y nunca con la
--   service_role key (lib/admin-actions.ts del repo web). Firmar URLs no
--   justifica meter esa key en Vercel.
--
-- Alcance:
--   Sólo AGREGA una policy SELECT. No toca:
--     - la del dueño, que la subida necesita para el INSERT ... RETURNING
--       (ver *_storage_select_policies_for_returning);
--     - el INSERT;
--     - el flag `public` del bucket, que va en una migración aparte cuando el
--       dashboard ya firme las URLs.
--   Efecto lateral aceptado: un admin también puede listar el bucket por la
--   Storage API.
--
--   El chequeo de admin es el mismo que usa `app_logs_select_admin`.
--   `profiles` tiene SELECT abierto (`profiles_select_all`), así que la
--   subconsulta resuelve con la sesión del propio admin.
--
-- ⚠️ Bloque tolerante, igual que *_restore_storage_upload_policies: en el
--   stack local / CI el rol de migraciones no es dueño de storage.objects y
--   `CREATE POLICY` abortaría `supabase db reset`. Por lo mismo, pgTAP no
--   puede cubrir esta policy: se verifica contra producción con los claims de
--   un admin y de un no-admin dentro de una transacción revertida.
-- ============================================================

DO $storage$
BEGIN
  EXECUTE $p$ DROP POLICY IF EXISTS "Admins leen las evidencias de WO" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Admins leen las evidencias de WO"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'wo_evidences'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.auth_user_id = (SELECT auth.uid())
            AND p.is_admin = true
        )
      )
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en el stack local)';
END
$storage$;
