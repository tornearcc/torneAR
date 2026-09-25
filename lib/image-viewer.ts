/**
 * Matemática del visor de fotos (components/ui/image-viewer).
 *
 * Son funciones puras con la directiva 'worklet': las llaman los gestos en el
 * hilo de UI (Reanimated) y los tests en Node sin ningún mock. La directiva es
 * un string suelto para cualquier otro runtime.
 *
 * Modelo: la imagen ocupa una caja cuadrada de `boxSize` × `boxSize` centrada
 * en un viewport de `viewport.width` × `viewport.height`, y se transforma con
 * `translate(tx, ty) scale(s)` alrededor del centro de la caja.
 */

/** Zoom mínimo en reposo. Durante el pinch se permite bajar un poco (rebote). */
export const MIN_SCALE = 1;
/** Zoom máximo: más allá una foto de perfil de 1080 px ya se ve pixelada. */
export const MAX_SCALE = 4;
/** Zoom del doble tap. */
export const DOUBLE_TAP_SCALE = 2.5;
/** Cuánto se puede "achicar" durante el pinch antes de volver a 1. */
const PINCH_UNDERSHOOT = 0.7;

/** Distancia (px) de arrastre vertical que cierra el visor. */
export const DISMISS_DISTANCE = 120;
/** Velocidad (px/s) de un flick vertical que cierra el visor aunque sea corto. */
export const DISMISS_VELOCITY = 900;

export interface Size {
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Escala durante el pinch: deja rebotar un poco por debajo de 1, nunca pasa el máximo. */
export function clampPinchScale(scale: number): number {
  'worklet';
  return clamp(scale, PINCH_UNDERSHOOT, MAX_SCALE);
}

/**
 * Desplazamiento máximo en cada eje para que la imagen agrandada no deje
 * espacio vacío de más: en un eje donde la caja escalada cabe en el viewport,
 * queda centrada (0).
 */
export function maxTranslation(scale: number, boxSize: number, viewport: Size): { x: number; y: number } {
  'worklet';
  const scaled = boxSize * scale;
  return {
    x: Math.max(0, (scaled - viewport.width) / 2),
    y: Math.max(0, (scaled - viewport.height) / 2),
  };
}

export function clampTranslation(
  tx: number,
  ty: number,
  scale: number,
  boxSize: number,
  viewport: Size,
): { x: number; y: number } {
  'worklet';
  const max = maxTranslation(scale, boxSize, viewport);
  return { x: clamp(tx, -max.x, max.x), y: clamp(ty, -max.y, max.y) };
}

/**
 * Traslación que deja el punto tocado (`focal`, en coordenadas del viewport)
 * quieto al pasar de escala 1 a `scale`. Con el origen de la transformación en
 * el centro, un punto a distancia d del centro termina en c + t + s·d; para que
 * quede donde estaba, t = d·(1 − s).
 */
export function focalTranslation(
  focal: { x: number; y: number },
  scale: number,
  boxSize: number,
  viewport: Size,
): { x: number; y: number } {
  'worklet';
  const dx = focal.x - viewport.width / 2;
  const dy = focal.y - viewport.height / 2;
  return clampTranslation(dx * (1 - scale), dy * (1 - scale), scale, boxSize, viewport);
}

/** Cierra si el arrastre fue largo o si fue un flick rápido, hacia arriba o hacia abajo. */
export function shouldDismiss(translationY: number, velocityY: number): boolean {
  'worklet';
  return Math.abs(translationY) > DISMISS_DISTANCE || Math.abs(velocityY) > DISMISS_VELOCITY;
}

/** Opacidad del fondo mientras se arrastra para cerrar: se aclara hasta 0,3. */
export function backdropOpacity(translationY: number): number {
  'worklet';
  return 1 - Math.min(Math.abs(translationY) / 400, 0.7);
}
