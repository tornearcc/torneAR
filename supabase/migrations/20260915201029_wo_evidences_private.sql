-- ============================================================
-- storage.buckets: `wo_evidences` deja de ser público — 2026-09-15
-- ------------------------------------------------------------
-- Contexto (P0-4 del backlog, D-48):
--   Las fotos de los reclamos de WO se podían abrir por URL pública
--   (/storage/v1/object/public/wo_evidences/...), sin sesión y sin RLS.
--   Con el bucket privado, sólo se ven con una URL firmada.
--
-- Precondiciones, ya cumplidas cuando se aplica esta migración:
--   - Policy "Admins leen las evidencias de WO" aplicada
--     (*_wo_evidences_admin_select): sin ella un admin no puede firmar la
--     evidencia de un reclamo ajeno.
--   - Dashboard en producción firmando con createSignedUrls
--     (repo web, fix/wo-evidences-signed-urls).
--   La OTA que borra app/admin/wo-review NO es precondición: la única pantalla
--   que se rompe es de admin, y los admins saben por qué (D-48).
--
-- Qué NO cambia:
--   - La subida (`claimWo`): depende de las policies INSERT y SELECT del dueño
--     sobre storage.objects, no del flag `public`.
--   - Las policies de storage.objects.
--
-- Por qué falla en voz alta:
--   storage.buckets tiene RLS activado y ninguna policy. Un rol que no la
--   saltee haría el UPDATE sobre 0 filas sin ningún error, y el bucket seguiría
--   público con la migración marcada como aplicada. El chequeo posterior lo
--   convierte en un error.
--
--   En el stack local / CI el bucket no existe (se creó por dashboard), así que
--   el UPDATE no toca nada y el chequeo pasa.
--
-- Reversión (no destructiva): UPDATE storage.buckets SET public = true
--   WHERE id = 'wo_evidences';
-- ============================================================

DO $bucket$
BEGIN
  UPDATE storage.buckets
     SET public = false
   WHERE id = 'wo_evidences';

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'wo_evidences' AND public) THEN
    RAISE EXCEPTION 'wo_evidences sigue público después del UPDATE: el rol que aplica la migración no pudo escribir storage.buckets';
  END IF;
END
$bucket$;
