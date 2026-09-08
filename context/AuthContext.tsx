import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Logger } from '@/lib/logger';
import { Database } from '../types/supabase';
import { useTeamStore } from '@/stores/teamStore';

type Profile = Database['public']['Tables']['profiles']['Row'];

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * `true` una vez que leímos la sesión inicial de Supabase/SecureStore al
   * arrancar. A diferencia de `loading` (que oscila en cada cambio de auth y
   * durante el fetch del perfil), `hydrated` solo pasa a `true` una vez y no
   * vuelve atrás: es la señal para soltar el SplashScreen nativo.
   */
  hydrated: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /**
   * Conteo de notificaciones sin leer, mantenido acá (no en GlobalHeader) porque
   * GlobalHeader se monta una vez por tab (5 instancias en simultáneo): si cada
   * una abre su propio canal realtime `notifications-unread-${profile.id}`,
   * todas piden el mismo nombre de canal y supabase-js devuelve la misma
   * instancia ya suscripta a la segunda, lo que revienta con
   * "cannot add postgres_changes callbacks ... after subscribe()".
   * Con un único suscriptor acá, GlobalHeader solo lee el valor.
   */
  unreadNotificationCount: number;
  refreshUnreadNotificationCount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  hydrated: false,
  signOut: async () => {},
  refreshProfile: async () => {},
  unreadNotificationCount: 0,
  refreshUnreadNotificationCount: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Conteo crudo del ultimo fetch. Lo que se expone al arbol se deriva abajo:
  // sin perfil el badge es 0 sin importar lo que haya quedado del anterior.
  const [unreadCount, setUnreadCount] = useState(0);
  const syncVersionRef = useRef(0);
  const authUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      // `get_own_profile()`, no `.from('profiles').select('*')`: desde
      // 20260819100000_privacy_and_age_compliance, `date_of_birth` y
      // `expo_push_token` están bloqueadas por columna en la tabla base
      // (nadie puede leer el date_of_birth/token ajeno vía SELECT directo).
      // La RPC es SECURITY DEFINER y sólo devuelve la fila de
      // `auth.uid()` — mismo shape que el `SELECT *` que reemplaza, así
      // que el resto de la app (profile.date_of_birth, profile.expo_push_token,
      // etc.) no cambia.
      //
      // Sin fila para este usuario NO devuelve un error: devuelve una fila de
      // NULLs (ver el bloque de abajo). Es el mismo caso "recién registrado,
      // sin perfil todavía" que antes cubría `maybeSingle`.
      const { data, error } = await supabase.rpc('get_own_profile');

      // Devolver null acá manda al usuario a /onboarding (ver app/_layout.tsx).
      // Un fallo de red y "este usuario todavía no completó su perfil" producen
      // la MISMA pantalla, así que sin log no hay forma de distinguir un
      // onboarding legítimo de una sesión que perdió su perfil.
      if (error) {
        Logger.error('No se pudo cargar el perfil del usuario autenticado', {
          scope: 'AuthContext.fetchProfile',
          authUserId: userId,
          error,
        });
        return null;
      }

      /*
       * `!data` NO alcanza: `get_own_profile()` es `RETURNS public.profiles`
       * (un compuesto), no `RETURNS SETOF public.profiles`. Una función SQL
       * que devuelve un compuesto SIEMPRE produce exactamente una fila: sin
       * fila en `profiles`, esa fila es un registro de NULLs, y PostgREST lo
       * serializa como un OBJETO `{ id: null, auth_user_id: null, ... }`, no
       * como `null`. Verificado contra la base:
       * `select count(*) from get_own_profile()` = 1 para un usuario sin perfil.
       *
       * Ese objeto es truthy, así que el chequeo anterior lo dejaba pasar y
       * medio app quedaba con un `profile` fantasma cuyo `.id` es `null` —
       * el origen del 22P02 de `tabs.index.loadData` ('null'::uuid).
       *
       * `id` es la clave primaria y es NOT NULL en la tabla: si viene en null,
       * la fila no existe. Es la única discriminación posible y no puede dar
       * falsos positivos sobre un perfil real.
       */
      if (!data || !data.id) {
        // Caso esperado, no un fallo: sesión válida sin fila en `profiles`.
        // Se loguea en `info` para poder separarlo del error de arriba cuando
        // alguien reporte "me tira siempre el onboarding".
        Logger.info('Sesión sin perfil: derivando a onboarding', {
          scope: 'AuthContext.fetchProfile',
          authUserId: userId,
        });
        return null;
      }

      return data;
    } catch (e) {
      Logger.error('Excepción cargando el perfil del usuario autenticado', {
        scope: 'AuthContext.fetchProfile',
        authUserId: userId,
        error: e,
      });
      return null;
    }
  }, []);

  /*
   * Lee el id del usuario del ref y no del estado `user`.
   *
   * Con `user?.id` como dependencia, `refreshProfile` cambiaba de identidad en
   * cada login/logout y contaminaba las deps de quien lo consumiera — por
   * ejemplo el `onSubmit` de app/profile-edit.tsx, que nunca llegaba a
   * estabilizarse. `authUserIdRef` ya se mantiene sincronizado en syncAuthState
   * con exactamente el mismo valor, asi que esta version es 100% estable.
   */
  const refreshProfile = useCallback(async () => {
    const userId = authUserIdRef.current;
    if (!userId) return;

    const nextProfile = await fetchProfile(userId);
    setProfile(nextProfile);
  }, [fetchProfile]);

  const syncAuthState = useCallback(async (nextSession: Session | null) => {
    const syncVersion = ++syncVersionRef.current;
    const previousUserId = authUserIdRef.current;
    const nextUserId = nextSession?.user?.id ?? null;

    if (!nextUserId || (previousUserId && previousUserId !== nextUserId)) {
      useTeamStore.getState().clearStore();
    }

    authUserIdRef.current = nextUserId;

    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      if (syncVersion === syncVersionRef.current) {
        setProfile(null);
        setLoading(false);
        setHydrated(true);
      }
      return;
    }

    setLoading(true);
    const nextProfile = await fetchProfile(nextSession.user.id);

    if (syncVersion === syncVersionRef.current) {
      setProfile(nextProfile);
      setLoading(false);
      setHydrated(true);
    }
  }, [fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncAuthState(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Traza de sesión. Es el eje temporal contra el que se leen todos los
      // demás logs: un TOKEN_REFRESHED fallido o un SIGNED_OUT inesperado
      // explican de una la ráfaga de errores que viene inmediatamente después.
      Logger.info('Cambio de estado de autenticación', {
        scope: 'AuthContext',
        event,
        hasSession: nextSession !== null,
      });
      void syncAuthState(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
    // `syncAuthState` es estable (useCallback sobre `fetchProfile`, que a su vez
    // no depende de nada), asi que la suscripcion sigue montandose una sola vez.
    // Declararla explicitamente satisface exhaustive-deps sin silenciar la regla.
  }, [syncAuthState]);

  // Cadena de promesas y no `async`/`await`: esta funcion la llama un efecto, y
  // todo lo que un `async` hace antes de suspenderse cuenta como setState
  // sincrono dentro de el. Dentro del callback de `.then`, no.
  const loadUnreadNotificationsCount = useCallback((): Promise<void> => {
    const profileId = profile?.id;
    // Sin perfil no hay nada que contar: el 0 ya lo pone la derivacion de
    // `unreadNotificationCount`, no hace falta escribirlo.
    if (!profileId) return Promise.resolve();

    // `Promise.resolve(...)`: el builder de supabase-js es un thenable, no una
    // Promise, y el contrato del contexto declara `Promise<void>`.
    return Promise.resolve(
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('is_read', false),
    ).then(({ count, error }) => {
      // Mismo criterio que ya usaba GlobalHeader: un badge es informacion
      // accesoria, si el conteo falla lo llevamos a 0 en vez de dejar un
      // numero viejo colgado.
      if (error) {
        Logger.warn('No se pudo contar las notificaciones sin leer; el badge queda en 0', {
          scope: 'AuthContext.loadUnreadNotificationsCount',
          profileId,
          error,
        });
      }
      setUnreadCount(error ? 0 : (count ?? 0));
    });
  }, [profile?.id]);

  const unreadNotificationCount = profile?.id ? unreadCount : 0;

  useEffect(() => {
    void loadUnreadNotificationsCount();

    if (!profile?.id) {
      return;
    }


    // Único suscriptor de este canal en toda la app: vive acá (una vez), no en
    // GlobalHeader (una vez por tab montada).
    const channel = supabase
      .channel(`notifications-unread-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profile.id}`,
        },
        () => {
          void loadUnreadNotificationsCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, loadUnreadNotificationsCount]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // No se propaga a propósito: el usuario ya decidió salir y la UI local se
      // limpia igual por el onAuthStateChange. Pero si el token queda vivo del
      // lado del servidor, conviene que quede asentado.
      Logger.error('Fallo el cierre de sesión', { scope: 'AuthContext.signOut', error });
    }
  }, []);

  /*
   * Sin este useMemo, el objeto literal creaba una identidad nueva en cada render
   * del provider y React re-renderizaba TODO consumidor de useAuth() — mas de 20
   * archivos — aunque solo hubiera cambiado `loading`. Ahora el value solo cambia
   * cuando cambia alguno de los datos que expone; las tres funciones son estables.
   */
  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      hydrated,
      signOut,
      refreshProfile,
      unreadNotificationCount,
      refreshUnreadNotificationCount: loadUnreadNotificationsCount,
    }),
    [
      session,
      user,
      profile,
      loading,
      hydrated,
      signOut,
      refreshProfile,
      unreadNotificationCount,
      loadUnreadNotificationsCount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}