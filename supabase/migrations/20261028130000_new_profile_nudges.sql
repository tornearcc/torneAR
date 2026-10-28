-- ============================================================
-- Avisos a cuentas nuevas sin equipo
-- 2026-10-28 · Auditoría de la cohorte de la pauta (25-27/10)
-- ------------------------------------------------------------
-- De las 23 cuentas creadas con la pauta de embajadores, 19 no tenían equipo
-- al día siguiente y ninguna había desafiado. nudge_solo_team_captains
-- (20260930120000) solo cubre a quien ya armó un equipo; quien se registra y
-- no hace nada más no recibía ningún aviso.
--
-- nudge_new_profiles() manda dos avisos como mucho, mismo criterio que el de
-- capitanes:
--   · Aviso 1: la cuenta tiene 24 h o más y no está en ningún equipo → crear
--     equipo (o sumarse a uno desde el Mercado).
--   · Aviso 2: 48 h o más después del aviso 1, si sigue sin equipo y no es
--     embajador, con el programa prendido → programa de embajadores.
-- Solo para cuentas creadas desde el 21/10/2026 (arranque del programa): las
-- más viejas incluyen a los testers de Play y no se les escribe de golpe.
--
-- Va como ANUNCIO con `kind: new_profile_nudge` y `url` en `data`: el push
-- abre la pantalla con el deep link, y la lista de notificaciones de la app
-- nueva lo rutea por `kind`. profile_nudges registra qué aviso se mandó
-- (idempotencia: perfil + aviso).
--
-- Cron: 14:00 y 21:00 UTC (11 y 18 h en Argentina), en :00 (20260929170000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profile_nudges (
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage      smallint    NOT NULL CHECK (stage IN (1, 2)),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, stage)
);

COMMENT ON TABLE public.profile_nudges IS
  'Avisos mandados a cuentas nuevas sin equipo (nudge_new_profiles, 20261028130000). Aviso 1: crear equipo; aviso 2: programa de embajadores.';

ALTER TABLE public.profile_nudges ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo la escribe y la lee la función (SECURITY DEFINER).
REVOKE ALL ON public.profile_nudges FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public.nudge_new_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row     record;
  v_sent    integer := 0;
  v_program boolean := public.ambassador_program_enabled();
BEGIN
  FOR v_row IN
    SELECT p.id AS profile_id,
           CASE WHEN n1.profile_id IS NULL THEN 1 ELSE 2 END AS stage
      FROM public.profiles p
      LEFT JOIN public.profile_nudges n1 ON n1.profile_id = p.id AND n1.stage = 1
      LEFT JOIN public.profile_nudges n2 ON n2.profile_id = p.id AND n2.stage = 2
     WHERE p.created_at >= '2026-10-21 00:00-03'::timestamptz
       AND p.created_at <= now() - interval '24 hours'
       AND p.username NOT LIKE 'usuario\_eliminado\_%'
       AND NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.profile_id = p.id)
       AND n2.profile_id IS NULL
       AND (
         n1.profile_id IS NULL
         OR (
           n1.sent_at <= now() - interval '48 hours'
           AND v_program
           AND NOT EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.profile_id = p.id)
         )
       )
  LOOP
    INSERT INTO public.profile_nudges (profile_id, stage)
    VALUES (v_row.profile_id, v_row.stage)
    ON CONFLICT (profile_id, stage) DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.notifications (profile_id, type, title, body, data)
      VALUES (
        v_row.profile_id,
        'ANUNCIO',
        CASE v_row.stage
          WHEN 1 THEN '¿Ya tenés equipo?'
          ELSE 'Ganá $5.000 por cada equipo que traigas'
        END,
        CASE v_row.stage
          WHEN 1 THEN 'Armá el tuyo en un minuto e invitá a tus amigos, o sumate a un equipo que busca jugadores en el Mercado.'
          ELSE 'Anotate como embajador desde tu perfil: cuando un equipo que traés juega su primer partido, cobrás $5.000.'
        END,
        jsonb_build_object(
          'kind', 'new_profile_nudge',
          'stage', v_row.stage,
          'url', CASE v_row.stage WHEN 1 THEN 'tornear://team-create' ELSE 'tornear://ambassador' END
        )
      );
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$function$;

COMMENT ON FUNCTION public.nudge_new_profiles() IS
  'Avisa (ANUNCIO + push) a cuentas creadas desde el 21/10/2026 que siguen sin equipo: a las 24 h (crear equipo) y 48 h después del primer aviso (programa de embajadores, si está prendido y no es embajador). Registra cada aviso en profile_nudges. La corre el cron nudge-new-profiles (20261028130000); devuelve cuántos avisos mandó.';

REVOKE ALL ON FUNCTION public.nudge_new_profiles() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'nudge-new-profiles',
  '0 14,21 * * *',
  $$SELECT public.nudge_new_profiles()$$
);
