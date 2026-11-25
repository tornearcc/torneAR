import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { FaqCategory, FaqEntry } from './types';

interface Props {
  category: FaqCategory;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Colores dinámicos del encabezado.
 *
 * Van por `style` y no por `className` condicional a propósito — ver el bloque
 * de abajo. Mismo patrón que usaba el mini-ranking de Inicio para los colores
 * del podio.
 */
const COLORS = {
  accent: '#53E076',
  accentSoft: 'rgba(83, 224, 118, 0.15)',
  accentBorder: 'rgba(83, 224, 118, 0.25)',
  iconIdleBg: '#2A2A2A',
  title: '#E5E2E1',
  subtitle: '#869585',
  iconIdle: '#BCCBB9',
} as const;

/**
 * Un dato duro dentro de una respuesta: etiqueta a la izquierda, valor a la
 * derecha en verde. Es lo que permite que la respuesta larga se pueda "escanear"
 * sin leerla entera — el usuario que sólo quiere saber el radio del geofence lo
 * encuentra sin buscarlo en el párrafo.
 */
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <Text className="font-ui flex-1 text-xs text-neutral-on-surface-variant">{label}</Text>
      <Text className="font-uiBold text-right text-xs text-brand-primary">{value}</Text>
    </View>
  );
}

function FaqEntryBlock({ entry, isLast }: { entry: FaqEntry; isLast: boolean }) {
  return (
    <View className={isLast ? '' : 'mb-4 border-b border-neutral-outline-variant/30 pb-4'}>
      <Text className="font-uiBold mb-1.5 text-sm leading-5 text-neutral-on-surface">
        {entry.question}
      </Text>
      <Text className="font-ui text-[13px] leading-[19px] text-neutral-on-surface-variant">
        {entry.answer}
      </Text>

      {entry.facts && entry.facts.length > 0 && (
        <View className="mt-3 rounded-xl bg-surface-lowest px-3 py-1.5">
          {entry.facts.map((fact) => (
            <FactRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Sección desplegable de una categoría de reglas.
 *
 * ── Por qué este componente no usa Reanimated ni clases condicionales ────────
 * El bug de "la caja gris vacía" —al cerrar, la tarjeta queda pintada y sin
 * contenido visible— sobrevivió a dos intentos de arreglo y se reproducía SÓLO
 * en celular: en web nunca apareció. Ese asimetría es el dato que importa,
 * porque web y nativo no comparten motor de estilos.
 *
 * Las tres construcciones native-only que tenía esta pantalla, todas eliminadas:
 *
 *   1. `className` + estilo animado de Reanimated sobre el MISMO nodo
 *      (`<Animated.View style={bodyStyle} className="overflow-hidden">`). En web
 *      son dos motores independientes —CSS por un lado, estilos inline por el
 *      otro— y no se pisan. En nativo NativeWind resuelve el `className` en
 *      runtime y lo compone con el `style` recibido, así que un `height: 0` /
 *      `opacity: 0` animado puede terminar aplicado sobre un nodo distinto del
 *      previsto. Es la explicación que encaja con el síntoma exacto: el fondo de
 *      la tarjeta se sigue pintando y lo de adentro no se ve.
 *
 *   2. Cuerpo en `position: absolute` con alto medido por `onLayout`, dentro de
 *      un contenedor de alto animado y `overflow: hidden`. En Android el
 *      clipping de hijos absolutos es históricamente poco confiable, y un
 *      `onLayout` dentro de un padre de alto 0 puede no dispararse nunca.
 *
 *   3. Clases condicionales (`expanded ? 'text-brand-primary' : 'text-...'`).
 *      En web son dos clases CSS y el navegador recalcula; en nativo obligan a
 *      NativeWind a re-resolver estilos en cada toggle.
 *
 * Lo que queda es deliberadamente aburrido: Views comunes, clases estáticas para
 * layout, colores dinámicos por `style` (el patrón que usaba el mini-ranking de Inicio)
 * y el cuerpo montado o no montado. Sin animación no hay estilo que pueda caer
 * en el nodo equivocado.
 *
 * ⚠️ Antes de volver a agregar una animación acá: verificarla EN DISPOSITIVO,
 * no en web. Este bug es invisible en el navegador.
 */
export function FaqAccordion({ category, expanded, onToggle }: Props) {
  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl bg-surface-container"
      // Borde siempre presente y sólo cambia de color: alternar `borderWidth`
      // movería el layout un píxel en cada toggle.
      style={{
        borderWidth: 1,
        borderColor: expanded ? COLORS.accentBorder : 'transparent',
      }}
    >
      {/* Encabezado: montado siempre, sin animación y sin clases condicionales.
          Es el nodo que desaparecía. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${category.title}. ${expanded ? 'Tocá para contraer' : 'Tocá para desplegar'}`}
        className="flex-row items-center gap-3 px-4 py-4"
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: expanded ? COLORS.accentSoft : COLORS.iconIdleBg }}
        >
          <AppIcon
            family="material-community"
            name={category.icon}
            size={20}
            color={expanded ? COLORS.accent : COLORS.iconIdle}
          />
        </View>

        <View className="flex-1">
          <Text
            className="font-display text-base uppercase tracking-wide"
            style={{ color: expanded ? COLORS.accent : COLORS.title }}
          >
            {category.title}
          </Text>
          <Text
            className="font-ui mt-0.5 text-[11px]"
            style={{ color: COLORS.subtitle }}
            numberOfLines={2}
          >
            {category.subtitle}
          </Text>
        </View>

        {/* Se cambia el glifo en vez de rotarlo: una rotación acá exige un nodo
            animado dentro del encabezado, que es justo lo que se está sacando. */}
        <AppIcon
          family="material-community"
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={expanded ? COLORS.accent : COLORS.subtitle}
        />
      </TouchableOpacity>

      {expanded && (
        <View className="border-t border-neutral-outline-variant/30 px-4 pb-4 pt-4">
          {category.entries.map((entry, index) => (
            <FaqEntryBlock
              key={entry.question}
              entry={entry}
              isLast={index === category.entries.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}
