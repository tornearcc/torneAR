import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { AppDateTimePicker } from '@/components/ui/AppDateTimePicker';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
} from 'react-hook-form';
import { AppIcon } from '@/components/ui/AppIcon';
import { applyDateMask, fromDateToDisplay, fromDisplayToDate } from '@/lib/date-mask';
import { maxSignupBirthDate, MINIMUM_SIGNUP_AGE } from '@/lib/age';
import type { UserProfileFormData } from '@/lib/schemas/userSchema';

const GENDER_OPTIONS: { value: UserProfileFormData['gender']; label: string }[] = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'X', label: 'Otro' },
];

const FOOT_OPTIONS: { value: UserProfileFormData['strongFoot']; label: string }[] = [
  { value: 'RIGHT', label: 'Diestro' },
  { value: 'LEFT', label: 'Zurdo' },
  { value: 'BOTH', label: 'Ambidiestro' },
];

interface ProfileFormFieldsProps {
  control: Control<UserProfileFormData>;
  errors: FieldErrors<UserProfileFormData>;
  setValue: UseFormSetValue<UserProfileFormData>;
  onOpenFavoriteTeamPicker: () => void;
}

/**
 * Bloque de datos personales compartido por /onboarding y /profile-edit:
 * fecha de nacimiento, genero, pierna habil y cuadro favorito.
 *
 * Existe para cerrar el bug 2. Antes cada pantalla renderizaba sus propios
 * campos y editar-perfil se habia quedado sin tres de los que el schema exige,
 * asi que el resolver fallaba en silencio y "Guardar cambios" no hacia nada.
 * Con un unico componente, lo que el onboarding pide es exactamente lo que la
 * edicion expone: las dos pantallas no pueden volver a divergir.
 */
export function ProfileFormFields({
  control,
  errors,
  setValue,
  onOpenFavoriteTeamPicker,
}: ProfileFormFieldsProps) {
  /*
   * useWatch y NO el `watch` de useForm — no es un detalle de estilo.
   *
   * `watch(name)` se apoya en `control._names.watch`, un Set global del form.
   * `reset()` lo vacia (react-hook-form/dist/index.esm.mjs:2322) y el evento que
   * emite no alcanza para re-renderizar el root, asi que el Set nunca se vuelve
   * a poblar. A partir de ese momento cada `setValue()` toma la rama "campo no
   * observado" y emite un payload que la suscripcion raiz descarta: la pantalla
   * deja de re-renderizar y estos valores quedan congelados en la foto del reset.
   *
   * Sintoma exacto: en /profile-edit (que hace reset al hidratar el perfil) el
   * chip verde no se movia al tocar otro genero/pierna, y el cuadro favorito
   * seguia mostrando el anterior.
   *
   * useWatch crea una suscripcion propia por componente (`formState: { values:
   * true }`, con `isGlobal = false`), asi que no depende de `_names.watch` y es
   * inmune al reset.
   */
  const selectedGender = useWatch({ control, name: 'gender' });
  const selectedFoot = useWatch({ control, name: 'strongFoot' });
  const selectedFavoriteTeam = useWatch({ control, name: 'favoriteTeam' });
  const selectedBirthDate = useWatch({ control, name: 'dateOfBirth' });

  const [showBirthPicker, setShowBirthPicker] = React.useState(false);

  /*
   * Tope del calendario: la fecha más reciente que sigue dando 18 años.
   *
   * Se calcula una vez por montaje. Recalcularlo en cada render no aporta —
   * nadie cruza la medianoche con el formulario abierto— y devolvería un `Date`
   * nuevo cada vez, que es una prop inestable para el picker.
   */
  const maxBirthDate = React.useMemo(() => maxSignupBirthDate(), []);

  /*
   * Valor de apertura del calendario. Si el campo ya tiene una fecha válida
   * abre ahí; si no, abre en el tope (18 años exactos) y no en "hoy": abriendo
   * en hoy el usuario tiene que retroceder 18 años a mano cada vez, y encima
   * arranca parado sobre una fecha que el propio picker no le deja elegir.
   */
  const birthPickerValue = fromDisplayToDate(selectedBirthDate ?? '') ?? maxBirthDate;

  return (
    <View className="gap-6">
      {/* ── FECHA DE NACIMIENTO ─────────────────────────────────────────── */}
      <View>
        <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
          Fecha de Nacimiento
        </Text>
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field: { onChange, onBlur, value } }) => (
            <>
              {/* Se conserva el tipeo además del calendario: para una fecha de
                  hace 30 años, escribir 8 dígitos es más rápido que scrollear.
                  El calendario es el que comunica el límite de edad; el schema
                  lo vuelve a validar por si la fecha entró tipeada. */}
              <View className="flex-row items-center gap-2">
                <TextInput
                  className={`flex-1 rounded-xl border px-4 py-4 text-neutral-on-surface ${
                    errors.dateOfBirth ? 'border-red-500' : 'border-neutral-outline-variant/15'
                  } bg-surface-low`}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#3A3939"
                  keyboardType="numeric"
                  maxLength={10}
                  onBlur={onBlur}
                  onChangeText={(text) => onChange(applyDateMask(text))}
                  value={value ?? ''}
                />
                <TouchableOpacity
                  onPress={() => setShowBirthPicker(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Elegir fecha de nacimiento en el calendario"
                  className={`h-[54px] w-[54px] items-center justify-center rounded-xl border bg-surface-low ${
                    errors.dateOfBirth ? 'border-red-500' : 'border-neutral-outline-variant/15'
                  }`}
                >
                  <AppIcon family="material-community" name="calendar" size={22} color="#BCCBB9" />
                </TouchableOpacity>
              </View>

              <AppDateTimePicker
                visible={showBirthPicker}
                value={birthPickerValue}
                mode="date"
                title="Fecha de nacimiento"
                /* El bloqueo visual del backlog: el calendario no ofrece
                   ninguna fecha que deje al usuario con menos de 18. */
                maximumDate={maxBirthDate}
                onCancel={() => setShowBirthPicker(false)}
                onConfirm={(date) => {
                  setShowBirthPicker(false);
                  onChange(fromDateToDisplay(date));
                }}
              />
            </>
          )}
        />
        {errors.dateOfBirth ? (
          <Text className="text-red-500 text-xs mt-1">{errors.dateOfBirth.message}</Text>
        ) : (
          <Text className="font-ui mt-1 text-xs text-neutral-outline">
            Tenés que ser mayor de {MINIMUM_SIGNUP_AGE} años para usar torneAR.
          </Text>
        )}
      </View>

      {/* ── GÉNERO ──────────────────────────────────────────────────────── */}
      <View>
        <Text className="font-display text-xs uppercase tracking-wider mb-3 text-neutral-on-surface-variant">
          Género
        </Text>
        <View className="flex-row gap-3">
          {GENDER_OPTIONS.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              activeOpacity={0.85}
              // La selección se comunica solo por color: sin esto un lector de
              // pantalla no puede saber cuál está elegida. Además es la señal
              // que usa el test de componente, porque el className de NativeWind
              // no llega al DOM. Props W3C (RN 0.71+): valen en nativo y en web.
              role="radio"
              aria-selected={selectedGender === value}
              onPress={() => setValue('gender', value, { shouldValidate: true })}
              className={`flex-1 py-3.5 rounded-xl border items-center ${
                selectedGender === value
                  ? 'bg-brand-primary border-[#003914]'
                  : 'bg-surface-low border-neutral-outline-variant/15'
              }`}
            >
              <Text
                className={`font-display uppercase tracking-widest text-xs ${
                  selectedGender === value ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                }`}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.gender && (
          <Text className="text-red-500 text-xs mt-2">{errors.gender.message}</Text>
        )}
      </View>

      {/* ── PIERNA HÁBIL ────────────────────────────────────────────────── */}
      <View>
        <Text className="font-display text-xs uppercase tracking-wider mb-3 text-neutral-on-surface-variant">
          Pierna Hábil
        </Text>
        <View className="flex-row gap-3">
          {FOOT_OPTIONS.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              activeOpacity={0.85}
              role="radio"
              aria-selected={selectedFoot === value}
              onPress={() => setValue('strongFoot', value, { shouldValidate: true })}
              className={`flex-1 py-3.5 rounded-xl border items-center ${
                selectedFoot === value
                  ? 'bg-brand-primary border-[#003914]'
                  : 'bg-surface-low border-neutral-outline-variant/15'
              }`}
            >
              <Text
                className={`font-display uppercase tracking-widest text-xs ${
                  selectedFoot === value ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                }`}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.strongFoot && (
          <Text className="text-red-500 text-xs mt-2">{errors.strongFoot.message}</Text>
        )}
      </View>

      {/* ── CUADRO FAVORITO (obligatorio, catálogo cerrado) ─────────────── */}
      <View>
        <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
          Cuadro Favorito
        </Text>
        <TouchableOpacity
          onPress={onOpenFavoriteTeamPicker}
          activeOpacity={0.8}
          className={`w-full rounded-xl px-4 py-4 flex-row justify-between items-center border ${
            errors.favoriteTeam ? 'border-red-500' : 'border-neutral-outline-variant/15'
          } bg-surface-low`}
        >
          <Text
            className={`flex-1 ${selectedFavoriteTeam ? 'text-neutral-on-surface' : 'text-surface-bright'}`}
            style={{ minWidth: 0 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {selectedFavoriteTeam || 'Selecciona tu equipo'}
          </Text>
          <AppIcon family="material-icons" name="keyboard-arrow-down" size={22} color="#BCCBB9" />
        </TouchableOpacity>
        {errors.favoriteTeam && (
          <Text className="text-red-500 text-xs mt-1">{errors.favoriteTeam.message}</Text>
        )}
      </View>
    </View>
  );
}
