// tornear/lib/schemas/authSchema.ts
import * as z from 'zod';

/**
 * Largo minimo de contrasena. FUENTE UNICA DE VERDAD del cliente.
 *
 * DEBE coincidir con supabase/config.toml → [auth] minimum_password_length.
 * Si cambia alla, cambia aca: son las dos unicas puntas del contrato.
 *
 * El bug que resuelve: config.toml ya exigia 8, el cliente validaba 6 y el
 * mapper de errores traducia el rechazo del server como "al menos 6". Resultado:
 * una contrasena de 6-7 pasaba la validacion local, el server la rechazaba y la
 * UI mostraba un minimo que no era el real.
 */
export const PASSWORD_MIN_LENGTH = 8;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ingresa un correo electrónico válido');

/**
 * LOGIN — no revalida el largo a proposito.
 *
 * Las cuentas creadas antes de subir el minimo tienen contrasenas de 6
 * caracteres y deben poder seguir entrando. Quien decide si la credencial es
 * valida es el server; el cliente solo exige que el campo no venga vacio.
 * Validar 8 aca dejaria afuera a usuarios legitimos con un mensaje enganoso.
 */
export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

/**
 * REGISTRO — espejo exacto de la regla del server.
 */
export const signUpSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`),
});

/**
 * RECUPERACIÓN — mismo mínimo que el registro, más la confirmación.
 *
 * La repetición no es decorativa acá: el usuario está tipeando a ciegas una
 * clave que va a necesitar para volver a entrar, y un error de tipeo lo deja
 * afuera obligándolo a repetir todo el circuito del mail.
 */
export const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`),
    confirmPassword: z.string().min(1, 'Repetí la contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type SignInFormData = z.infer<typeof signInSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>;

/**
 * Ambos schemas producen la misma forma ({ email, password }), asi que el
 * formulario de login/registro puede tipar con una sola interfaz y alternar
 * unicamente el resolver.
 */
export type AuthFormData = SignUpFormData;
