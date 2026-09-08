import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  showNotesInput?: boolean;
  notesPlaceholder?: string;
  loading?: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación reutilizable y 100% custom (nada de Alert nativo).
 * Overlay + card del sistema de diseño, con campo de notas opcional.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmTone = 'primary',
  showNotesInput = false,
  notesPlaceholder = 'Notas (opcional)',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [notes, setNotes] = useState('');

  // Se limpia en el flanco de cierre, ajustando el estado durante el render en
  // vez de copiarlo con un efecto: la próxima apertura no arrastra las notas de
  // la anterior y no hay un render intermedio con el texto viejo.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setNotes('');
  }

  if (!visible) return null;

  const confirmBg = confirmTone === 'danger' ? 'bg-danger-error' : 'bg-brand-primary';

  return (
    // Con `showNotesInput`, el teclado tapaba el textarea y los botones
    // Confirmar/Cancelar: la card esta centrada y no scrollea.
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="absolute inset-0 z-[999] items-center justify-center bg-black/80 p-6"
    >
      <TouchableWithoutFeedback onPress={loading ? undefined : onCancel}>
        <View className="absolute inset-0" />
      </TouchableWithoutFeedback>

      <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-6 shadow-2xl">
        <Text className="font-display mb-2 text-xl text-neutral-on-surface">{title}</Text>
        <Text className="font-ui mb-4 text-base leading-6 text-neutral-on-surface-variant">{message}</Text>

        {showNotesInput && (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={notesPlaceholder}
            placeholderTextColor="#869585"
            multiline
            textAlignVertical="top"
            className="font-ui mb-4 min-h-[64px] rounded-xl bg-surface-container p-3 text-sm text-neutral-on-surface"
          />
        )}

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={onCancel}
            disabled={loading}
            activeOpacity={0.8}
            className="flex-1 items-center rounded-xl bg-surface-container py-3"
          >
            <Text className="font-uiBold text-sm text-neutral-on-surface">{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm(notes)}
            disabled={loading}
            activeOpacity={0.9}
            className={`flex-1 items-center rounded-xl py-3 ${confirmBg}`}
          >
            <Text className="font-uiBold text-sm text-surface-base">
              {loading ? 'Procesando…' : confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
