import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { AlertType } from '@/components/ui/CustomAlert';

type ShowAlert = (title: string, message: string, onClose?: () => void, type?: AlertType) => void;

/**
 * Foto de evidencia para un WO: galería o cámara, con base64 para subirla al
 * bucket wo_evidences. La usan el reclamo (WoModal) y la respuesta del equipo
 * acusado (WoResponseModal).
 */
export function useEvidencePhoto(showAlert: ShowAlert) {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');

  function keep(result: ImagePicker.ImagePickerResult) {
    if (!result.canceled && result.assets[0]) {
      setPhotoBase64(result.assets[0].base64 ?? null);
      setPhotoUri(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar evidencia.', undefined, 'warning');
      return;
    }
    keep(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      }),
    );
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso requerido', 'Necesitamos acceso a tu cámara para tomar evidencia.', undefined, 'warning');
      return;
    }
    keep(
      await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      }),
    );
  }

  function clear() {
    setPhotoBase64(null);
    setPhotoUri(null);
    setPhotoMimeType('image/jpeg');
  }

  return { photoBase64, photoUri, photoMimeType, pickImage, takePhoto, clear };
}
