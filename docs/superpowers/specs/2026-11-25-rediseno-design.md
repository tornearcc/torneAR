# Rediseño de TorneAR: ordenar y pulir

**Estado:** propuesta para revisar con Agustín (25/11/2026). Registro: P3-27.
**Maquetas:** canvas «Rediseño TorneAR» (https://claude.ai/artifact/XgTRFfmpVKpsp9yKUVA2EJ), 11 pantallas navegables en 4 filas, una por tipo de persona.

## 1. Por qué

Juani y Agustín (audios del 25/11): «tiene tantas cosas que cuesta entenderla; te perdés por momentos». Los datos lo confirman. El problema no es la falta de funciones: la gente no sabe cuál es su próximo paso.

| Paso | Cantidad (25/11) |
|---|---|
| Perfiles | 624 |
| Con equipo | 242 |
| Equipos con 2 o más jugadores | 17 |
| Equipos con 5 o más | 2 |
| Desafíos | 24 (15 rechazados, 5 aceptados) |
| Partidos jugados | 2 |

- **Al registrarse:** 180 eligen «Sumarme a un equipo» y caen en un Mercado con 16 publicaciones de equipos. 157 eligen «Armar mi equipo», 104 «Prefiero mirar» y 35 «Ser embajador».
- **La mayor caída:** está entre crear el equipo y llenarlo. Hoy invitar es una fila más dentro de «Gestión de equipo».

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Que cualquier persona, en cualquier estado, vea en Inicio **un solo próximo paso** y lo entienda sin explicación.
- Que cada cosa tenga **un nombre y un lugar**.
- Que las pantallas largas (partido, equipo, ranking) muestren **lo tuyo y lo de ahora** primero.

**No-objetivos**
- Funciones nuevas o cambios de reglas (ranking, check-in, W.O., disputas).
- Cambios en la base de datos.
- Colores, tipografías y marca: se quedan.

**Anti-objetivos** (sería un fracaso aunque «funcione»):
- Esconder una función que hoy se usa sin dejarla a un toque desde donde la gente la busca.
- Que un usuario actual no encuentre algo después de la OTA.
- Agregar pantallas de tutorial en lugar de pantallas que se expliquen solas.

## 3. Restricciones

- **Por OTA:** solo JS. Nada nativo, nada en `app.json`.
- **Mismos tokens** de `tailwind.config.js`, NativeWind y el patrón de tabs de `profile.tsx`.
- **Por etapas:** se lanza una pantalla por vez, cada una medible, y se puede volver atrás.

## 4. Enfoques considerados

1. **Solo pulir:** cada pantalla en su lugar, con mejor jerarquía y textos. Es rápido, pero no resuelve «me pierdo», porque el problema está en dónde está cada cosa.
2. **Ordenar y pulir (elegido por Agustín el 25/11):** mismas funciones, pero un nombre y un lugar por cosa, e Inicio guiado por el estado de cada persona.
3. **Rediseño completo desde cero** (nueva identidad, nueva navegación): demasiado riesgo y tiempo para una app con 600 usuarios que todavía está encontrando su uso.

## 5. Principios

1. **Un próximo paso por pantalla**, según dónde estás.
2. **Un solo nombre por cosa** (glosario abajo).
3. **Íconos siempre con texto.** Se terminan los tres íconos sueltos del header.
4. **Lo tuyo primero:** tu equipo, tu puesto, tu partido.
5. **Pantallas vacías que enseñan:** qué va ahí y el botón para llenarla.
6. **Detalles:** mismos colores; menos mayúsculas y chips; botones de 44 px o más; un solo color por estado.

## 6. Mapa de navegación

| Pestaña | Hoy | Propuesta |
|---|---|---|
| Inicio | Unos 9 bloques apilados | «Tu próximo paso» + tu equipo + rivales + censo |
| Partidos | Próximos, Como invitado, Historial | **Te desafiaron** (sale del ícono de espadas) + Próximos con su estado + Jugados |
| Ranking (centro) | Ranking + pestaña «Buscar rival» + 9 chips | Tu puesto primero, Equipos y Jugadores, un selector «zona · formato» |
| Mercado → **Buscar** | Buscan jugador, Buscan equipo, Buscan rival (cada uno con otro título adentro) | **Rival · Jugadores · Equipo**: todo lo de buscar rival vive acá |
| Perfil | Ficha + secciones | Ficha de jugador + Tus equipos + **Mensajes** + Más |

**Header:** queda el logo y la campanita.
- Chats del Mercado → **Perfil › Mensajes**, con su número.
- Desafíos → **Partidos › Te desafiaron**, con el número en la pestaña.
- El selector de equipo activo pasa a Perfil › Tus equipos.

## 7. Glosario (un nombre por cosa)

| Concepto | Nombre único | Reemplaza a |
|---|---|---|
| Pedido de partido a otro equipo | **Desafío** («Desafiar», «Te desafiaron») | «Desafío enviado», ícono de espadas |
| Equipos que quieren jugar | **Buscan rival** | «Están para jugar», «Rivales para vos» (este pasa a «Sugeridos para tu equipo») |
| Equipos a los que les falta gente | **Les falta uno** | «Buscan jugador» |
| Jugadores sin equipo | **Buscan equipo** | «Jugadores libres» |
| Mensajes privados del Mercado | **Mensajes** | «Mis Chats de Mercado» |
| Pantalla del equipo | **Tu equipo** | «Gestión de equipo» |
| Ver la tabla | **Ranking** | «Ver tabla completa», «ranking-full» |

## 8. Flujos por tipo de persona

### 8.1 Recién llegado, sin equipo (fila 1 del canvas)

**«¿Qué venís a hacer?»** explica la app en una línea («un ranking de fútbol amateur: armás tu equipo, desafiás a rivales de tu zona y cada partido suma») y ofrece 3 caminos:
- **Me invitó un amigo:** código o link.
- **Armar mi equipo.**
- **Busco equipo para jugar.**
- «Prefiero mirar» queda como link. «Ser embajador» pasa a Perfil.

**Sumarme a un equipo:**
- Arriba, el código (el camino más común en la vida real).
- Después, «Les falta uno en tu zona».
- **Siempre** cierra con «Publicar que busco equipo», para que la pantalla nunca quede vacía. Hoy esos 180 caen en un Mercado casi vacío.

**Inicio sin equipo:**
- Una barra de 3 pasos (Tu equipo → Un rival → El partido suma) que se repite en todo el recorrido.
- «Tu próximo paso: sumate a un equipo».
- Les falta uno cerca, el ranking de tu zona y el censo.

**El onboarding (3 pasos) no cambia de fondo.** Pasa a usar el mismo encabezado y la misma barra de progreso que el resto, con textos más cortos.

### 8.2 Capitán con el equipo incompleto (fila 2)

**Inicio:**
- «Completá [tu equipo] · 1 de 5»: 5 lugares, el tuyo lleno y 4 con «+».
- Un botón grande **«Invitar a mis amigos»** (hoja de compartir del sistema con el link).
- El código con «Copiar».
- Debajo, «¿Te faltan amigos? Sumá jugadores libres» (lleva a Buscar › Jugadores).

**Tu equipo** (hoy «Gestión de equipo», 1.200 líneas):
- Escudo, nombre, zona y formato, y el puesto (o «Sin puesto: jugá tu primer partido»).
- **Aviso amarillo si hay solicitudes.**
- Plantel «3 de 5» con la fila «+ Invitar jugador».
- **Ajustes del equipo** (nombre, escudo, zona, roles, dar de baja) quedan en una sola fila abajo y se abren en otra pantalla.

### 8.3 Jugador de un equipo, sin ser capitán

- **Inicio:** si hay partido, «Lo próximo» (3a). Si no, «Tu equipo» y un recordatorio para el capitán («Pedile a [capitán] que desafíe a alguien»).
- **No ve botones que no puede usar:** hoy ve acciones de capitán deshabilitadas.
- El día del partido, «Lo próximo» pasa a **«Marcá que llegaste»** (el check-in).

### 8.4 Equipo listo: buscar rival y jugar (fila 3)

**Inicio** (3a) muestra un solo bloque grande, «Lo próximo», según el estado del partido:
- desafío recibido → «Te desafiaron» con Aceptar;
- partido pendiente → «Acordá día y cancha»;
- confirmado → día, hora y cancha;
- el día del partido → «Marcá que llegaste»;
- terminado → «Cargá el resultado».

Si no hay nada pendiente: «Buscá rival».

**Buscar › Rival:**
- «Publicá que buscan rival».
- «Buscan rival ahora».
- «Sugeridos para tu equipo».

Cada fila con «Desafiar». El tipo de desafío (por el ranking o amistoso) se elige en la confirmación, no con dos botones distintos.

**Partidos:**
- «Te desafiaron», con Aceptar o «Ahora no».
- Próximos, cada uno con lo que falta en su color.
- Jugados, con G/E/P y los puntos.

**Un partido** (hoy `match-detail`, 1.143 líneas): una línea de 4 pasos.
1. Desafío aceptado.
2. Acordar día y cancha.
3. Llegar a la cancha (check-in).
4. Cargar el resultado («si los dos capitanes coinciden, suma»).

- **Solo el paso actual está abierto**, con sus botones. Los anteriores quedan con ✓ y los siguientes explican qué va a pasar.
- Disputa, W.O., cancelación y denuncia pasan a «Más opciones», salvo cuando son el paso actual (por ejemplo, un resultado en disputa ocupa el paso 4).
- El chat del partido queda a un toque, arriba.

### 8.5 Competir y mostrarte (fila 4)

- **Ranking:**
  - arriba, tu puesto («12.º de 48 · ganando el próximo subís al 9.º»: este dato es nuevo, ver §11);
  - Equipos o Jugadores;
  - un solo selector «zona · formato», en lugar de 9 chips;
  - la tabla con puesto, puntos y PJ;
  - tu fila resaltada aunque estés lejos del top.
- **Perfil:**
  - ficha de jugador (foto, posición, zona, club, y partidos, goles y MVP);
  - Tus equipos;
  - y en «Más»: Mensajes, Censo, Embajadores, Cómo funciona y Preferencias.

### 8.6 Hincha o curioso que llega por un reel

- Entra por «Prefiero mirar» o por el censo: Inicio sin equipo (1b) con el censo y el ranking a la vista.
- El paso «Sumate a un equipo» sigue arriba, sin bloquear nada.

## 9. Pantallas sin maqueta (mismos criterios)

- **Login y registro:** sin cambios de fondo; un solo botón principal y textos en castellano rioplatense consistente.
- **Crear equipo / Unirse con código:**
  - crear termina directo en «Invitar a mis amigos» (2a);
  - unirse muestra «Te uniste a [equipo]» y su próximo paso.
- **Mercado:**
  - crear publicación, postulaciones y Mis postulaciones mantienen la función, con los nombres del glosario;
  - «Mis postulaciones» pasa a Buscar › Equipo.
- **Mensajes:** la lista y el chat sin cambios de función; se entra desde Perfil y desde la notificación.
- **Notificaciones:** cada una lleva a la pantalla de su próximo paso (ya lo hacen la mayoría); agrupadas por «Hoy» y «Antes».
- **Check-in (convocatoria):** misma función, con el título «Llegar a la cancha» y el contador «4 de 5 llegaron».
- **Cargar resultado, goleadores y MVP:** un paso por pantalla (resultado → goleadores → MVP) en lugar de un formulario largo.
- **Stats del equipo y del jugador:** se entra desde la ficha (tocando los números).
- **Censo, Embajadores, Reglas (FAQ) y Preferencias:** sin cambios; se entra desde Perfil › Más.
- **Pantallas de admin:** fuera del alcance.

## 10. Detalles visuales

- **Estados de un partido, un color cada uno:**
  - amarillo `warning-tertiary`: falta algo tuyo;
  - celeste `info-secondary`: confirmado;
  - verde: en vivo o hecho;
  - gris: terminado.
- **Mayúsculas** solo para títulos de pantalla (Barlow Condensed). Etiquetas y botones en tipo oración (Inter).
- **Un botón verde lleno por pantalla** (el próximo paso). El resto, grises.
- **Tarjetas** con `surface-container`, radio 16-20 y 14-18 px de margen interno. La tarjeta del próximo paso usa un fondo verde oscuro con un borde verde suave.
- **Vacíos:** qué va acá + un botón. Nunca «No hay datos».
- **Escudos:** los prediseñados (P3-26) en todas partes donde antes había iniciales.

## 11. Lo que no es solo diseño (decidir aparte)

- «Ganando el próximo subís al N.º» (Ranking) necesita calcular la proyección del rating. Si no se aprueba, queda «12.º de 48».
- Los puntos ganados por partido en «Jugados» se muestran solo si ese dato ya está guardado.
- Mover «Ser embajador» fuera de la bienvenida le resta visibilidad al programa. Hoy 35 lo eligen.

## 12. Plan por etapas (cada una es una OTA)

1. **Inicio por estado** (1b, 2a, 3a) + la barra de 3 pasos. Es lo que más impacta.
2. **«¿Qué venís a hacer?» y «Sumarme a un equipo»** (1a, 1c).
3. **Buscar** (renombrar Mercado, Rival · Jugadores · Equipo, sacar «Buscar rival» de Ranking) y **Partidos** con «Te desafiaron» (header sin íconos sueltos).
4. **Un partido paso a paso.**
5. **Tu equipo, Ranking y Perfil.**
6. Resto: pulido y vacíos.

Después de cada etapa se mira: cuántos equipos pasan de 1 a 2 o más jugadores; cuántos desafíos se mandan y cuántos se aceptan; y los partidos jugados.

## 13. Lo que queda para quien lo construya

- La estructura de componentes, siguiendo el patrón de `profile.tsx`.
- Qué componentes actuales se reutilizan.
- Las animaciones.
- Los textos finales de cada vacío, dentro del tono del glosario.
