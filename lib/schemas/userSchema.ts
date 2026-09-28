// tornear/lib/schemas/userSchema.ts
import * as z from 'zod';
import { isValidFavoriteTeam } from '@/lib/favorite-teams';
import { calculateAgeFromDate, MINIMUM_SIGNUP_AGE } from '@/lib/age';

/**
 * `DD/MM/YYYY` → `Date` local, o `null` si ese día no existe en el calendario.
 *
 * El round-trip contra los getters es lo que atrapa 31/02: el constructor de
 * `Date` no falla, desborda al 3 de marzo.
 */
function parseLocalDate(value: string): Date | null {
  const [dd, mm, yyyy] = value.split('/').map(Number);
  const date = new Date(yyyy, mm - 1, dd);

  const isRealDate =
    date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;

  return isRealDate ? date : null;
}

/** Hoy a las 00:00 local: la comparación de fechas de nacimiento es por día. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export const userProfileSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  username: z
    .string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos (_) sin espacios'),
  zone: z.string().min(1, 'Debes seleccionar una zona'),
  position: z.enum(['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO']),
  dateOfBirth: z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Formato DD/MM/YYYY requerido')
    .refine((val) => parseLocalDate(val) !== null, 'Fecha inválida')
    /**
     * Cota superior: no se puede haber nacido en el futuro.
     *
     * El schema validaba que la fecha existiera en el calendario (rechazaba
     * 31/02) pero no que fuera pasada, así que 28/02/2027 entraba sin chistar y
     * el perfil quedaba con una edad negativa (auditoría E2E, módulo 1.2).
     *
     * La comparación es por día y en hora local, igual que la máscara de carga:
     * el cumpleaños de hoy es válido.
     */
    .refine((val) => {
      const date = parseLocalDate(val);
      if (date === null) return true; // Ya lo reporta el refine anterior.
      return date.getTime() <= startOfToday().getTime();
    }, 'La fecha de nacimiento no puede ser futura')
    /**
     * Cota inferior: 18 años cumplidos.
     *
     * El formulario aceptaba un año de nacimiento 2016 (testing con el socio,
     * 2026-08-11). La edad se calcula con `calculateAgeFromDate` y no con una
     * resta de años: quien cumple 18 la semana que viene tiene 17, y restar
     * `getFullYear()` a secas lo dejaría entrar.
     *
     * Los dos refines anteriores ya reportan sus propios errores; acá se
     * devuelve `true` en esos casos para no apilar dos mensajes sobre el mismo
     * campo — el usuario ve uno solo, el que corresponde.
     *
     * Ojo: este schema lo comparten onboarding y `profile-edit`. Es
     * intencional: un perfil legacy menor de 18 no puede guardar cambios hasta
     * corregir su fecha (decisión de negocio, aprobada).
     */
    .refine((val) => {
      const date = parseLocalDate(val);
      if (date === null) return true;
      if (date.getTime() > startOfToday().getTime()) return true;

      const age = calculateAgeFromDate(date);
      return age !== null && age >= MINIMUM_SIGNUP_AGE;
    }, `Debes ser mayor de ${MINIMUM_SIGNUP_AGE} años para usar torneAR.`),
  gender: z.enum(['M', 'F', 'X'], { error: 'Selecciona un género' }),
  strongFoot: z.enum(['RIGHT', 'LEFT', 'BOTH'], {
    error: 'Selecciona tu pierna hábil',
  }),
  /**
   * Obligatorio y acotado al catalogo.
   *
   * Se valida con `.refine` sobre string y NO con `z.enum`: los perfiles
   * existentes tienen texto libre del input viejo (el seed guarda 'Boca',
   * 'River'). Con enum, ese valor no seria ni asignable al tipo ni hidratable
   * en el form. Con refine sigue siendo un string valido para el defaultValue,
   * y solo falla al GUARDAR — que es cuando el usuario ve el error y elige del
   * select. La migracion de datos viejos ocurre asi, sin bloquear a nadie.
   */
  favoriteTeam: z
    .string()
    .min(1, 'Selecciona tu cuadro favorito')
    .refine(isValidFavoriteTeam, { message: 'Selecciona un equipo de la lista' }),
});

export type UserProfileFormData = z.infer<typeof userProfileSchema>;

/**
 * Error del nombre de usuario mientras se escribe, sin esperar al blur.
 *
 * Los formularios validan con `mode: 'onTouched'` (recién al perder el foco), y
 * con `keyboardShouldPersistTaps="handled"` tocar otro control no desenfoca el
 * input: con "ana reddy!!" el botón quedaba gris sin ningún mensaje (reporte
 * #7761 de PrimeTestLab, M-03). Los caracteres inválidos se marcan en cuanto
 * aparecen; el largo mínimo espera a que haya 3, para no retar con la primera
 * letra.
 */
export function liveUsernameError(username: string | undefined): string | undefined {
  if (!username) return undefined;
  const result = userProfileSchema.shape.username.safeParse(username);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => username.length >= 3 || issue.code !== 'too_small')
    ?.message;
}

/**
 * Error de la fecha de nacimiento apenas está completa (DD/MM/AAAA), sin
 * esperar al blur. Mismo motivo que `liveUsernameError`: una fecha futura o de
 * un menor dejaba «Siguiente» gris sin explicación (reporte #7761, S-03).
 * Mientras se tipea no se reta.
 */
export function liveBirthDateError(value: string | undefined): string | undefined {
  if (value?.length !== 10) return undefined;
  return userProfileSchema.shape.dateOfBirth.safeParse(value).error?.issues[0]?.message;
}
