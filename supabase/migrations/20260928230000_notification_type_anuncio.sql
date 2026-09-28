-- ============================================================
-- Tipo de notificación para anuncios generales — sólo el ALTER TYPE
-- 2026-09-28 · Tanda 3 · tarjeta #85
-- ------------------------------------------------------------
-- El aviso masivo del 25/09 («Nuevas reglas desde hoy», 61 destinatarios) salió
-- como TEMPORADA_INICIADA porque no había un tipo para avisos generales. Eso
-- mezcla un anuncio con un evento de la temporada, y cualquier lógica futura
-- que mire TEMPORADA_INICIADA lo contaría mal.
--
-- ANUNCIO lo inserta un humano (o Claude) con un INSERT a mano; la plantilla
-- está en knowledge/10-edge-functions-cron-triggers.md. El push sale solo:
-- insertar en `notifications` dispara push-dispatch, como cualquier otro tipo.
-- En la app, tocarlo sólo lo marca como leído; si `data.url` trae un deep link
-- (tornear://...), el tap del push lo abre.
--
-- ⚠️ Va sola, por el mismo motivo que 20260911180000: Postgres no deja usar un
-- valor de enum recién agregado dentro de la misma transacción.
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ANUNCIO';
