import { isReferralLinkSystemPath } from '@/lib/deep-linking';

/**
 * expo-router escucha las URLs que abren la app (Universal Links / App Links y
 * `tornear://`) y navega a su path por su cuenta, en paralelo al listener del
 * `_layout`. Los links `/i/<username>` (referido, embajador, invitación a un
 * equipo) no tienen pantalla propia: los traduce `resolveDeepLink`, que además
 * respeta el gating de sesión. Sin esto, expo-router abría `/i/...` y mostraba
 * «Unmatched Route» encima de la pantalla correcta.
 *
 * `null` = expo-router no navega y queda todo en manos del `_layout`. El resto
 * de las URLs sigue igual que antes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    return isReferralLinkSystemPath(path) ? null : path;
  } catch {
    return path;
  }
}
