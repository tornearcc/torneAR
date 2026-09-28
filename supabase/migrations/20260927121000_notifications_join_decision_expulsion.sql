-- ============================================================
-- Notificaciones de solicitud aceptada y expulsión — 2026-09-27
-- ------------------------------------------------------------
-- Bug: cuando un capitán acepta una solicitud de ingreso, la app inserta una
-- notificación SOLICITUD_UNION_ACEPTADA para el jugador, pero la policy
-- `notifications_insert_authenticated` la rechaza: la rama (a) exige que el
-- destinatario ya esté en team_members, y desde m1 (20260728161000) aceptar
-- NO incorpora al jugador (confirma él con transfer_to_team, D-18). El push
-- sí llegaba porque la app lo manda directo a Expo; lo que nunca se guardaba
-- era la notificación dentro de la app. En producción hay 0 filas
-- SOLICITUD_UNION_ACEPTADA.
--
-- Mismo problema, todavía sin casos: EXPULSADO_EQUIPO se inserta DESPUÉS de
-- remove_team_member, cuando el jugador ya no es miembro.
--
-- Qué cambia:
--   1. La policy suma dos ramas, cada una atada a su tipo:
--      (g) capitán/subcapitán -> jugador con una solicitud a su equipo ya
--          decidida (ACEPTADA o RECHAZADA): tipos SOLICITUD_UNION_ACEPTADA y
--          SOLICITUD_UNION_RECHAZADA.
--      (h) capitán/subcapitán -> jugador expulsado de su equipo hace menos de
--          10 minutos (team_stints con leave_reason EXPULSADO): tipo
--          EXPULSADO_EQUIPO.
--      Las ramas (a)–(f) quedan idénticas a 20260708184030.
--   2. Trigger BEFORE INSERT `mark_client_pushed_notification`: la app 1.1.0
--      manda por su cuenta el push de SOLICITUD_UNION_ACEPTADA,
--      ROL_ACTUALIZADO y EXPULSADO_EQUIPO (lib/team-manage-data.ts,
--      sendPushNotification) y además inserta la notificación, que dispara
--      push-dispatch. Con la policy arreglada llegarían dos pushes. Cuando esos
--      tipos los inserta un usuario (rol authenticated), se sella pushed_at y
--      push-dispatch no los vuelve a mandar.
--      Temporal: cuando la app deje de mandar esos pushes (OTA), se borra este
--      trigger en la misma tanda.
--   3. GRANT INSERT explícito a authenticated. La app inserta notificaciones
--      desde el cliente y la policy es la que decide cuáles. En producción el
--      grant ya existe (viene del default privilege de Supabase: relacl
--      `authenticated=arwdxtm`, verificado el 27/09), pero una base nueva de
--      la CLI actual ya no lo otorga solo y la policy nunca llegaba a
--      evaluarse (deriva de grants entre entornos, registro P2-7). En
--      producción es un no-op.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE, CREATE OR REPLACE, DROP
-- TRIGGER IF EXISTS y GRANT.
-- ============================================================

-- ─── 0. Grant que la policy necesita ─────────────────────────────────────────
GRANT INSERT ON public.notifications TO authenticated;

-- ─── 1. Policy de INSERT ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated" ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    -- (a) mismo equipo: notificaciones de gestión (rol)
    EXISTS (
      SELECT 1 FROM team_members tm_r
      JOIN team_members tm_c ON tm_c.team_id = tm_r.team_id
      JOIN profiles p_c ON p_c.id = tm_c.profile_id
      WHERE tm_r.profile_id = notifications.profile_id
        AND p_c.auth_user_id = (SELECT auth.uid())
        AND tm_c.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (b) solicitud de unión pendiente -> admin del equipo destino
    EXISTS (
      SELECT 1 FROM team_join_requests r
      JOIN profiles p_req ON p_req.id = r.profile_id
      JOIN team_members tm_admin ON tm_admin.team_id = r.team_id
      JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
      WHERE p_admin.id = notifications.profile_id
        AND p_req.auth_user_id = (SELECT auth.uid())
        AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (c) desafío entre equipos: admin de un lado notifica al admin del otro
    EXISTS (
      SELECT 1 FROM challenges c
      JOIN team_members tm_caller ON tm_caller.team_id IN (c.from_team_id, c.to_team_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (c.from_team_id, c.to_team_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (d) partido entre equipos: admin de un lado notifica al admin del otro
    EXISTS (
      SELECT 1 FROM matches m
      JOIN team_members tm_caller ON tm_caller.team_id IN (m.team_a_id, m.team_b_id)
      JOIN profiles p_caller ON p_caller.id = tm_caller.profile_id
      JOIN team_members tm_recipient ON tm_recipient.team_id IN (m.team_a_id, m.team_b_id)
        AND tm_recipient.team_id <> tm_caller.team_id
      WHERE p_caller.auth_user_id = (SELECT auth.uid())
        AND tm_recipient.profile_id = notifications.profile_id
        AND tm_caller.role IN ('CAPITAN', 'SUBCAPITAN')
        AND tm_recipient.role IN ('CAPITAN', 'SUBCAPITAN')
    )
    OR
    -- (e) postulación a un post de EQUIPO: postulante <-> admin del equipo dueño
    EXISTS (
      SELECT 1 FROM market_team_post_applications a
      JOIN market_team_posts p ON p.id = a.post_id
      JOIN team_members tm ON tm.team_id = p.team_id
      JOIN profiles p_admin ON p_admin.id = tm.profile_id
      JOIN profiles p_applicant ON p_applicant.id = a.profile_id
      WHERE tm.role IN ('CAPITAN', 'SUBCAPITAN')
        AND (
          (p_applicant.auth_user_id = (SELECT auth.uid()) AND p_admin.id = notifications.profile_id)
          OR
          (p_admin.auth_user_id = (SELECT auth.uid()) AND p_applicant.id = notifications.profile_id)
        )
    )
    OR
    -- (f) postulación a un post de JUGADOR: admin del equipo postulante <-> dueño del post
    EXISTS (
      SELECT 1 FROM market_player_post_applications a
      JOIN market_player_posts p ON p.id = a.post_id
      JOIN profiles p_applicant ON p_applicant.id = a.applicant_profile_id
      JOIN profiles p_owner ON p_owner.id = p.profile_id
      WHERE (p_applicant.auth_user_id = (SELECT auth.uid()) AND p_owner.id = notifications.profile_id)
         OR (p_owner.auth_user_id = (SELECT auth.uid()) AND p_applicant.id = notifications.profile_id)
    )
    OR
    -- (g) solicitud de unión ya decidida: admin del equipo -> postulante
    (
      notifications.type IN ('SOLICITUD_UNION_ACEPTADA', 'SOLICITUD_UNION_RECHAZADA')
      AND EXISTS (
        SELECT 1 FROM team_join_requests r
        JOIN team_members tm_admin ON tm_admin.team_id = r.team_id
        JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
        WHERE r.profile_id = notifications.profile_id
          AND r.status IN ('ACEPTADA', 'RECHAZADA')
          AND p_admin.auth_user_id = (SELECT auth.uid())
          AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    )
    OR
    -- (h) expulsión reciente: admin del equipo -> jugador expulsado
    (
      notifications.type = 'EXPULSADO_EQUIPO'
      AND EXISTS (
        SELECT 1 FROM team_stints s
        JOIN team_members tm_admin ON tm_admin.team_id = s.team_id
        JOIN profiles p_admin ON p_admin.id = tm_admin.profile_id
        WHERE s.profile_id = notifications.profile_id
          AND s.leave_reason = 'EXPULSADO'
          AND s.ended_at > now() - interval '10 minutes'
          AND p_admin.auth_user_id = (SELECT auth.uid())
          AND tm_admin.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    )
  );

-- ─── 2. Pushes que la app 1.1.0 ya manda directo ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_client_pushed_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER a propósito: current_user es el rol de quien inserta.
  -- Las RPC SECURITY DEFINER y los crons insertan como postgres y no entran.
  IF current_user = 'authenticated'
     AND NEW.type IN ('SOLICITUD_UNION_ACEPTADA', 'ROL_ACTUALIZADO', 'EXPULSADO_EQUIPO') THEN
    NEW.pushed_at := coalesce(NEW.pushed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_pushed_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_client_pushed_notification() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_client_pushed ON public.notifications;
CREATE TRIGGER trg_mark_client_pushed
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_client_pushed_notification();
