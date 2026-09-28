import { describe, expect, it } from 'vitest';
import { liveBirthDateError, liveUsernameError, userProfileSchema } from '@/lib/schemas/userSchema';

const dateField = userProfileSchema.shape.dateOfBirth;

/** `DD/MM/YYYY` de un día relativo a hoy. */
function dateOffsetByDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

/**
 * `DD/MM/YYYY` de un cumpleaños que hoy cumple exactamente `years` años,
 * corrido `dayOffset` días. Se construye relativo a hoy y no con fechas fijas
 * para que la suite no empiece a fallar sola con el paso del tiempo.
 */
function birthDateForAge(years: number, dayOffset = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

describe('userProfileSchema.dateOfBirth', () => {
  it('acepta una fecha pasada', () => {
    expect(dateField.safeParse('18/12/1997').success).toBe(true);
  });

  it('rechaza el día de hoy por edad, no por fecha futura', () => {
    // El borde de la regla "no futura" sigue siendo "no futura": hoy la pasa.
    // Lo que ahora frena esa fecha es la cota de 18 años, y el mensaje tiene que
    // ser ése — si dijera "no puede ser futura" el usuario no entendería nada.
    const result = dateField.safeParse(dateOffsetByDays(0));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Debes ser mayor de 18 años para usar torneAR.',
      ]);
    }
  });

  it('rechaza mañana', () => {
    expect(dateField.safeParse(dateOffsetByDays(1)).success).toBe(false);
  });

  it('rechaza una fecha futura lejana', () => {
    // El caso exacto de la auditoría E2E (módulo 1.2): entraba sin chistar.
    const result = dateField.safeParse('28/02/2027');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('La fecha de nacimiento no puede ser futura');
    }
  });

  it('sigue rechazando un día que no existe en el calendario', () => {
    // `new Date(1995, 1, 31)` no falla: desborda al 3 de marzo. Sin el
    // round-trip contra los getters, 31/02 pasaría.
    expect(dateField.safeParse('31/02/1995').success).toBe(false);
  });

  it('sigue rechazando un formato que no es DD/MM/YYYY', () => {
    expect(dateField.safeParse('1997-12-18').success).toBe(false);
    expect(dateField.safeParse('').success).toBe(false);
  });
});

describe('userProfileSchema.dateOfBirth — edad mínima', () => {
  it('rechaza el año de nacimiento del reporte de testing (2016)', () => {
    const result = dateField.safeParse('15/06/2016');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Debes ser mayor de 18 años para usar torneAR.',
      );
    }
  });

  it('acepta a quien cumple 18 hoy', () => {
    // El borde es inclusivo: el día del cumpleaños número 18 ya es mayor de edad.
    expect(dateField.safeParse(birthDateForAge(18)).success).toBe(true);
  });

  it('rechaza a quien cumple 18 mañana', () => {
    // Un día antes del cumpleaños todavía tiene 17. Es el caso que una resta de
    // años a secas (2026 - 2008 = 18) dejaría pasar.
    expect(dateField.safeParse(birthDateForAge(18, 1)).success).toBe(false);
  });

  it('acepta a alguien holgadamente mayor', () => {
    expect(dateField.safeParse(birthDateForAge(35)).success).toBe(true);
  });

  it('no apila el error de edad sobre el de fecha futura', () => {
    // Una fecha futura es un solo problema para el usuario: el mensaje de edad
    // encima sería ruido.
    const result = dateField.safeParse('28/02/2027');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].message).toBe(
        'La fecha de nacimiento no puede ser futura',
      );
    }
  });
});

describe('liveUsernameError (reporte #7761, M-03)', () => {
  it('no reta con el campo vacío', () => {
    expect(liveUsernameError('')).toBeUndefined();
    expect(liveUsernameError(undefined)).toBeUndefined();
  });

  it('marca espacios y símbolos en cuanto aparecen', () => {
    expect(liveUsernameError('ana reddy!!')).toBe(
      'Solo minúsculas, números y guiones bajos (_) sin espacios',
    );
    expect(liveUsernameError('a!')).toBe('Solo minúsculas, números y guiones bajos (_) sin espacios');
  });

  it('no reta por largo mientras hay menos de 3 letras válidas', () => {
    expect(liveUsernameError('ab')).toBeUndefined();
  });

  it('acepta un usuario válido', () => {
    expect(liveUsernameError('ana_reddy')).toBeUndefined();
  });
});

describe('liveBirthDateError (reporte #7761, S-03)', () => {
  it('no reta mientras la fecha está incompleta', () => {
    expect(liveBirthDateError(undefined)).toBeUndefined();
    expect(liveBirthDateError('18/12/19')).toBeUndefined();
  });

  it('explica una fecha futura', () => {
    expect(liveBirthDateError(dateOffsetByDays(1))).toBe('La fecha de nacimiento no puede ser futura');
  });

  it('explica la edad mínima', () => {
    expect(liveBirthDateError(birthDateForAge(17))).toMatch(/mayor de 18/);
  });

  it('no muestra nada con una fecha válida', () => {
    expect(liveBirthDateError('18/12/1997')).toBeUndefined();
  });
});
