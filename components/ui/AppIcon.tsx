import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

type IconFamily = 'ionicons' | 'material-community' | 'material-icons';

type AppIconProps = {
  family?: IconFamily;
  name: string;
  size?: number;
  // `ColorValue` y no `string`: React Navigation entrega el color del tab como
  // `ColorValue` (puede ser un `OpaqueColorValue` de PlatformColor), y es lo
  // mismo que aceptan los sets de @expo/vector-icons por debajo.
  color?: ColorValue;
};

export function AppIcon({ family = 'material-community', name, size = 22, color = '#E5E2E1' }: AppIconProps) {
  if (family === 'material-community') {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
  }

  if (family === 'ionicons') {
    return <Ionicons name={name as never} size={size} color={color} />;
  }

  if (family === 'material-icons') {
    return <MaterialIcons name={name as never} size={size} color={color} />;
  }

  return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
}
