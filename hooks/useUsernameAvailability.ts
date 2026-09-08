import { useEffect, useState } from 'react';
import { isUsernameTaken } from '@/lib/username-availability';
import { userProfileSchema } from '@/lib/schemas/userSchema';
import { Logger } from '@/lib/logger';

/** Quietud del tecleo antes de consultar. */
const DEBOUNCE_MS = 450;

export type UsernameAvailability =
  /** Vacío, con formato inválido, o igual al que ya tiene el usuario. */
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  /** No se pudo consultar (red). No bloquea: decide el índice único al guardar. */
  | 'error';

interface Options {
  /** Username actual del perfil en edición: no debe leerse como tomado. */
  currentUsername?: string;
  /** Perfil a excluir de la consulta, por el mismo motivo. */
  excludeProfileId?: string;
}

/**
 * Disponibilidad del `username` mientras se escribe.
 *
 * Antes la unicidad recién se descubría al guardar, o sea después de completar
 * los tres pasos del onboarding: el usuario volvía al paso 1 a elegir otro
 * nombre con todo lo demás ya cargado (auditoría E2E, módulo 1.2).
 *
 * Cuatro cortes para no castigar a la base — la consulta sale sólo cuando
 * realmente puede aportar algo:
 *
 * 1. **Formato primero.** Se reutiliza la regla de `userProfileSchema`: si el
 *    texto todavía no es un username válido (corto, con mayúsculas o símbolos),
 *    no hay nada que preguntar. Descarta la mayor parte del tecleo.
 * 2. **Debounce.** Sólo se consulta tras {@link DEBOUNCE_MS} sin teclas, así
 *    escribir "leomessi" es una consulta y no ocho.
 * 3. **Caché por valor.** Cada username consultado guarda su resultado, de modo
 *    que corregir y volver atrás —o rebotar entre dos opciones— no vuelve a
 *    pegarle a la base.
 * 4. **Se descarta la respuesta vieja.** Si el texto cambió mientras la consulta
 *    viajaba, el resultado se ignora: sin esto una respuesta lenta de un valor
 *    anterior podía pisar la del actual.
 */
export function useUsernameAvailability(
  username: string,
  { currentUsername, excludeProfileId }: Options = {},
): UsernameAvailability {
  // La caché vive en estado y no en una ref porque el resultado del hook se
  // deriva de ella durante el render, y leer una ref en render no está
  // permitido. Se reemplaza el Map entero en cada escritura para que el cambio
  // se propague.
  const [cache, setCache] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  // Valor cuya consulta falló. Se guarda el texto y no un booleano para que el
  // 'error' no se arrastre al siguiente username tipeado.
  const [failedValue, setFailedValue] = useState<string | null>(null);

  const normalized = username.trim().toLowerCase();
  const hasValidFormat = userProfileSchema.shape.username.safeParse(normalized).success;
  const isOwnUsername = normalized === currentUsername?.trim().toLowerCase();
  const isInactive = !hasValidFormat || isOwnUsername;

  useEffect(() => {
    // Sin consulta que hacer: 'idle' y el resultado cacheado se derivan abajo,
    // no hace falta escribirlos en un estado desde acá.
    if (isInactive || cache.has(normalized)) return;

    // El flag de cancelación cubre las dos vías por las que este efecto queda
    // obsoleto: otra tecla (cambia `normalized`) o el desmontaje.
    let cancelled = false;
    const timer = setTimeout(() => {
      // Si este valor había fallado antes, se limpia al reintentar para que
      // vuelva a leerse como 'checking' mientras viaja la consulta.
      setFailedValue((prev) => (prev === normalized ? null : prev));
      isUsernameTaken(normalized, excludeProfileId)
        .then((taken) => {
          if (cancelled) return;
          setCache((prev) => new Map(prev).set(normalized, taken));
        })
        .catch((error: unknown) => {
          // Sin red no se puede afirmar que esté libre NI que esté tomado. Se
          // deja pasar: bloquear el formulario por un problema de conexión es
          // peor que dejar que el índice único lo rechace al guardar.
          Logger.warn('No se pudo verificar la disponibilidad del usuario', {
            scope: 'useUsernameAvailability',
            error,
          });
          if (!cancelled) setFailedValue(normalized);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, isInactive, excludeProfileId, cache]);

  if (isInactive) return 'idle';
  const cached = cache.get(normalized);
  if (cached !== undefined) return cached ? 'taken' : 'available';
  return failedValue === normalized ? 'error' : 'checking';
}
