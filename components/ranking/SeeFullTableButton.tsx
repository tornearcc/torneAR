import { Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
    onPress: () => void;
    /** Cuántas filas hay en total, si se sabe (equipos sí; jugadores es paginado). */
    total?: number;
}

/** Enlace al pie de las tablas de la pestaña Ranking hacia `app/ranking-full`. */
export function SeeFullTableButton({ onPress, total }: Props) {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            accessibilityRole="button"
            className="mt-1 flex-row items-center justify-center gap-1 rounded-xl py-2.5"
        >
            <Text className="font-uiBold text-xs text-brand-primary">
                Ver tabla completa{total !== undefined ? ` (${total})` : ''}
            </Text>
            <AppIcon family="material-community" name="chevron-right" size={16} color="#53E076" />
        </TouchableOpacity>
    );
}
