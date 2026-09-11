-- ============================================================
-- AVISO AUTOMÁTICO DE DENUNCIAS NUEVAS
-- 2026-09-11
-- ------------------------------------------------------------
-- Los Términos ahora prometen revisar las denuncias «dentro de las 24 horas»
-- (cláusula 10, versión 12) y la guideline 1.2 lo exige. Con la cola del
-- dashboard sola, ese plazo dependía de que alguien entrara al panel por su
-- cuenta: una denuncia un viernes a la noche podía quedar sin ver hasta el
-- lunes. Esto es lo que convierte la promesa en algo que se cumple sin que
-- nadie se acuerde.
--
-- ── Por qué push y no mail ──────────────────────────────────────────────────
-- El proyecto no tiene proveedor de correo transaccional, y agregar uno para
-- esto sería una dependencia nueva, con su clave y su facturación. En cambio
-- ya existe toda la tubería de push: insertar una fila en `notifications`
-- dispara el trigger de `push-dispatch` (20260711032948) y el aviso llega al
-- teléfono del admin. El mismo camino que usa `enqueue_season_expiry_reminder`
-- para avisar que venció una temporada, y por los mismos motivos.
--
-- ── Idempotencia sin columna nueva ──────────────────────────────────────────
-- El `not exists` mira `notifications.data->>'report_id'`, así que una
-- denuncia genera un solo aviso por admin por más que el job corra cada 15
-- minutos. Mismo patrón que el recordatorio de temporada; no hace falta una
-- columna `notified_at` en `content_reports`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_moderation_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO notifications (profile_id, type, title, body, data, is_read)
  SELECT
    admin.id,
    'DENUNCIA_NUEVA',
    '🚩 Denuncia sin revisar',
    'Hay una denuncia de tipo ' || r.reported_entity_type || ' esperando revisión. '
      || 'Motivo: ' || r.reason || '.',
    jsonb_build_object(
      'report_id', r.id,
      'entity_type', r.reported_entity_type,
      'entity_id', r.reported_entity_id
    ),
    false
  FROM content_reports r
  CROSS JOIN profiles admin
  WHERE r.status = 'PENDING'
    AND admin.is_admin
    -- Quien denuncia no necesita que le avisen de su propia denuncia, ni
    -- siquiera si es admin.
    AND admin.id <> r.reporter_id
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'DENUNCIA_NUEVA'
        AND n.profile_id = admin.id
        AND n.data->>'report_id' = r.id::text
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_moderation_alerts() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enqueue_moderation_alerts() IS
  'Avisa por push a los admins de las denuncias PENDING sin avisar. Sostiene el compromiso de 24 horas de los Términos (cláusula 10, v12) y de la guideline 1.2. Idempotente por notifications.data->>report_id.';

-- Cada 15 minutos, como el recordatorio de partidos. El plazo es de 24 horas,
-- así que la frecuencia exacta no es crítica; lo que importa es que el aviso
-- salga sin intervención.
SELECT cron.schedule(
  'enqueue-moderation-alerts', '*/15 * * * *',
  $$select public.enqueue_moderation_alerts();$$
);
