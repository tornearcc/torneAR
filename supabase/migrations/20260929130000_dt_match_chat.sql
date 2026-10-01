-- ============================================================
-- El director técnico escribe en el chat del partido (P1-5)
-- 2026-09-29 · Registro P1-5 · Tanda 4 · tarjeta #15
-- ------------------------------------------------------------
-- El DT tiene los permisos del día del partido (presentar la lista, cargar el
-- resultado; TRANSPARENCY_GUIDE §8), pero la policy de INSERT de `messages`
-- quedó fuera de ese cambio y sólo dejaba escribir en MATCH_CHAT a capitán y
-- subcapitán. Era una inconsistencia, no una decisión (§9.1 y límite 5 de la
-- guía).
--
-- Sólo cambia la rama MATCH_CHAT. El chat del Mercado (MARKET_DM) sigue
-- reservado a capitán y subcapitán: el DT no tiene permisos de Mercado.
-- El resto de la policy es la de 20260714144056 sin cambios.
-- ============================================================

DROP POLICY IF EXISTS messages_insert_conversation_members ON public.messages;
CREATE POLICY messages_insert_conversation_members ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_profile_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (c.type = 'MARKET_DM' AND c.player_id = (SELECT p.id FROM profiles p WHERE p.auth_user_id = (SELECT auth.uid())))
          OR (c.type = 'MARKET_DM' AND EXISTS (
                SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
                WHERE tm.team_id = c.team_id
                  AND p.auth_user_id = (SELECT auth.uid())
                  AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
              ))
          OR (c.type = 'MATCH_CHAT' AND EXISTS (
                SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
                WHERE tm.team_id IN (
                        SELECT matches.team_a_id FROM matches WHERE matches.id = c.match_id
                        UNION
                        SELECT matches.team_b_id FROM matches WHERE matches.id = c.match_id
                      )
                  AND p.auth_user_id = (SELECT auth.uid())
                  AND tm.role IN ('CAPITAN', 'SUBCAPITAN', 'DIRECTOR_TECNICO')
              ))
        )
    )
  );
