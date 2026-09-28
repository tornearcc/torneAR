import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

/*
 * El wrapper se bifurca por plataforma y la rama interesante es la de iOS: en
 * jsdom `Platform.OS` vale 'web' (el proyecto `ui` aliasea react-native a
 * react-native-web), así que sin este mock los tests correrían por la rama del
 * diálogo nativo de Android y no probarían nada de lo que se rompió.
 */
vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      OS: 'ios',
      select: (specifics: Record<string, unknown>) => specifics.ios ?? specifics.default,
    },
  };
});

/** Fecha a la que "gira la rueda" el stub del picker nativo. */
const SPUN_DATE = new Date(2000, 4, 17, 21, 30);

/*
 * Stub del componente nativo. Reproduce el detalle que causó el bug: en iOS
 * `onValueChange` dispara en cada tick del scroll, no al confirmar. El botón
 * expuesto acá es ese tick.
 */
vi.mock('@react-native-community/datetimepicker', () => ({
  default: ({ onValueChange }: { onValueChange?: (e: unknown, d: Date) => void }) =>
    createElement('button', {
      'data-testid': 'wheel-tick',
      onClick: () => onValueChange?.({ nativeEvent: { timestamp: 0, utcOffset: 0 } }, SPUN_DATE),
    }),
}));

const { AppDateTimePicker } = await import('@/components/ui/AppDateTimePicker');

describe('AppDateTimePicker en iOS', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  function renderPicker(visible = true) {
    return render(
      <AppDateTimePicker
        visible={visible}
        value={new Date(1998, 0, 1)}
        mode="date"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  }

  it('no monta nada mientras está cerrado', () => {
    renderPicker(false);
    expect(screen.queryByTestId('wheel-tick')).toBeNull();
  });

  it('girar la rueda no confirma ni cierra: eso era el bug de iOS', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('wheel-tick'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('confirma el último valor girado recién al tocar «Listo»', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('wheel-tick'));
    fireEvent.click(screen.getByText('Listo'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual(SPUN_DATE);
  });

  it('«Cancelar» descarta lo girado', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('wheel-tick'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
