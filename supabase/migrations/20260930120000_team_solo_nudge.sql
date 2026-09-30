-- ============================================================
-- Aviso al capitán de un equipo de un solo integrante
-- 2026-09-30 · Tanda 7 «llenar los equipos» · P1-11
-- ------------------------------------------------------------
-- Al 29/09, 16 de los 17 equipos reales tenían un solo integrante: el capitán
-- crea el equipo y no suma a nadie. Sin compañeros no hay partidos.
--
-- nudge_solo_team_captains() le manda al capitán dos avisos como mucho:
--   · Aviso 1: el equipo tiene 24 h o más y sigue con un solo integrante.
--   · Aviso 2: 48 h o más después del aviso 1, si sigue igual.
-- Después no insiste. Los equipos viejos que ya están solos reciben el aviso 1
-- en la primera corrida.
--
-- Va como ANUNCIO (no hace falta un tipo nuevo, y las apps que ya están en la
-- calle lo muestran) con `team_id` y `url` en `data`: el tap del push abre la
-- gestión del equipo, donde está el botón para invitar, y la app nueva hace lo
-- mismo desde la lista de notificaciones. El push sale solo, como con
-- cualquier INSERT en notifications.
--
-- team_nudges registra qué aviso se mandó a qué equipo (idempotencia: la
-- clave es equipo + aviso) y deja afuera a la demo de Apple (D-52: sigue
-- activa y no se marca en el esquema; acá se excluye con una fila con nota,
-- que es un dato y no una columna).
--
-- Cron: 14:00 y 21:00 UTC (11 y 18 h en Argentina), para no mandar pushes de
-- madrugada. Cae en :00 como pide 20260929170000 (Disk IO).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.team_nudges (
  team_id    uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage      smallint    NOT NULL CHECK (stage IN (1, 2)),
  profile_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  note       text,
  PRIMARY KEY (team_id, stage)
);

COMMENT ON TABLE public.team_nudges IS
  'Tanda 7 (P1-11). Avisos mandados al capitán de un equipo de un solo integrante (nudge_solo_team_captains). Una fila con note y sin profile_id es una exclusión (demo de Apple, D-52), no un aviso real.';

ALTER TABLE public.team_nudges ENABLE ROW LEVEL SECURITY;
-- Sin policies: sólo la escribe y la lee la función (SECURITY DEFINER).
REVOKE ALL ON public.team_nudges FROM anon, authenticated;

-- Demo de Apple: nunca se le avisa (sus dos equipos quedan marcados como si ya
-- hubieran recibido los dos avisos). En una base sin la demo no inserta nada.
INSERT INTO public.team_nudges (team_id, stage, profile_id, note)
SELECT t.id, s.stage, NULL, 'Excluido: demo de Apple (D-52)'
  FROM public.teams t
 CROSS JOIN (VALUES (1::smallint), (2::smallint)) AS s(stage)
 WHERE t.name IN ('Apple FC', 'Los Pibes del Barrio')
ON CONFLICT (team_id, stage) DO NOTHING;


CREATE OR REPLACE FUNCTION public.nudge_solo_team_captains()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row  record;
  v_sent integer := 0;
BEGIN
  FOR v_row IN
    WITH solo AS (
      SELECT t.id AS team_id, t.name, t.created_at, (array_agg(m.profile_id))[1] AS profile_id,
             (array_agg(m.role))[1] AS role
        FROM public.teams t
        JOIN public.team_members m ON m.team_id = t.id
       WHERE t.is_active
       GROUP BY t.id
      HAVING count(*) = 1
    )
    SELECT s.team_id, s.name, s.profile_id,
           CASE WHEN n1.team_id IS NULL THEN 1 ELSE 2 END AS stage
      FROM solo s
      JOIN public.profiles p ON p.id = s.profile_id
      LEFT JOIN public.team_nudges n1 ON n1.team_id = s.team_id AND n1.stage = 1
      LEFT JOIN public.team_nudges n2 ON n2.team_id = s.team_id AND n2.stage = 2
     WHERE s.role IN ('CAPITAN', 'SUBCAPITAN')
       AND p.username NOT LIKE 'usuario\_eliminado\_%'
       AND s.created_at <= now() - interval '24 hours'
       AND n2.team_id IS NULL
       AND (n1.team_id IS NULL OR n1.sent_at <= now() - interval '48 hours')
  LOOP
    INSERT INTO public.team_nudges (team_id, stage, profile_id)
    VALUES (v_row.team_id, v_row.stage, v_row.profile_id)
    ON CONFLICT (team_id, stage) DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.notifications (profile_id, type, title, body, data)
      VALUES (
        v_row.profile_id,
        'ANUNCIO',
        CASE v_row.stage
          WHEN 1 THEN 'Tu equipo necesita jugadores'
          ELSE '¿Armamos el plantel de ' || v_row.name || '?'
        END,
        CASE v_row.stage
          WHEN 1 THEN 'En ' || v_row.name || ' estás solo vos. Mandales el link de invitación a tus compañeros desde la gestión del equipo.'
          ELSE 'Sin compañeros no se pueden jugar partidos. Compartí el link del equipo por WhatsApp y aceptá las solicitudes que lleguen.'
        END,
        jsonb_build_object(
          'kind', 'team_solo_nudge',
          'stage', v_row.stage,
          'team_id', v_row.team_id,
          'team_name', v_row.name,
          'url', 'tornear://team-manage?teamId=' || v_row.team_id::text
        )
      );
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$function$;

COMMENT ON FUNCTION public.nudge_solo_team_captains() IS
  'Tanda 7 (P1-11). Avisa (ANUNCIO + push) al capitán de un equipo activo de un solo integrante: a las 24 h de creado y, si sigue solo, 48 h después del primer aviso. Registra cada aviso en team_nudges. La corre el cron nudge-solo-team-captains; devuelve cuántos avisos mandó.';

REVOKE ALL ON FUNCTION public.nudge_solo_team_captains() FROM PUBLIC, anon, authenticated;

-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
SELECT cron.schedule(
  'nudge-solo-team-captains',
  '0 14,21 * * *',
  $$SELECT public.nudge_solo_team_captains()$$
);
