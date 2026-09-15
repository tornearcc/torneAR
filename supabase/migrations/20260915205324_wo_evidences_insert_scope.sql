-- ============================================================
-- storage.objects: acotar quién sube evidencias de WO y a qué path — 2026-09-15
-- ------------------------------------------------------------
-- Problema:
--   La policy "Usuarios autenticados suben evidencias" sólo chequeaba
--   `bucket_id = 'wo_evidences'`. Cualquier usuario autenticado podía subir
--   cualquier archivo a cualquier path del bucket (hasta el límite de 5 MB),
--   aunque no tuviera nada que ver con el partido. Con el bucket ya privado
--   (*_wo_evidences_private) eso no expone fotos, pero sí deja llenar el bucket
--   con basura que nadie referencia.
--
-- Nueva regla, calcada de lo que hace la app y de la autorización de claim_wo:
--   1. Path exacto de `claimWo` (lib/match-actions.ts):
--        <match_id>/<team_id>_<Date.now()>.jpg
--      Una sola carpeta, y el nombre de archivo con ese formato.
--   2. La carpeta es un partido que existe, y el team_id del nombre es uno de
--      sus dos equipos.
--   3. Quien sube es CAPITAN o SUBCAPITAN de ese equipo, o hizo check-in con
--      ese equipo en ese partido. Es la misma condición que `claim_wo` exige
--      para reclamar.
--
-- Qué NO se copia de claim_wo, a propósito:
--   El estado del partido (CONFIRMADO/EN_VIVO) y el check-in del equipo. Son
--   reglas de dominio y la RPC da el mensaje útil ("el partido ya terminó").
--   Si la policy también las exigiera, la subida —que corre ANTES de la RPC—
--   fallaría con un error genérico de RLS en vez del mensaje de la RPC.
--
-- Por qué la policy puede leer esas tablas con la sesión del usuario:
--   `matches`, `team_members`, `match_participants` y `profiles` tienen SELECT
--   abierto para autenticados (`*_select_all`).
--
-- No cambia:
--   - Las policies SELECT (dueño y admins): la del dueño sigue siendo necesaria
--     para el INSERT ... RETURNING de la subida.
--   - No hay policy UPDATE: `claimWo` usa `upsert: true` pero el nombre lleva
--     Date.now(), así que nunca pisa un objeto existente.
--
-- ⚠️ Bloque tolerante, igual que *_restore_storage_upload_policies: en el
--   stack local / CI el rol de migraciones no es dueño de storage.objects.
--   pgTAP no la cubre; se verifica contra producción en transacción revertida.
-- ============================================================

DO $storage$
BEGIN
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados suben evidencias" ON storage.objects $p$;
  EXECUTE $p$ DROP POLICY IF EXISTS "Miembros del partido suben evidencias de WO" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Miembros del partido suben evidencias de WO"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'wo_evidences'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9]+\.jpg$'
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          JOIN public.profiles p ON p.auth_user_id = (SELECT auth.uid())
          WHERE m.id::text = (storage.foldername(objects.name))[1]
            AND split_part(storage.filename(objects.name), '_', 1) IN (m.team_a_id::text, m.team_b_id::text)
            AND (
              EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.profile_id = p.id
                  AND tm.team_id::text = split_part(storage.filename(objects.name), '_', 1)
                  AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
              )
              OR EXISTS (
                SELECT 1
                FROM public.match_participants mp
                WHERE mp.match_id = m.id
                  AND mp.profile_id = p.id
                  AND mp.team_id::text = split_part(storage.filename(objects.name), '_', 1)
                  AND mp.did_checkin
              )
            )
        )
      )
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en el stack local)';
END
$storage$;
