# Las Reglas del Juego — Guía de Transparencia de torneAR

Este documento explica **cómo funciona torneAR por dentro**, con los números y las
condiciones exactas que aplica el sistema hoy. No es una declaración de
intenciones: cada regla que vas a leer acá está implementada en el código y en la
base de datos, y se indica dónde vive por si alguien del equipo necesita
verificarla.

Sirve para dos cosas:

1. **Manual interno** — la fuente de verdad de qué hace la app y por qué.
2. **Base de la futura pantalla de Preguntas Frecuentes** — cada sección está
   escrita para poder leerse tal cual desde la app.

> **Cómo leerlo:** los recuadros `así` son valores exactos del sistema. Los que
> están marcados como **ajustable** viven en la tabla `app_settings` y el equipo
> de torneAR puede cambiarlos sin actualizar la app — si algún día un número no
> coincide con lo que ves en pantalla, el que manda es el de la app.

---

## Índice

1. [La Home: qué estás viendo](#1-la-home-qué-estás-viendo)
2. [Tipos de partido: Amistoso vs. Ranking](#2-tipos-de-partido-amistoso-vs-ranking)
3. [El check-in: el sistema anti-fantasmas](#3-el-check-in-el-sistema-anti-fantasmas)
4. [El ranking: cómo se mueve tu Elo](#4-el-ranking-cómo-se-mueve-tu-elo)
5. [Fair Play: el otro puntaje](#5-fair-play-el-otro-puntaje)
6. [Qué pasa cuando un partido queda colgado](#6-qué-pasa-cuando-un-partido-queda-colgado)
7. [El Mercado y los perfiles](#7-el-mercado-y-los-perfiles)
8. [Roles: quién puede hacer qué](#8-roles-quién-puede-hacer-qué)
9. [Los chats: quién habla y quién lee](#9-los-chats-quién-habla-y-quién-lee)
10. [Tabla resumen de todos los números](#10-tabla-resumen-de-todos-los-números)

---

## 1. La Home: qué estás viendo

### 1.1 La cuenta regresiva del próximo partido

La tarjeta grande de arriba muestra **un solo partido**: el más cercano en el
tiempo entre todos los partidos abiertos de todos tus equipos.

**Cómo lo elige el sistema:**

- Se traen tus partidos en estado `PENDIENTE`, `CONFIRMADO` o `EN_VIVO`
  (los tres estados en los que todavía queda algo por hacer).
- De ésos se descartan los que **ya empezaron** (`EN_VIVO`) y los que **no tienen
  fecha acordada todavía**.
- De los que quedan, se muestra el de fecha más próxima.

Por eso un partido `PENDIENTE` sin fecha no aparece en la tarjeta: no hay nada
que contar hasta que se acuerde el día y la hora.

**Cuándo aparece el reloj:**

| Falta… | Qué ves |
|---|---|
| Más de 24 h | La fecha larga: `vie 8 ago · 21:30` |
| 24 h o menos | La cuenta regresiva `HH : MM : SS`, con el borde verde |
| Ya pasó la hora | «¡Es la hora del partido!» |

El reloj **late cada segundo** dentro de las últimas 24 h y **cada 30 segundos**
fuera de esa ventana (lo justo para detectar el cruce sin gastar batería). Se
detiene cuando salís de la pantalla y se re-sincroniza con la hora real cada vez
que volvés: si dejaste la app en segundo plano tres horas, al volver la cuenta ya
está corregida, no arranca atrasada.

> Referencia técnica: `app/(tabs)/index.tsx` (`COUNTDOWN_WINDOW_MS`,
> `COUNTDOWN_TICK_MS`, `IDLE_TICK_MS`).

### 1.2 El mini-ranking (Top 3)

La tarjeta «Top 3» es el podio de la **categoría de tu equipo** (Hombres,
Mujeres o Mixto), **sin filtro de zona ni de formato**.

Se arma en dos pasos:

1. Se elige tu equipo de referencia: **el equipo activo** que tenés seleccionado
   y, si no hay ninguno seleccionado, el primero de tu lista.
2. Se toma la **categoría** de ese equipo y se pide el ranking de esa categoría,
   recortado a las tres primeras posiciones. Como no hay filtro de formato, cada
   equipo aparece con el Elo de su **mejor formato** (ver §4.1).

La zona y el formato no se heredan a propósito: con pocos equipos, «mi zona × mi
formato × mi categoría» suele tener uno o dos equipos, o ninguno, y la tarjeta
quedaba vacía en el centro de la pantalla principal.

Es exactamente la misma consulta que alimenta la pestaña **Ranking** (`get_team_ranking`),
así que los números coinciden siempre. Si tu equipo está en el podio, la fila
aparece resaltada en verde con la etiqueta «Tu equipo».

**Casos particulares, dichos con todas las letras:**

- Si todavía no tenés equipo, la tarjeta no se muestra (ves la pantalla de
  bienvenida con las opciones de crear o unirte a un equipo).
- Si todavía no hay equipos rankeados en tu categoría, ves «Todavía no hay
  equipos rankeados». No es un error.
- Si no se puede leer la categoría de tu equipo, la tarjeta muestra el Top 3 sin
  filtro de categoría en vez de quedar vacía.
- Si la consulta del ranking falla, **sólo se apaga esa tarjeta**: el resto de la
  Home sigue funcionando normal. Es deliberado.

---

## 2. Tipos de partido: Amistoso vs. Ranking

torneAR tiene **dos tipos de partido**, y la diferencia no es cosmética.

|  | **Amistoso** | **Ranking** |
|---|---|---|
| Mueve el Elo | ❌ No | ✅ Sí |
| Suma partidos jugados y G/E/P | ✅ Sí | ✅ Sí |
| Suma goles a favor y en contra | ✅ Sí | ✅ Sí |
| Cancha del catálogo obligatoria | ❌ Opcional | ✅ **Obligatoria** |
| Check-in con validación por GPS | Sólo si se eligió cancha | ✅ Siempre |
| Límite de partidos entre los mismos equipos | Sin límite | ✅ 3 por temporada |
| Espera obligatoria entre revanchas | Sin espera | ✅ 30 días |
| Bloqueo por jugadores compartidos | ❌ No aplica | ✅ Con 2 o más |
| Cuenta para goleadores, MVP y trofeos | ✅ Sí | ✅ Sí |

### 2.1 Por qué el Ranking exige cancha del catálogo

Un partido de ranking mueve el Elo, y el Elo se defiende con el check-in por
ubicación. **Sin una cancha del catálogo no hay coordenadas contra las cuales
medir**, y el control geográfico simplemente no existiría.

Por eso el sistema lo impide en dos capas:

- **En la app:** el formulario de propuesta no te deja enviar una propuesta de
  ranking sin elegir zona y complejo. El motivo aparece escrito debajo del botón,
  no como un error después de tocar.
- **En el servidor:** un disparador de la base rechaza confirmar cualquier
  partido de ranking sin cancha asignada, con el error `VENUE_REQUIRED`. Esto vale
  aunque alguien intente saltear la app.

En un **amistoso** la cancha es opcional. Si la elegís, se valida igual con GPS;
si no, el check-in se registra sin verificación geográfica. Es una decisión
tomada a propósito: el amistoso no reparte puntos, así que no necesita el mismo
nivel de prueba.

### 2.2 Qué NO se puede cargar a mano

**La dirección de la cancha no se escribe.** Se elige de un catálogo de zonas y
complejos cargados por torneAR. El selector de zonas **sólo muestra zonas que
tienen al menos un complejo activo**, para que no puedas entrar en un callejón sin
salida eligiendo una zona vacía.

Si en tu zona todavía no hay complejos, vas a ver: *«Todavía no hay complejos
cargados. Escribinos para sumar tu cancha y poder proponer partidos de ranking.»*
Mientras tanto podés jugar amistosos sin restricción.

### 2.3 Las reglas anti-amaño de los partidos de Ranking

Cuando desafiás a otro equipo a un partido de ranking, el sistema verifica:

1. **Jugadores compartidos.** Si los dos planteles comparten **2 o más
   jugadores**, el desafío se rechaza. Dos equipos con el mismo núcleo pueden
   pactar resultados.
2. **Enfriamiento de 30 días.** Si ya jugaron un partido de ranking en los
   últimos 30 días, hay que esperar. La cuenta se hace sobre **cuándo se jugó**
   el partido, no sobre cuándo se creó (un partido creado hace 40 días pero
   jugado la semana pasada bloquea igual).
3. **Máximo 3 por temporada** entre los mismos dos equipos, contando todos los
   partidos abiertos y cerrados.
4. **Diferencia de Elo mayor a 400** → sólo genera un aviso informativo. **No
   bloquea nada**: si querés jugar contra un equipo mucho más fuerte, podés.
5. **Equipos dados de baja** no pueden desafiar ni recibir desafíos.
6. **Un solo desafío activo por par de equipos.** No podés mandar un segundo
   desafío hasta que respondan el primero (o hasta que venza a los 14 días).

Además, al **confirmar** el partido se verifica que **los dos planteles** lleguen
al mínimo de jugadores del formato acordado. Se valida a los dos, no sólo al que
confirma: el proponente es justamente quien eligió el formato, y nada garantizaba
que pudiera cubrirlo.

> ⚠️ Ese conteo mira los **miembros del equipo**. Los invitados que entran con
> código todavía no existen al momento de confirmar, así que **no cuentan para
> confirmar** — aunque sí cuentan para el check-in (ver 3.3).

---

## 3. El check-in: el sistema anti-fantasmas

Es el corazón de la honestidad de torneAR. La pregunta que responde es simple:
**¿se presentaron los dos equipos o no?**

### 3.1 Cuándo se habilita

```
Se abre:   2 horas ANTES del horario pactado
Se cierra: 1 hora DESPUÉS del horario pactado
```

Fuera de esa ventana el botón no aparece y ves el mensaje *«El check-in se
habilita 2 horas antes del partido»*.

**Aclaración honesta:** esa ventana la aplica **la app**. El servidor, por su
lado, sólo exige que el partido esté en estado `CONFIRMADO` o `EN_VIVO`. Es decir:
la ventana horaria es una regla de la interfaz, no una barrera criptográfica. Lo
que sí controla el servidor sin excepción son la pertenencia al equipo, el estado
del partido y la ubicación.

### 3.2 Dos hechos distintos: «yo llegué» ≠ «mi equipo se presentó»

Esto es lo más importante de toda la sección, y es lo que hace que el sistema no
se pueda romper con un solo dedo.

| Hecho | Qué lo produce |
|---|---|
| **Yo llegué** | Tu propio check-in. Siempre se registra, con hora y coordenadas. |
| **Mi equipo se presentó** | Se sella **sólo cuando el equipo junta el quórum** de jugadores con check-in. |

Antes, el tap de una sola persona sellaba la presencia del equipo entero — y como
el walkover automático lee exactamente ese sello, **un jugador solo parado en la
cancha podía regalarse un 3-0** o anular un walkover legítimo en su contra. Eso ya
no es posible.

Cuando marcás tu llegada y todavía no hay quórum, la app te lo dice con el número
exacto: *«Marcaste tu llegada (3/6). Faltan 3 compañero(s) para dar por presentado
al equipo.»*

### 3.3 El quórum, formato por formato

El mínimo sale del catálogo oficial de formatos (`format_rules`):

| Formato | En cancha | **Mínimo para presentarse** | Máximo de convocados |
|---|---|---|---|
| Fútbol 5 | 5 | **4** | 10 |
| Fútbol 6 | 6 | **5** | 12 |
| Fútbol 7 | 7 | **6** | 14 |
| Fútbol 8 | 8 | **6** | 15 |
| Fútbol 9 | 9 | **7** | 16 |
| Fútbol 11 | 11 | **7** | 18 |

*(Si un partido antiguo no tuviera formato asignado, el mínimo de respaldo es **4**.
Nunca 1: el sentido de la regla es que una sola persona no alcanza.)* **Ajustable.**

**Los invitados SÍ cuentan para el quórum.** Si completaste el equipo con
jugadores que entraron por el código único del partido, cuentan igual: están
físicamente en la cancha, que es lo único que el sello afirma. Es a propósito más
flexible que la validación de confirmación, y compensa esa rigidez.

**El sello se pone una sola vez.** Si el capitán ya presentó la lista, la hora
original se conserva: re-sellar movería hacia adelante la hora de llegada del
equipo y falsearía la evidencia en caso de disputa.

Cuando **los dos equipos** quedan sellados, el partido pasa solo a **EN VIVO**.

### 3.4 La validación por ubicación (geocerca)

```
Radio máximo: 150 metros del complejo   ← ajustable
Método:       distancia real sobre la superficie terrestre (fórmula de Haversine)
```

Si el partido tiene una cancha del catálogo con coordenadas cargadas, **mandar tu
ubicación es obligatorio**. No es opcional ni se puede omitir: antes se podía
saltear el control simplemente no enviando las coordenadas, y eso se cerró.

Si estás fuera del radio, el error te dice **la distancia exacta**:
*«Estás a 340 m de la cancha, el máximo es 150 m.»*

**Antes de mandar tu posición, la app la filtra:**

| Control | Valor | Qué pasa si falla |
|---|---|---|
| Permiso de ubicación | Requerido | *«Necesitamos tu ubicación para verificar que estás en la cancha.»* |
| Espera máxima del GPS | **15 segundos** | *«Salí al aire libre unos segundos y volvé a intentar.»* |
| Precisión mínima del fix | **100 metros** | *«La señal de GPS es demasiado imprecisa para validar el check-in.»* |
| Ubicación simulada | Se detecta | Se **registra**, no se bloquea (ver abajo) |

Sobre la precisión: con un radio de 150 m, aceptar un fix con ±500 m de error
volvería la geocerca decorativa. Por eso se descarta. Si tu teléfono no informa la
precisión (pasa en algunos iPhone), se deja pasar: bloquear por un dato ausente
dejaría sin check-in a gente honesta.

Sobre las ubicaciones simuladas: se detectan y quedan en el registro, pero **no
cortan el check-in automáticamente**. Los emuladores de desarrollo y prueba las
reportan siempre, y cortar ahí rompería el testing. La decisión de qué hacer con
ese dato queda del lado de torneAR.

### 3.5 Qué pasa cuando el GPS falla

| Situación | Resultado |
|---|---|
| **El partido no tiene cancha del catálogo** (amistoso) | El check-in se registra **sin pedir ubicación**. No hay geocerca. |
| **La cancha existe pero no tiene coordenadas cargadas** | El check-in se registra **sin geocerca**. El sistema no inventa una posición. |
| **Hay cancha con coordenadas y negás el permiso** | ❌ El check-in **no se hace**. Se te explica por qué. |
| **Hay cancha y el GPS no responde en 15 s** | ❌ No se hace. Podés reintentar tantas veces como quieras. |
| **Hay cancha y la señal es imprecisa (> 100 m)** | ❌ No se hace. Podés reintentar. |
| **Hay cancha y estás a más de 150 m** | ❌ No se hace, y ves a cuántos metros estás. |

En ningún caso un fallo de GPS te penaliza automáticamente: **no perdés el
partido por no poder hacer check-in en ese instante**. Lo que pasa es que tu
llegada no queda registrada, y si nadie de tu equipo llega al quórum antes del
barrido automático, el partido se resuelve como walkover (sección 6).

### 3.6 La lista de buena fe (convocatoria)

Aparte del check-in individual, el **capitán, el subcapitán o el director técnico**
pueden presentar la **lista completa** del equipo (titulares y suplentes). Esa
lista se valida contra el catálogo de formatos:

- No menos titulares que el mínimo del formato → `MIN_STARTERS_NOT_MET`
- No más titulares que los que entran en cancha → `TOO_MANY_STARTERS`
- No más convocados que el máximo del formato → `SQUAD_LIMIT_EXCEEDED`
- Sin jugadores repetidos → `DUPLICATE_PLAYER`
- Todos tienen que ser miembros del equipo o invitados ya registrados en ese
  partido → `PLAYER_NOT_IN_TEAM`

Presentar la lista **también sella la presencia del equipo** y también exige
ubicación si hay cancha del catálogo.

### 3.7 Invitados: el código único del partido

Cada partido tiene un **código único** que permite sumar jugadores que no están en
el plantel. Ese código **caduca 48 horas después del horario del partido**
(o después de su creación, si todavía no tiene fecha). **Ajustable.**

Vencido, devuelve un error distinto al de código inválido: son dos problemas
distintos y se resuelven de forma distinta.

---

## 4. El ranking: cómo se mueve tu Elo

### 4.1 El Elo es independiente por formato

**Esto es reciente y es importante.** Tu equipo no tiene *un* Elo: tiene **un Elo
por cada formato que juega**.

- Un equipo fuerte en Fútbol 5 y flojo en Fútbol 11 ya no termina con un promedio
  que no describe ninguno de los dos.
- Lo mismo vale para las **estadísticas de temporada**: ganados, empatados y
  perdidos se llevan **por formato**.
- **Todos los formatos arrancan en 1000 puntos**, y la fila de un formato se crea
  la primera vez que el equipo lo juega. Un equipo que nunca jugó Fútbol 11 **no
  aparece** en el ranking de Fútbol 11 con un 1000 fantasma.

**Cómo se ve esto en pantalla:**

- En la pestaña **Ranking** con un formato elegido, ves el Elo ganado en ese
  formato.
- Sin filtro de formato, cada equipo aparece **una sola vez**, con el Elo de su
  **mejor formato**: el formato en el que tiene el Elo más alto, que no tiene por
  qué ser el que declaró al crearse. Si empata en dos formatos, se toma el más
  chico (Fútbol 5 antes que Fútbol 7). Un equipo que se anotó como Fútbol 11 pero
  juega y gana en Fútbol 5 aparece con su Elo de Fútbol 5.
- Esa es también la posición que queda **congelada al cerrar la temporada**: la
  tabla que veías el último día es la que se guarda.

> **Nota de transición, dicha claramente:** el día que se activó el Elo por
> formato, el Elo histórico de cada equipo se atribuyó **entero a su formato
> preferido**. No era reconstruible de otra forma sin re-jugar el historial
> partido por partido, y tiene la ventaja de que ningún equipo vio cambiar su
> número ese día. Los demás formatos arrancan en 1000 cuando el equipo los estrena.
>
> Por la misma transición, hay dos superficies que todavía usan el Elo global:
> el buscador de **«Rivales Ideales»** y el **gráfico de evolución** del Elo. Puede
> haber diferencias entre esas pantallas y la tabla de ranking hasta que se
> terminen de migrar.

### 4.2 La fórmula, sin misterio

Es el sistema Elo estándar del ajedrez, adaptado:

```
Expectativa  = 1 / (1 + 10 ^ ((Elo_rival − Elo_propio) / 400))
Movimiento   = redondeo( 40 × (Resultado − Expectativa) )     acotado a ±40

Resultado:  1.0 = ganaste   ·   0.5 = empataron   ·   0.0 = perdiste
```

- **K = 40.** Es cuánto puede moverse el Elo en un solo partido, como máximo.
- **El movimiento nunca supera ±40 puntos.**
- Es de **suma cero**: lo que uno gana, el otro lo pierde.
- Se calcula con los Elos **de ese formato**, no con los globales: son escalas
  distintas y mezclarlas daría movimientos que no corresponden a ninguna.

**Ganarle a un equipo mucho más fuerte suma mucho; ganarle a uno mucho más débil
suma poco.** Es la propiedad central del sistema y es intencional.

### 4.3 Qué mueve el Elo y qué no

| Evento | ¿Mueve el Elo? | ¿Suma a las estadísticas? |
|---|---|---|
| Partido de **ranking** finalizado | ✅ Sí | ✅ Sí |
| Partido **amistoso** finalizado | ❌ No | ✅ Sí |
| **Walkover** en un partido de ranking (3-0) | ✅ Sí, con K = 40 | ✅ Sí |
| Walkover en un amistoso | ❌ No | ✅ Sí |
| Partido cancelado | ❌ No | ❌ No |
| Partido cerrado sin resultado | ❌ No | ❌ No |

Todo esto lo aplica **un solo motor** en la base de datos, y tiene una **guarda
anti-reprocesamiento**: un partido ya cerrado no puede volver a sumar puntos ni
estadísticas aunque se lo intente reprocesar. (Hubo un momento en la historia del
proyecto donde dos motores sumaban en paralelo y los equipos aparecían con el
doble de partidos jugados; eso se unificó.)

### 4.4 El walkover automático: 3 a 0

Si el horario pasó, tu equipo se presentó (con quórum) y **el rival no**, el
sistema resuelve el partido solo:

```
Resultado:      3 - 0 a favor del equipo presente
Elo:            se mueve con K = 40, como cualquier partido de ranking
Fair Play:      el ausente pierde puntos (ver sección 5)
Cuándo:         4 horas después del horario pactado   ← ajustable
```

Ambos equipos reciben una notificación: *«🏆 Ganaste por no presentación»* /
*«⚠️ Partido perdido por no presentación»*.

**Si no se presentó ninguno de los dos**, el partido **se cancela** y **nadie es
penalizado en Fair Play**. Sin evidencia de quién faltó, el sistema cierra el
ciclo y libera a los convocados en vez de repartir culpas.

**Si los dos hicieron check-in pero el partido quedó trabado**, el barrido **no
inventa un ganador**: queda para revisión manual.

### 4.5 Reclamar un walkover a mano

Si el barrido todavía no corrió, podés reclamarlo vos. Requisitos:

- El partido tiene que estar **`CONFIRMADO` o `EN_VIVO`** (no se puede reclamar
  sobre uno ya terminado ni cancelado — ese hueco se cerró).
- Tenés que ser **capitán o subcapitán**, **o** tener tu propio check-in hecho.
- **Tu equipo tiene que tener check-in registrado.** Sin eso no hay reclamo.
- Podés cargar hasta **3 goleadores** y sumar **como máximo 3 goles** (el 3-0 del
  walkover). Los goleadores y el MVP tienen que ser de tu propio plantel.
- El reclamo lo **revisa un administrador** de torneAR. Los dos equipos son
  notificados del veredicto, con las notas del admin si las hubo.

Si el admin **rechaza** el reclamo y el partido estaba `CONFIRMADO`, el partido se
**cancela**: se cierra el ciclo y se liberan los jugadores convocados.

> **Limitación conocida:** hoy existe **un solo reclamo por partido**. El primero
> en reclamar define la versión que lee el administrador; no hay contra-reclamo.
> Está identificado y pendiente de resolver.

### 4.6 Cuando los dos cargan resultados distintos

Cada equipo carga su versión del marcador. Entonces:

- **Si los dos coinciden** → el partido pasa a `FINALIZADO` y se aplican Elo y
  estadísticas.
- **Si no coinciden** → el partido pasa a **`EN DISPUTA`**.

**Cómo se resuelve una disputa:**

1. **Votan los jugadores que hicieron check-in.** Sólo ellos: estuvieron ahí.
   Un voto por persona, cambiable mientras la votación siga abierta.
2. **La votación cierra sola a las 24 horas** de abierta la disputa. Nadie la
   puede adelantar ni extender. **Ajustable.**
3. Al cerrar, gana **la versión más votada**. El marcador del perdedor se
   corrige para coincidir con el del ganador.
4. **Si hay empate en votos**, desempata el **Fair Play más alto**.
5. **Si también empatan en Fair Play**, el sistema **se niega a decidir** y pasa
   a revisión de un administrador. Prefiere no resolver antes que inventar un
   ganador.

**Nadie puede cerrar la votación a mano.** Ni vos, ni tu capitán, ni el rival.

Esto no siempre fue así, y el cambio importa: antes el escrutinio corría en el
instante en que un capitán apretaba «Resolver Disputa». Como el desempate cae en
Fair Play cuando los votos están igualados —y cero a cero es el estado en que
*nace* toda disputa— **el primero en apretar se llevaba el partido**. No era un
empate que se rompía por mérito: era una carrera por el botón. Convertir el
cierre en un evento de tiempo elimina la carrera, porque ya no hay nada que
adelantar.

**El único caso que un administrador resuelve a mano** es cuando el escrutinio
automático no puede: empate total (punto 5) o falta el marcador de alguno de los
dos equipos. Eso último pasa cuando la disputa la abrió el sistema y sólo un
equipo había cargado resultado: no hay marcador que adoptar, y **fabricar uno es
una decisión administrativa, no automática**.

### 4.7 Las temporadas

- Al cambiar de temporada, **ganados / empatados / perdidos / goles vuelven a 0**
  (tanto los globales como los de cada formato).
- **El Elo y los partidos jugados de por vida NO se resetean.** El Elo es continuo
  entre temporadas.
- Los partidos todavía abiertos se traspasan a la temporada nueva.

> **Sobre la vieja reducción semestral de Elo:** durante un tiempo existió una
> tarea automática (`season_reset_elo`, al 1 de enero y 1 de julio) que achicaba
> el Elo acercándolo a 1000 a la mitad de la distancia. **Fue dada de baja el
> 14 de julio de 2026** junto con la función que la ejecutaba, precisamente
> porque mutaba el estado competitivo en silencio sin cerrar ni crear
> temporadas. Desde entonces **la transición de temporada es manual, la ejecuta
> un administrador y el Elo nunca se achica**. El único proceso automático que
> queda alrededor de las temporadas sólo **avisa** a los administradores cuando
> la temporada activa venció; nunca modifica nada.

### 4.8 Nadie está «en calibración»

Un equipo entra al ranking **desde su primer día**, con 1000 puntos. La regla vieja
que exigía 5 partidos de ranking para aparecer en la tabla **fue eliminada**: hoy
todos los equipos activos son visibles desde el minuto cero.

### 4.9 El ranking de jugadores

Aparte de la tabla de equipos, hay un ranking individual con cinco métricas:
**goles**, **MVPs**, **partidos jugados**, **vallas invictas** y **efectividad
(% de victorias)**, filtrable por zona y temporada.

Las estadísticas de tu perfil se calculan sobre **toda tu trayectoria**, incluidos
los ciclos ya cerrados en equipos anteriores y **los partidos que jugaste como
invitado** (esos aparecen desglosados aparte). Si no aparecés en el ranking, la app
te agrega igual al final con tu valor real en vez de esconderte.

---

## 5. Fair Play: el otro puntaje

Cada equipo tiene un **Fair Play Score de 0 a 100**. Empieza en **100** y se
recalcula entero cada vez que pasa algo relevante (no se va acumulando error).

```
Fair Play = 100
          + 1  × cada partido FINALIZADO limpio
          − 5  × cada cancelación tardía aceptada (< 24 h antes)   ← ajustable
          − 5  × cada walkover en contra por FALTA DE QUÓRUM       ← ajustable
          − 15 × cada walkover en contra por cualquier otro motivo ← ajustable
          − 2  × cada partido que quedó EN DISPUTA
                                                 (resultado acotado a 0–100)
```

### 5.1 Avisar cuesta menos que no aparecer

La escala tiene **un solo eje: avisaste o no avisaste.**

Un equipo que no llega a juntar gente y **lo registra** deja al rival con tiempo
de reorganizarse. Uno que directamente no aparece, no. Por eso **falta de quórum
cuesta −5 y no aparecer cuesta −15**.

### 5.2 Detalles que conviene saber

- **Una solicitud de cancelación rechazada no penaliza.** Sólo cuentan las
  aceptadas.
- **Un walkover automático del barrido cuesta los −15 completos**, porque nadie
  declaró ningún motivo: el equipo directamente no apareció ni avisó.
- **El motivo lo declara quien reclama, no quien faltó.** Es una asimetría real y
  está asumida: el rival podría etiquetar como «no presentación» a un equipo que
  sí avisó. Se acepta porque (a) la escala sólo puede *mejorar* la situación del
  ausente respecto del sistema anterior, donde todo costaba −15, y (b) el reclamo
  pasa por un administrador que puede rechazarlo. La alternativa —dejar que el
  ausente se autodeclare «falta de quórum»— habría creado un atajo trivial para
  bajar la multa sin presentarse.

### 5.3 Para qué se usa

- Se muestra en el ranking, junto al Elo.
- **Desempata las disputas** cuando la votación queda empatada (4.6).

---

## 6. Qué pasa cuando un partido queda colgado

Una vez por hora (**a los :20 de cada hora**) corre un barrido automático que
cierra los partidos que quedaron sin resolver. Ningún partido queda abierto para
siempre.

| Situación | Cuánto espera | Qué hace |
|---|---|---|
| **Pendiente** que nunca se coordinó | **14 días** ← ajustable | Se cancela. Los dos equipos son notificados y pueden volver a desafiarse. |
| **Confirmado**, sólo un equipo con check-in | **4 h** después del horario ← ajustable | **Walkover 3-0** al que se presentó. |
| **Confirmado**, ninguno con check-in | **4 h** después del horario | Se cancela. **Sin penalizaciones.** |
| **Confirmado**, los dos con check-in pero trabado | — | No se toca. Revisión manual. |
| **En vivo** sin ningún resultado cargado | **24 h** ← ajustable | Se cierra sin computar. No suma ni resta nada. |
| **En vivo** con un solo resultado cargado | **24 h** | Pasa a **disputa** para que voten los presentes. |
| **En disputa** | **24 h** ← ajustable | Cierra la votación y **resuelve el partido** (ver 4.6). |
| **Desafío enviado sin respuesta** | **14 días** ← ajustable | Se rechaza solo. Los dos equipos pueden volver a desafiarse. |

**El barrido nunca pisa un reclamo de walkover que un administrador todavía está
evaluando**, ni una disputa que un administrador ya resolvió.

Las disputas las procesa un barrido **propio y separado**, a los :40 de cada
hora. Es deliberado: el escrutinio toca Elo, Fair Play y marcadores, y si algo
sale mal ahí no puede llevarse puesto el cierre de los partidos huérfanos.

**Además, hay dos avisos automáticos:**

- **Recordatorio 24 h antes del partido** — se revisa cada 15 minutos y se manda
  exactamente una vez por partido.
- **Publicaciones vencidas del Mercado** — se dan de baja cada hora.

---

## 7. El Mercado y los perfiles

El Mercado tiene **dos lados**, y funcionan distinto.

### 7.1 Equipos que buscan jugador

Un capitán o subcapitán publica: **qué posición busca**, formato de cancha, día,
hora, zona y complejo. Cualquier jugador puede **postularse**.

**Qué ve el jugador que se postula:**

- Postularse dos veces al mismo aviso **no falla ni duplica**: la app te avisa que
  ya estabas postulado (antes esto era mudo y la gente volvía a tocar el botón
  creyendo que no había andado).
- En **«Mis postulaciones»** ves todas las que enviaste y en qué quedaron:
  `Pendiente`, `Vista`, `Aceptada` o `Rechazada`, y si el aviso sigue abierto.
- `Vista` significa exactamente eso: **el dueño del aviso abrió la lista de
  postulantes**. No es una respuesta todavía, pero tampoco es silencio.

**Qué pasa cuando un DT te acepta — el paso que mucha gente no espera:**

1. Tu postulación queda en **`Aceptada`**.
2. El sistema crea a tu nombre una **solicitud de incorporación ya aprobada** por
   ese club.
3. **Vos tenés que confirmar el traspaso** desde tu perfil → «Mis solicitudes».
   Recién ahí entrás al plantel.

**Ese último paso es deliberado y no se va a sacar:** dejar tu club actual es una
decisión tuya, no un efecto colateral de que otro equipo te acepte. La
notificación te lo dice con todas las letras: *«Entrá a "Mis solicitudes" y
confirmá tu traspaso para sumarte al plantel.»*

Cuando confirmás, el traspaso es **atómico**: se cierra tu ciclo en el club
anterior marcado como **TRANSFERENCIA** (no como abandono) y se abre el nuevo, en
una sola operación. **Nunca quedás sin club en el medio**, y tu historial de
carrera queda correcto.

**Qué pasa con el aviso y con los otros postulantes:**

Al aceptar a alguien, el aviso **se cierra** y las postulaciones que quedaban
abiertas pasan a **`Rechazada`**. Antes seguían colgadas para siempre sin
respuesta. Si el enlace con el equipo llegara a fallar, tu postulación vuelve a
`Pendiente` para que el capitán pueda reintentar — no queda en un estado terminal
que no produce ningún efecto.

### 7.2 Jugadores libres que buscan equipo

Un jugador publica **su posición** y si busca **equipo** o **partido suelto**. Del
otro lado, un **capitán o subcapitán** se postula **con uno de sus equipos**.

Diferencia importante con el caso anterior: acá el que acepta es el **jugador**, y
la aceptación **no crea ninguna incorporación automática**. Abre la conversación,
nada más. **El alta la inicia el jugador cuando quiera.** Es su aviso y es su
decisión.

La app elige automáticamente **con qué equipo te postulás**: el equipo activo si
sos capitán o subcapitán de él, si no el primero que gestiones. Si no gestionás
ninguno, la acción está bloqueada antes de tocar la base — no vas a recibir un
error de permisos incomprensible.

### 7.3 Vigencia de las publicaciones

| Tipo de aviso | Vence cuando… |
|---|---|
| Equipo busca jugador **con fecha de partido** | Pasa la fecha y hora del partido |
| Equipo busca jugador **con fecha, sin hora** | Termina ese día |
| Equipo busca jugador **sin fecha** | No vence por fecha |
| Jugador busca equipo | **14 días** desde su publicación |

La limpieza corre **una vez por hora**, así que entre una corrida y la siguiente
puede haber hasta 60 minutos en que un aviso vencido siga visible. Por eso **la
app revalida la vigencia al momento exacto en que tocás «Postularme»**, con el
mismo criterio que usa el listado: lo que no se muestra, no se puede postular.

Los avisos de **equipos dados de baja no aparecen** en el Mercado.

### 7.4 Tu perfil

Tus estadísticas se calculan sobre **toda tu carrera**: incluyen los equipos donde
ya no estás y los partidos que jugaste **como invitado** (desglosados aparte, para
que se entienda de dónde salen). Se muestran partidos jugados, goles, MVPs y
victorias, con el desglose entre partidos de ranking y amistosos, empates,
derrotas y vallas invictas.

El historial de tu carrera registra **cómo terminó cada ciclo**: transferencia,
abandono o expulsión.

---

## 8. Roles: quién puede hacer qué

| Acción | Capitán | Subcapitán | Director Técnico | Jugador |
|---|:---:|:---:|:---:|:---:|
| Marcar mi propia llegada (check-in) | ✅ | ✅ | ✅ | ✅ |
| Presentar la lista de convocados | ✅ | ✅ | ✅ | ❌ |
| Cargar el resultado | ✅ | ✅ | ✅ | ❌ |
| Corregir un resultado que cargó otro | ✅ | ✅ | ❌ | ❌ |
| Votar en una disputa | ✅* | ✅* | ✅* | ✅* |
| Cerrar la votación de una disputa | ❌ | ❌ | ❌ | ❌ |
| Enviar o aceptar un desafío | ✅ | ✅ | ❌ | ❌ |
| Proponer / confirmar / cancelar un partido | ✅ | ✅ | ❌ | ❌ |
| Reclamar un walkover | ✅ | ✅ | ❌ | ✅** |
| Publicar en el Mercado por el equipo | ✅ | ✅ | ❌ | ❌ |
| Aceptar postulantes del Mercado | ✅ | ✅ | ❌ | ❌ |
| Administrar miembros y roles | ✅ | ✅ | ❌ | ❌ |

\* Sólo quienes hicieron check-in en ese partido.
\** Un jugador puede reclamar el walkover si él mismo hizo check-in.

**Nadie cierra la votación de una disputa** — ni siquiera un capitán. La cierra
el sistema a las 24 horas. Es la única fila de esta tabla donde no hay ningún ✅,
y es a propósito: mientras existió ese permiso, el primero en usarlo se llevaba
el partido (ver 4.6).

**Por qué el DT tiene ese recorte exacto:** se le dieron los permisos del **día del
partido** (presentar la lista, cargar el resultado) y **ninguno de gestión del
club**. El corte no es de confianza, es de naturaleza del acto: proponer o
confirmar un partido compromete al club frente a otro club (fecha, cancha, seña) y
eso es de la conducción; reclamar o resolver un walkover cierra un resultado.

---

## 9. Los chats: quién habla y quién lee

torneAR tiene **dos tipos de chat** y ninguno de los dos se crea a mano: los abre
el sistema cuando ocurre el hecho que los justifica.

### 9.1 El chat del partido

**Cuándo se crea:** en el momento exacto en que un equipo **acepta** un desafío.
No al enviarlo. Mientras el desafío está esperando respuesta no hay ningún canal
abierto entre los dos equipos — el chat nace junto con el partido, en la misma
operación.

Hay **un solo chat por partido**, garantizado por la base de datos.

| | Quién |
|---|---|
| **Puede leer** | Todos los miembros de **los dos equipos**, sin importar el rol |
| **Puede escribir** | Sólo **capitán y subcapitán**, de cualquiera de los dos equipos |

**Dos consecuencias que conviene tener claras:**

1. **No es un canal privado de tu equipo.** El rival lee absolutamente todo lo
   que se escribe ahí. Es un canal de coordinación entre clubes, no un vestuario.
2. **El director técnico y los jugadores leen pero no escriben.** El DT recibió
   permisos del día del partido (presentar la lista, cargar el resultado), pero
   las tablas de comunicación quedaron fuera de ese cambio. Hoy, en el chat del
   partido, un DT tiene el mismo acceso que un jugador: ve la conversación
   completa y no puede responder.

**Los invitados no entran.** Un jugador que se sumó con el código único del
partido no es miembro del equipo, así que no ve el chat.

**Si el partido se elimina, el chat se elimina con él.** No queda un historial
suelto de una conversación sin partido.

### 9.2 El chat del Mercado

**Cuándo se crea:** cuando un jugador contacta a un equipo desde una publicación
del Mercado. Se abre automáticamente después de registrar la postulación —
primero queda asentada la postulación, después se abre la conversación.

Hay **un solo chat por cada par jugador–equipo**: si te postulás a tres avisos
del mismo club, seguís teniendo una sola conversación con él.

| | Quién |
|---|---|
| **Puede leer** | El jugador **y cualquier miembro del equipo**, sin importar el rol |
| **Puede escribir** | El jugador y, del lado del equipo, sólo **capitán y subcapitán** |

**La consecuencia importante:** lo que le escribís a un club **lo lee el plantel
entero**, no sólo quien te responde. Del lado del equipo la lectura es abierta a
todos los miembros; lo que está restringido es la escritura.

**Si el chat no se abre, tu postulación igual quedó registrada.** Son dos pasos
separados a propósito: el chat es secundario, y un fallo suyo no puede hacerte
creer que no te postulaste.

### 9.3 Qué NO hacen los chats

- **No producen ninguna decisión.** Nada de lo que se acuerde por chat modifica
  un partido, un resultado o un traspaso: todo eso pasa por su propio circuito
  con sus propias validaciones. Un «dale, ganamos 3-1» por chat no carga ningún
  resultado.
- **No sirven como evidencia automática.** Para un reclamo de walkover lo que
  cuenta son los check-in registrados y la foto que se adjunta al reclamo, no la
  conversación.

---

## 10. Tabla resumen de todos los números

| Regla | Valor | ¿Ajustable sin actualizar la app? |
|---|---|:---:|
| Ventana de check-in | 2 h antes → 1 h después | No (vive en la app) |
| Radio de la geocerca | **150 m** | ✅ Sí |
| Precisión mínima del GPS | 100 m | No |
| Espera máxima del GPS | 15 s | No |
| Quórum de presentación | Según formato (4 a 7) | ✅ Sí |
| Quórum de respaldo sin formato | 4 | ✅ Sí |
| Elo inicial (cada formato) | **1000** | No |
| Factor K del Elo | **40** | No |
| Movimiento máximo por partido | ±40 | No |
| Resultado de un walkover | **3 – 0** | No |
| Ventana de la cuenta regresiva | 24 h | No |
| Fair Play inicial | 100 (rango 0–100) | No |
| Multa: cancelación tardía | −5 | ✅ Sí |
| Multa: walkover por falta de quórum | −5 | ✅ Sí |
| Multa: walkover por no presentarse | −15 | ✅ Sí |
| Multa: partido en disputa | −2 | No |
| Bonus: partido finalizado limpio | +1 | No |
| Cancelación considerada «tardía» | < 24 h antes | No |
| Enfriamiento entre partidos de ranking | 30 días | No |
| Máximo de partidos de ranking por temporada | 3 | No |
| Jugadores compartidos que bloquean un ranking | 2 o más | No |
| Aviso por diferencia de Elo (no bloquea) | > 400 | No |
| Gracia antes del walkover automático | 4 h | ✅ Sí |
| Cancelación de un pendiente sin coordinar | 14 días | ✅ Sí |
| Cierre de un partido en vivo sin resultado | 24 h | ✅ Sí |
| Duración de la votación de una disputa | **24 h** | ✅ Sí |
| Vencimiento de un desafío sin responder | 14 días | ✅ Sí |
| Vencimiento del código de invitados | 48 h | ✅ Sí |
| Vencimiento de avisos «busco equipo» | 14 días | No |
| Recordatorio antes del partido | 24 h | No |
| Frecuencia del barrido automático | Cada hora (:20) | No |
| Frecuencia del escrutinio de disputas | Cada hora (:40) | No |

---

## Cosas que todavía no están resueltas

Este documento no sirve de nada si sólo cuenta lo que funciona bien. Estos son los
puntos abiertos conocidos al día de hoy:

1. **No hay contra-reclamo de walkover.** Existe un solo reclamo por partido: el
   primero en reclamar define la versión que ve el administrador.
2. **El «Rivales Ideales» y el gráfico de evolución del Elo todavía usan el Elo
   global**, no el del formato. Puede haber diferencias con la tabla de ranking
   hasta que se complete la migración.
3. **El historial de evolución del Elo no distingue formatos** todavía.
4. **La ventana horaria del check-in la aplica la app, no el servidor.** El
   servidor valida pertenencia, estado, quórum y ubicación, pero no la ventana.
5. **Los invitados no cuentan para confirmar un partido**, aunque sí cuentan para
   el check-in. Un equipo de 6 que habitualmente completa con invitados no puede
   confirmar un Fútbol 11.
6. **Las zonas sin complejos cargados no permiten partidos de ranking.** Es una
   limitación de cobertura, no de diseño, y se resuelve sumando canchas.
7. **El director técnico no puede escribir en el chat del partido.** Recibió los
   permisos operativos del día del partido, pero las políticas de mensajería
   quedaron fuera de ese cambio y siguen admitiendo sólo a capitán y subcapitán.
   Es una inconsistencia con el resto de sus atribuciones, no una decisión
   tomada.

---

*Documento generado a partir de una auditoría directa del código de la aplicación
(`app/`, `components/`, `lib/`) y del esquema de base de datos (migraciones SQL,
disparadores, funciones y tareas programadas). Toda regla descrita acá es
verificable en el repositorio.*
