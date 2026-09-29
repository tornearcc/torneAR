import { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useEvidencePhoto } from '@/hooks/useEvidencePhoto';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';

const MAX_LENGTH = 500;

interface Props {
  visible: boolean;
  onClose: () => void;
  claimingTeamName: string;
  onSubmit: (data: { text: string; photoBase64: string | null; photoMimeType: string }) => Promise<void>;
}

/**
 * D-61: la versión del equipo acusado de un reclamo de WO. Texto obligatorio
 * y foto opcional; una sola respuesta por reclamo (la valida respond_wo_claim).
 */
export function WoResponseModal({ visible, onClose, claimingTeamName, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();
  const { photoBase64, photoUri, photoMimeType, pickImage, takePhoto } = useEvidencePhoto(showAlert);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      showAlert('Falta tu versión', 'Contá qué pasó para que el administrador pueda comparar.', undefined, 'warning');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({ text: trimmed, photoBase64, photoMimeType });
      Logger.info('Respuesta a un reclamo de WO enviada desde el modal', {
        scope: 'WoResponseModal.submit',
        withPhoto: photoBase64 !== null,
      });
      onClose();
    } catch (err) {
      Logger.error('No se pudo enviar la respuesta al reclamo de WO', {
        scope: 'WoResponseModal.submit',
        error: err,
      });
      showAlert(
        'No se pudo enviar tu versión',
        getGenericSupabaseErrorMessage(err, 'No pudimos enviar tu respuesta. Intentá de nuevo.'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} overlay={AlertComponent}>
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Dar nuestra versión</Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View className="mb-4 rounded-xl bg-info-secondary/10 p-4">
          <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
            {claimingTeamName} dice que no se presentaron. Contá qué pasó: el administrador va a ver las dos versiones
            y quién hizo check-in antes de decidir. Se puede mandar una sola vez.
          </Text>
        </View>

        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">Qué pasó *</Text>
        <TextInput
          className="min-h-[110px] rounded-xl bg-surface-high px-4 py-3 font-ui text-sm text-neutral-on-surface"
          placeholder="Ej.: llegamos 20:50 y la cancha estaba ocupada por otro partido"
          placeholderTextColor="#869585"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_LENGTH}
          textAlignVertical="top"
        />
        <Text className="font-ui mb-4 mt-1 text-right text-[10px] text-neutral-outline">
          {text.length}/{MAX_LENGTH}
        </Text>

        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Foto (opcional)
        </Text>
        {photoUri ? (
          <View className="overflow-hidden rounded-xl border-2 border-dashed border-brand-primary">
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160 }} contentFit="cover" />
          </View>
        ) : null}
        <View className="mb-4 mt-2 flex-row gap-2">
          <TouchableOpacity
            onPress={() => void pickImage()}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-2.5"
          >
            <AppIcon family="material-community" name="image-outline" size={18} color="#BCCBB9" />
            <Text className="font-uiBold text-sm text-neutral-on-surface">Galería</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void takePhoto()}
            activeOpacity={0.8}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-2.5"
          >
            <AppIcon family="material-community" name="camera-outline" size={18} color="#BCCBB9" />
            <Text className="font-uiBold text-sm text-neutral-on-surface">Cámara</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => void submit()}
          disabled={loading}
          activeOpacity={0.8}
          className="rounded-xl bg-brand-primary py-3.5"
        >
          <Text className="font-uiBold text-center text-sm text-[#003914]">
            {loading ? 'Enviando...' : 'Enviar nuestra versión'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
