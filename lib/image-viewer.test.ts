import { describe, it, expect } from 'vitest';
import {
  MAX_SCALE,
  clampPinchScale,
  maxTranslation,
  clampTranslation,
  focalTranslation,
  shouldDismiss,
  backdropOpacity,
} from './image-viewer';

// Teléfono típico: caja cuadrada del ancho de la pantalla.
const VIEWPORT = { width: 400, height: 800 };
const BOX = 400;

describe('clampPinchScale', () => {
  it('deja rebotar por debajo de 1 pero no pasa el máximo', () => {
    expect(clampPinchScale(0.2)).toBe(0.7);
    expect(clampPinchScale(0.9)).toBe(0.9);
    expect(clampPinchScale(10)).toBe(MAX_SCALE);
  });
});

describe('maxTranslation', () => {
  it('sin zoom la imagen no se mueve', () => {
    expect(maxTranslation(1, BOX, VIEWPORT)).toEqual({ x: 0, y: 0 });
  });

  it('en x se libera apenas la imagen es más ancha que la pantalla', () => {
    // 400 × 2 = 800 de ancho en 400 de pantalla: 200 para cada lado.
    expect(maxTranslation(2, BOX, VIEWPORT).x).toBe(200);
  });

  it('en y queda centrada mientras la imagen escalada entre en la altura', () => {
    // 400 × 2 = 800 = alto de la pantalla: no sobra nada para mover.
    expect(maxTranslation(2, BOX, VIEWPORT).y).toBe(0);
    expect(maxTranslation(3, BOX, VIEWPORT).y).toBe(200);
  });
});

describe('clampTranslation', () => {
  it('recorta a los bordes en ambos sentidos', () => {
    expect(clampTranslation(999, -999, 3, BOX, VIEWPORT)).toEqual({ x: 400, y: -200 });
  });

  it('respeta lo que ya está dentro de los bordes', () => {
    expect(clampTranslation(50, -20, 3, BOX, VIEWPORT)).toEqual({ x: 50, y: -20 });
  });
});

describe('focalTranslation', () => {
  it('tocar el centro no desplaza la imagen', () => {
    const t = focalTranslation({ x: 200, y: 400 }, 2.5, BOX, VIEWPORT);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
  });

  it('tocar a la derecha acerca ese punto: la imagen se corre a la izquierda', () => {
    // d = 100; t = 100 × (1 − 2) = −100, dentro del borde de 200. (y sale −0,
    // de ahí toBeCloseTo y no toEqual.)
    const t = focalTranslation({ x: 300, y: 400 }, 2, BOX, VIEWPORT);
    expect(t.x).toBeCloseTo(-100);
    expect(t.y).toBeCloseTo(0);
  });

  it('no deja pasar el borde aunque se toque en la esquina', () => {
    // d = 200; t = 200 × (1 − 4) = −600, recortado al borde de (1600 − 400)/2 = 600.
    expect(focalTranslation({ x: 400, y: 400 }, 4, BOX, VIEWPORT).x).toBe(-600);
    expect(focalTranslation({ x: 400, y: 400 }, 2, BOX, VIEWPORT).x).toBe(-200);
  });
});

describe('shouldDismiss', () => {
  it('cierra con un arrastre largo, para arriba o para abajo', () => {
    expect(shouldDismiss(150, 0)).toBe(true);
    expect(shouldDismiss(-150, 0)).toBe(true);
  });

  it('cierra con un flick corto pero rápido', () => {
    expect(shouldDismiss(30, 1200)).toBe(true);
  });

  it('un arrastre corto y lento vuelve a su lugar', () => {
    expect(shouldDismiss(60, 300)).toBe(false);
  });
});

describe('backdropOpacity', () => {
  it('arranca opaco y se aclara hasta 0,3 como mínimo', () => {
    expect(backdropOpacity(0)).toBe(1);
    expect(backdropOpacity(200)).toBeCloseTo(0.5);
    expect(backdropOpacity(-5000)).toBeCloseTo(0.3);
  });
});
