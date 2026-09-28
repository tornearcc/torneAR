import React, { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useForm, type UseFormSetValue } from 'react-hook-form';

import { ProfileFormFields } from './ProfileFormFields';
import type { UserProfileFormData } from '@/lib/schemas/userSchema';

/**
 * Regresión del bug de selects que no reflejaban la selección.
 *
 * Qué pasaba en producción:
 *   /profile-edit hidrata el formulario con `reset(buildDefaultValues(profile))`
 *   cuando llega el perfil del AuthContext. `reset()` vacía `control._names.watch`
 *   (react-hook-form/dist/index.esm.mjs:2322) y el evento que emite no alcanza
 *   para re-renderizar el root, así que ese Set nunca se vuelve a poblar. Desde
 *   ahí, cada `setValue()` cae en la rama "campo no observado" y emite un payload
 *   que la suscripción raíz descarta: la pantalla deja de re-renderizar y los
 *   valores quedan congelados en la foto del reset.
 *
 *   Síntoma: tocabas otro género / pierna y el chip verde no se movía; el cuadro
 *   favorito seguía mostrando el anterior.
 *
 * El arreglo fue pasar de `watch()` a `useWatch()`, que crea una suscripción por
 * componente (`formState: { values: true }`, isGlobal = false) e ignora
 * `_names.watch`.
 *
 * Por eso el harness de abajo REPLICA el reset: sin él, `watch()` también
 * funciona y el test no probaría nada. Verificado: revirtiendo el componente a
 * `watch()`, estos tests fallan.
 *
 * Se afirma sobre `aria-selected` (accessibilityState) y sobre texto, no sobre
 * clases: NativeWind no llega al DOM bajo react-native-web.
 */

const BASE_VALUES: UserProfileFormData = {
  fullName: 'Agustín Sala',
  username: 'agussala',
  zone: 'GBA Norte',
  position: 'CUALQUIERA',
  dateOfBirth: '01/01/2000',
  gender: 'M',
  strongFoot: 'RIGHT',
  favoriteTeam: '',
};

/** Espeja app/profile-edit.tsx: defaults vacíos + reset cuando "llega" el perfil. */
function Harness({
  onSetValue,
  genderLocked,
}: {
  onSetValue?: (setValue: UseFormSetValue<UserProfileFormData>) => void;
  genderLocked?: boolean;
}) {
  const {
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UserProfileFormData>({
    defaultValues: {
      fullName: '',
      username: '',
      zone: '',
      position: 'CUALQUIERA',
      dateOfBirth: '',
      gender: undefined,
      strongFoot: undefined,
      favoriteTeam: '',
    },
  });

  // El perfil del AuthContext llega después del primer render.
  useEffect(() => {
    reset(BASE_VALUES);
  }, [reset]);

  useEffect(() => {
    onSetValue?.(setValue);
  }, [onSetValue, setValue]);

  return (
    <ProfileFormFields
      control={control}
      errors={errors}
      setValue={setValue}
      onOpenFavoriteTeamPicker={() => {}}
      genderLocked={genderLocked}
    />
  );
}

const selectedState = (label: string) =>
  screen.getByText(label).closest('[role="radio"]')?.getAttribute('aria-selected');

describe('ProfileFormFields · selección visible después de reset()', () => {
  it('hidrata el género que viene del perfil', () => {
    render(<Harness />);
    expect(selectedState('Masculino')).toBe('true');
    expect(selectedState('Femenino')).toBe('false');
  });

  it('mueve la selección de género al tocar otra opción', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('Femenino'));

    expect(selectedState('Femenino')).toBe('true');
    expect(selectedState('Masculino')).toBe('false');
  });

  it('mueve la selección de pierna hábil al tocar otra opción', () => {
    render(<Harness />);
    expect(selectedState('Diestro')).toBe('true');

    fireEvent.click(screen.getByText('Zurdo'));

    expect(selectedState('Zurdo')).toBe('true');
    expect(selectedState('Diestro')).toBe('false');
  });

  it('refleja el cuadro favorito elegido desde el picker del padre', () => {
    // El picker vive en la pantalla, no acá: escribe con setValue y la fila de
    // ProfileFormFields tiene que mostrar el valor nuevo.
    let apply: UseFormSetValue<UserProfileFormData> | undefined;
    render(<Harness onSetValue={(setValue) => { apply = setValue; }} />);

    expect(screen.getByText('Selecciona tu equipo')).toBeTruthy();

    // act(): el setValue viene de "afuera" de React (lo dispara el picker de la
    // pantalla), así que hay que dejar que se procese la actualización.
    act(() => {
      apply!('favoriteTeam', 'Boca Juniors', { shouldValidate: true });
    });

    expect(screen.getByText('Boca Juniors')).toBeTruthy();
    expect(screen.queryByText('Selecciona tu equipo')).toBeNull();
  });
});

describe('ProfileFormFields · género bloqueado (F3)', () => {
  it('con el género ya elegido, tocar otra opción no lo cambia y dice cómo corregirlo', () => {
    render(<Harness genderLocked />);

    fireEvent.click(screen.getByText('Femenino'));

    expect(selectedState('Masculino')).toBe('true');
    expect(selectedState('Femenino')).toBe('false');
    expect(screen.getByText(/Para corregirlo, escribinos a tornearcc@gmail.com/)).toBeTruthy();
  });

  it('en el onboarding (sin bloquear) avisa que después no se cambia desde la app', () => {
    render(<Harness />);
    expect(screen.getByText(/sólo se puede corregir escribiéndonos/)).toBeTruthy();
  });
});
