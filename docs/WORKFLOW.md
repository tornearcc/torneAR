# Flujo de Trabajo — torneAR

Este documento define el ciclo de desarrollo del proyecto: ramas, validación
automática (CI con GitHub Actions) y manejo de la base de datos (Supabase).

---

## 1. Ramas

> ⚠️ **Convención VIGENTE de este repo (verificada el 2026-09-14): la rama viva
> es `develop`, no `main`.**
>
> La build de producción que está en la App Store (1.0.0, build 9, EAS
> `c487b0e9`) se compiló desde `develop`, commit `f2d97f6`. `main` no recibe
> merges desde el 20/08/2026 y **no** refleja lo que está en producción.
>
> **El repo de la web (`torneAR-web`, carpeta `dashboard/`) usa la convención
> opuesta:** ahí `main` es la rama viva y la que Vercel despliega. Antes de
> mergear, confirmá en qué repo estás.

| Rama | Rol hoy | Qué sale de acá |
|------|---------|-----------------|
| `develop` | **Rama viva.** Integración y fuente de lo que llega a producción. | Builds de EAS (perfil `production`) y `eas update --channel production` |
| `main` | **Desactualizada** desde el 20/08/2026. No representa producción. | Nada. No mergear acá hasta decidir la convención (ver más abajo). |
| `feature/<nombre>` | Trabajo de una feature puntual. Sale de `develop`, vuelve a `develop`. | — |
| `hotfix/<nombre>` | Arreglo urgente. Sale del commit de la build vigente y vuelve a `develop`. | — |

**Reglas:**

- Los features salen de `develop` y vuelven a `develop` por Pull Request.
- **Nunca** abrir un PR hacia `main` "para liberar": hoy ese paso no existe, y
  mergear ahí mezclaría tres semanas de historia divergente.
- **Un OTA empaqueta el JS del checkout local, no el de GitHub.** `eas update`
  se corre parado en el commit que corresponde y sin cambios sin commitear. Si
  el working tree tiene algo más, eso también viaja a los teléfonos.
- **Antes de un OTA, confirmar el commit de la build vigente**, porque el update
  tiene que partir de ahí:
  ```bash
  npx eas-cli build:list --platform ios --limit 1 --json   # → gitCommitHash
  ```
  Una rama de OTA sale de ese commit, no de la punta de `develop` si hubo merges
  posteriores que no deberían llegar todavía a producción.
- **OTA sólo JS.** `runtimeVersion` usa la política `appVersion`: una dependencia
  nativa nueva o un cambio en `app.json` (`version`, permisos, plugins) no puede
  salir por `eas update`; necesita build nueva y App Review.
- **Antes de CADA `eas update`, correr el chequeo de fingerprint:**
  ```bash
  node scripts/check-native-fingerprint.mjs    # iOS
  # --platform android cuando la app esté publicada en Play
  ```
  Compara el fingerprint nativo del checkout contra el del build de producción
  que tiene el mismo runtime (= `version` de `app.json`). Si difiere, el OTA
  llegaría a binarios sin ese código nativo y la app no arrancaría: hay que
  subir `version` y sacar un build, no publicar el update. CI corre lo mismo en
  cada PR (`native-fingerprint`), pero el OTA se publica a mano desde local y
  una rama de hotfix puede no pasar por un PR: **este paso es el que protege de
  verdad.**
- ⚠️ **Tocar los `scripts` de `package.json` cambia el fingerprint** —`android` e
  `ios` contienen `expo run:*`, así que `@expo/fingerprint` incluye esa sección
  entera. Agregar un script de npm deja el check en rojo aunque no haya cambiado
  una línea de código nativo. Por eso el chequeo se invoca como archivo y no
  como `npm run`. Si aparece un rojo así, `eas fingerprint:compare` lo muestra
  en una línea y la salida correcta es no tocar esa sección, no subir `version`.
- **Variables de entorno del OTA:** publicar con `--environment production`, y
  verificar que el `.env` local no pise nada (`EXPO_PUBLIC_*` se incrustan en el
  bundle al publicar).

### Crear y trabajar una feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/caja-del-equipo

# ... trabajás, commiteás ...
git push -u origin feature/caja-del-equipo
```

Luego se abre un **Pull Request `feature/... → develop`**. Al pasar CI, se
mergea a `develop`.

### Publicar a producción

- **Build nueva (binario):** desde `develop`, `eas build --profile production`,
  y submit. Anotar el `gitCommitHash` de la build en el PR o en el release.
- **OTA:** desde la rama que parte del commit de la build vigente,
  `eas update --channel production --environment production --platform ios --rollout-percentage 10`,
  24 h mirando `app_logs` de nivel `error`, y recién después al 100%.

### ¿Alinear con la web o dejarlo documentado?

Pendiente de decisión. La propuesta es alinear el **significado**, no el nombre
de la rama: que en los dos repos `main` sea "lo que está en producción".

- En este repo: fast-forward de `main` al commit de cada build que se publica en
  las tiendas, más un tag (`ios-1.0.0-b9`). `develop` sigue siendo la rama de
  integración.
- Hasta que eso se haga, esta sección manda y `main` no se toca.

---

## 2. Integración Continua (CI) — GitHub Actions

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

**Se dispara en:**
- Pull Requests hacia `main` y `develop`.
- Push directo a `main` y `develop`.

**No se dispara si el cambio toca sólo documentación** (`docs/`, `README.md`,
`CLAUDE.md`): `paths-ignore` en `ci.yml` y en los dos workflows de EAS. Un PR
que mezcla documentación con cualquier otro archivo corre entero.

> ⚠️ **Choca con la branch protection de abajo.** Si se marca un check de CI
> como obligatorio, un PR de sólo documentación queda esperando un check que
> nunca corre. Antes de activarla, pasar el filtro de `paths-ignore` (workflow)
> a un filtro por job con `if:`: GitHub cuenta los jobs salteados como aprobados.

**Qué valida (en orden; si algo falla, el check queda rojo):**
1. `npm ci` — instalación reproducible desde `package-lock.json`.
2. `npx tsc --noEmit` — chequeo de tipos TypeScript (modo estricto).
3. `npm run lint` — ESLint (config de Expo).
4. `npm test` — suite de Vitest (una corrida).

### Branch protection (configurar en GitHub una vez)

Para que un PR **no se pueda mergear si CI falla**, activar en
**Settings → Branches → Branch protection rules** para `develop` (la rama viva)
y `main`:

- ✅ *Require a pull request before merging*.
- ✅ *Require status checks to pass before merging* → seleccionar el check
  **"Type check · Lint · Tests"**.
- ✅ *Require branches to be up to date before merging* (opcional pero recomendado).

> Sin branch protection, CI corre igual e informa el resultado, pero GitHub
> permite mergear a mano. La protección es lo que **bloquea** el merge.

---

## 3. Estrategia de Supabase — Single Project (Free Tier)

**Decisión operativa:** por estar en el **plan gratuito** de Supabase (sin
Branching nativo) y por decisión de proyecto, **NO usamos un proyecto de Staging
separado**. Todas las ramas apuntan al **mismo y único proyecto de Supabase:
`yusfykqimalghmmhlfdn` (`tornear-db`) — el de Producción.**

| Entorno | Proyecto Supabase | Rama git |
|---------|-------------------|----------|
| **Producción** | `yusfykqimalghmmhlfdn` (`tornear-db`) | todas (comparten DB) |

> ⚠️ **Ninguna rama tiene una base de datos aislada.** Cualquier migración,
> RPC, trigger, edge function, seed o test con escritura impacta
> **directamente los datos reales de producción**.

El aislamiento de entornos queda entonces **solo a nivel de código** (ramas + CI).
La base es compartida, así que el cuidado con los datos es **manual y disciplinado**.

### ⚠️ Best practices obligatorias (base compartida con Producción)

Como no hay Staging, estas reglas son la única protección de los datos reales:

1. **Probá primero en local, no contra el proyecto compartido.** Para cambios de
   schema o lógica riesgosa, levantá una base local y validá ahí:
   ```bash
   supabase start          # Postgres + stack local (Docker)
   supabase db reset       # aplica TODAS las migraciones sobre la DB LOCAL
   # ... probás ...
   supabase stop
   ```
   El `supabase db reset` es **destructivo**: solo se corre contra la base
   **local**, nunca contra el proyecto compartido.

2. **Tests SQL contra el proyecto real: siempre en transacción abortada.**
   Envolvé cualquier prueba que inserte/actualice en `BEGIN; ... ROLLBACK;`
   (o `savepoint`), como en `supabase/tests/*.sql`. Nunca dejes datos de prueba
   persistidos. Si insertás algo para probar, **borralo en el mismo paso**.

3. **Migraciones = forward-only y directas a Producción.** No hay "ensayo" en
   otra base: cuando corrés `supabase db push`, va a prod. Revisá cada migración
   con cuidado extra, hacela idempotente (`IF NOT EXISTS`, `OR REPLACE`) y evitá
   operaciones destructivas (`DROP`, `DELETE` masivos, `TRUNCATE`).

4. **Nunca corras `db reset` contra el proyecto compartido.** Es solo para la
   base local. Con los seeds hay que distinguir cuál:

   | Archivo | Para qué | Cómo se aplica |
   |---------|----------|----------------|
   | `supabase/seed_testing.sql` | Fixtures de los pgTAP + la liga de 16 equipos / 160 jugadores para probar la UI | Automático en `supabase db reset` / `supabase start` (`sql_paths` de `config.toml`). **Jamás en producción.** |
   | `supabase/seed.sql` | Seed de **producción**: catálogo de zonas, Temporada 1, predios y los perfiles admin | A mano, una sola vez: `psql "$PROD_DB_URL" -f supabase/seed.sql`. Es idempotente y no se aplica en local. |

   Los catálogos `badges` y `format_rules` no están en ningún seed: los siembran
   sus propias migraciones, así que viajan con `db push`.

5. **`.env` apunta al mismo proyecto en todas las ramas.** No hay credenciales de
   Staging; `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` son las de
   producción. Tenelo presente: la app en modo dev lee/escribe datos reales.

6. **Ventana de bajo tráfico para cambios sensibles.** Al aplicar migraciones o
   probar flujos con escritura, preferí horarios de poco uso y avisá al equipo.

### Flujo de migraciones (single project)

```bash
# Una sola vez: linkear el CLI al proyecto de producción
supabase link --project-ref yusfykqimalghmmhlfdn

# Tras validar en LOCAL, aplicar migraciones y funciones al proyecto (= prod)
supabase db push
supabase functions deploy
```

Las migraciones (`supabase/migrations/`) y edge functions (`supabase/functions/`)
siguen siendo la **única fuente de verdad**; nunca se modifica el schema a mano
por fuera de una migración versionada.

> Las RPCs `dashboard_*` que usa la web también se versionan **acá**, no en
> `torneAR-web`. Si una migración se aplica con `apply_migration` del MCP de
> Supabase, el servidor le asigna su propio `version`: renombrar el archivo
> local a ese `version` o `db push` intentará aplicarla de nuevo.

### Secretos

El proyecto tiene sus secretos de Vault y variables de edge functions. El valor
real (ej. `push_dispatch_secret`) se carga a mano en el Vault del dashboard y
**nunca** se versiona en git (los archivos de migración usan placeholders).

### Camino a futuro

Cuando el proyecto justifique el plan Pro, migrar a **dos proyectos
(Staging + Prod)** o a **Supabase Branching nativo** para recuperar el
aislamiento de datos por entorno. Hasta entonces, rige la disciplina de arriba.

---

## 4. Checklist rápido

**Nueva feature:**
1. `git checkout develop && git pull`
2. `git checkout -b feature/<nombre>`
3. Si hay cambios de schema → nueva migración en `supabase/migrations/`, validada
   **en local** (`supabase start` + `supabase db reset`). ⚠️ Recordá: no hay
   Staging; aplicar al proyecto compartido = aplicar a Producción.
4. Commit + `git push -u origin feature/<nombre>` + PR hacia **`develop`**.
5. CI verde + review → merge.

**Release a producción (hoy):**
1. Migraciones: `supabase db push` (impacta la base real — con cuidado, en
   ventana de bajo tráfico). Van **antes** del binario o del OTA que las usa.
2. Binario: `eas build --profile production` desde `develop` + submit.
3. OTA: `npm run ota:check` (obligatorio) y después
   `eas update --channel production --environment production --platform ios --rollout-percentage 10`
   desde el commit de la build vigente, 24 h de observación, luego 100%.
4. `main` no se toca (ver §1).
