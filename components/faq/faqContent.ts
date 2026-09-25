import type { FaqCategory } from './types';

/**
 * Contenido de "Reglas del Juego", derivado de `docs/TRANSPARENCY_GUIDE.md`.
 *
 * ⚠️ Los números que aparecen acá tienen que coincidir con los del documento y
 * con los del backend. Varios son ajustables desde `app_settings` sin desplegar
 * la app (radio del geofence, quórum, multas de Fair Play, umbrales del
 * barrido), así que están redactados como "hoy son X" y no como promesas
 * eternas. Si alguno se ajusta en producción, hay que tocar tres lugares: la
 * tabla, el documento y este archivo.
 */
export const FAQ_CATEGORIES: FaqCategory[] = [
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'checkin',
    title: 'El Check-in y los Fantasmas',
    subtitle: 'Cómo probamos que tu equipo estuvo en la cancha',
    icon: 'map-marker-check-outline',
    entries: [
      {
        question: '¿Cuándo puedo hacer el check-in?',
        answer:
          'La ventana se abre 2 horas antes del horario pactado y se cierra 1 hora después. Fuera de ese rango el botón no aparece.\n\nEsa ventana la controla la app. El servidor, por su lado, sólo exige que el partido esté confirmado o en vivo: lo que sí valida siempre y sin excepción es que seas del equipo, el estado del partido y tu ubicación.',
        facts: [
          { label: 'Se abre', value: '2 h antes' },
          { label: 'Se cierra', value: '1 h después' },
        ],
      },
      {
        question: 'Ya marqué mi llegada, ¿por qué mi equipo sigue en "Pendiente"?',
        answer:
          'Porque son dos cosas distintas. "Yo llegué" es tu registro personal y se guarda siempre, con hora y ubicación. "Mi equipo se presentó" recién se sella cuando el equipo junta el mínimo de jugadores con check-in.\n\nEsto es a propósito y es el corazón del sistema: antes, el tap de una sola persona sellaba la presencia del equipo entero, y como el walkover automático lee justamente ese sello, un jugador solo podía regalarse un 3-0. Hoy no puede.',
      },
      {
        question: '¿Cuánta gente necesito para dar el equipo por presentado?',
        answer:
          'Depende del formato. El mínimo sale del catálogo oficial y es el mismo número que se valida al confirmar el partido y al presentar la lista.',
        facts: [
          { label: 'Fútbol 5', value: '4 jugadores' },
          { label: 'Fútbol 6', value: '5 jugadores' },
          { label: 'Fútbol 7', value: '6 jugadores' },
          { label: 'Fútbol 8', value: '6 jugadores' },
          { label: 'Fútbol 9', value: '7 jugadores' },
          { label: 'Fútbol 11', value: '7 jugadores' },
        ],
      },
      {
        question: '¿Los invitados cuentan para el quórum?',
        answer:
          'Sí. Si completaste el equipo con jugadores que entraron por el código único del partido, cuentan igual: están físicamente en la cancha, que es lo único que el sello afirma.\n\nOjo con la contracara: los invitados NO cuentan al momento de confirmar el partido, porque en ese momento todavía no existen. Un equipo de 6 que habitualmente completa con invitados no va a poder confirmar un Fútbol 11.',
      },
      {
        question: '¿Por qué me pide la ubicación?',
        answer:
          'Para verificar que estás realmente en la cancha. Si el partido se juega en un complejo del catálogo, mandar tu ubicación es obligatorio: antes se podía saltear el control simplemente no enviándola, y eso se cerró.\n\nSi estás fuera del radio, el error te dice la distancia exacta a la que estás. Antes de mandar tu posición, la app además descarta los datos de GPS que no sirven.',
        facts: [
          { label: 'Radio máximo', value: '150 m del complejo' },
          { label: 'Precisión mínima del GPS', value: '100 m' },
          { label: 'Espera máxima del GPS', value: '15 segundos' },
        ],
      },
      {
        question: '¿Qué pasa si el GPS falla o estoy lejos?',
        answer:
          'El check-in no se hace y se te explica por qué: permiso denegado, GPS sin respuesta, señal imprecisa o fuera del radio. Podés reintentar tantas veces como quieras.\n\nUn fallo de GPS no te penaliza por sí solo: no perdés el partido por no poder hacer check-in en ese instante. Lo que pasa es que tu llegada no queda registrada, y si nadie de tu equipo llega al quórum antes del barrido automático, el partido se resuelve como walkover.',
      },
      {
        question: '¿Y si el partido no tiene cancha asignada?',
        answer:
          'El check-in se registra sin pedirte ubicación y sin validación geográfica. Pasa lo mismo si la cancha existe pero todavía no tiene coordenadas cargadas: el sistema no inventa una posición.\n\nEs el caso típico de los amistosos. Los partidos de ranking no pueden estar en esta situación: sin cancha del catálogo directamente no se confirman.',
      },
      {
        question: '¿Qué es la "lista de buena fe"?',
        answer:
          'Es la convocatoria completa (titulares y suplentes) que presentan el capitán, el subcapitán o el director técnico. Se valida contra el catálogo de formatos: mínimo de titulares, máximo en cancha, máximo de convocados, sin repetidos y sólo con gente del plantel o invitados ya registrados.\n\nPresentar la lista también sella la presencia del equipo, y también exige ubicación si hay cancha del catálogo.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'match-types',
    title: 'Amistosos vs. Ranking',
    subtitle: 'Qué cambia según el tipo de partido que elijas',
    icon: 'shield-half-full',
    entries: [
      {
        question: '¿Cuál es la diferencia concreta?',
        answer:
          'La grande: el amistoso no mueve el Elo y el de ranking sí. Pero los dos suman partidos jugados, ganados, empatados, perdidos y goles, y los dos cuentan para goleadores, MVP y trofeos.\n\nLa otra diferencia importante es la cancha: el de ranking exige un complejo del catálogo, el amistoso no.',
        facts: [
          { label: 'Mueve el Elo', value: 'Sólo Ranking' },
          { label: 'Suma estadísticas', value: 'Los dos' },
          { label: 'Cancha obligatoria', value: 'Sólo Ranking' },
          { label: 'Check-in con GPS', value: 'Ranking siempre' },
        ],
      },
      {
        question: '¿Por qué el partido de ranking me exige una cancha del catálogo?',
        answer:
          'Porque mueve el Elo, y el Elo se defiende con el check-in por ubicación. Sin una cancha del catálogo no hay coordenadas contra las cuales medir, y el control geográfico simplemente no existiría.\n\nSe impide en dos capas: la app no te deja enviar la propuesta, y el servidor rechaza la confirmación aunque alguien intente saltear la app.',
      },
      {
        question: '¿Puedo escribir la dirección de la cancha a mano?',
        answer:
          'No. La cancha se elige de un catálogo de zonas y complejos cargados por torneAR. El selector sólo muestra zonas que tienen al menos un complejo activo, así no entrás en un callejón sin salida eligiendo una zona vacía.\n\nSi en tu zona todavía no hay complejos, podés jugar amistosos sin restricción mientras tanto. Escribinos para sumar tu cancha.',
      },
      {
        question: '¿Por qué no puedo desafiar a este equipo a un partido de ranking?',
        answer:
          'Hay cuatro motivos posibles, todos pensados para que el ranking no se pueda inflar:\n\n• Los dos planteles comparten 2 o más jugadores.\n• Ya jugaron un ranking en los últimos 30 días.\n• Ya jugaron 3 partidos de ranking esta temporada entre ustedes.\n• Alguno de los dos equipos está dado de baja.\n\nAdemás sólo podés tener un desafío activo por rival: hay que esperar la respuesta del anterior.',
        facts: [
          { label: 'Jugadores compartidos', value: 'Bloquea con 2 o más' },
          { label: 'Espera entre revanchas', value: '30 días' },
          { label: 'Máximo por temporada', value: '3 partidos' },
        ],
      },
      {
        question: 'El rival tiene mucho más Elo que yo, ¿me deja jugar igual?',
        answer:
          'Sí. Una diferencia mayor a 400 puntos genera un aviso informativo, pero no bloquea nada. Si querés jugar contra un equipo mucho más fuerte, podés — y si ganás, sumás mucho más.',
      },
      {
        question: '¿Por qué no me deja confirmar el partido?',
        answer:
          'Al confirmar se verifica que los dos planteles lleguen al mínimo de jugadores del formato acordado. Se validan los dos, no sólo el que confirma: el que propuso es justamente quien eligió el formato, y nada garantizaba que pudiera cubrirlo.\n\nLa regla existía desde antes, pero se aplicaba recién en la cancha, dentro de las 2 horas previas. Ahora se avisa cuando todavía se puede corregir.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // F3. Las dos reglas arrancan apagadas y se activan con aviso previo: los
  // textos las presentan así, porque la app sale antes que el interruptor.
  {
    id: 'mixed',
    title: 'Equipos Mixtos',
    subtitle: 'Cuántos de cada género hacen falta y cuándo se controla',
    icon: 'gender-male-female',
    entries: [
      {
        question: '¿Qué necesita un equipo mixto para jugar?',
        answer:
          'Al menos 2 jugadores de género masculino y 2 de género femenino. Se controla en el plantel al desafiar, al aceptar un desafío y al confirmar la fecha; entre los titulares al presentar la lista; y entre los presentes en el check-in, donde el quórum solo no alcanza para dar por presentado al equipo.\n\nLa regla se activa con aviso previo a los capitanes. Mientras la pantalla de tu equipo diga «Pronto se va a exigir», todavía no bloquea nada.',
        facts: [
          { label: 'Mínimo por género', value: '2 y 2' },
          { label: 'Género «Otro»', value: 'Completa, no cuenta para el mínimo' },
        ],
      },
      {
        question: '¿Y el género «Otro»?',
        answer:
          'Cuenta para completar el equipo, pero no para los mínimos de cada género. Un equipo con 3 de género masculino, 1 de género femenino y 1 «Otro» todavía necesita otra jugadora de género femenino.',
      },
      {
        question: '¿Quién ve el género de cada jugador?',
        answer:
          'Nadie más que vos. Los integrantes de tu equipo ven cuántos jugadores de cada género tiene el plantel y cuántos faltan; un rival sólo ve si el equipo cumple o no.\n\nEl género se elige al registrarte. Si lo cargaste mal, escribinos a tornearcc@gmail.com desde tu cuenta y lo corregimos.',
      },
      {
        question: '¿Puedo jugar un ranking contra un equipo de otra categoría?',
        answer:
          'Cuando se active la regla, no: los partidos de ranking se juegan entre equipos de la misma categoría (Mixto contra Mixto, Hombres contra Hombres, Mujeres contra Mujeres). Los amistosos siguen siendo libres, y en un amistoso contra otra categoría la composición mixta se controla sólo del lado del equipo Mixto.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'elo-fairplay',
    title: 'Puntaje Elo y Fair Play',
    subtitle: 'Cómo se calculan los dos números de tu equipo',
    icon: 'chart-line',
    entries: [
      {
        question: '¿Por qué mi equipo tiene un Elo distinto en cada formato?',
        answer:
          'Porque son competencias distintas. Un equipo fuerte en Fútbol 5 y flojo en Fútbol 11 terminaba con un promedio que no describía ninguno de los dos.\n\nHoy el Elo y las estadísticas de temporada (ganados, empatados, perdidos) se llevan por formato. Todos arrancan en 1000, y la fila de un formato se crea la primera vez que lo jugás: un equipo que nunca jugó Fútbol 11 no aparece en el ranking de Fútbol 11.',
        facts: [
          { label: 'Elo inicial', value: '1000 por formato' },
          { label: 'Formatos independientes', value: 'F5 · F6 · F7 · F8 · F9 · F11' },
        ],
      },
      {
        question: '¿Cómo se calcula exactamente el movimiento del Elo?',
        answer:
          'Es el sistema Elo estándar del ajedrez:\n\nExpectativa = 1 / (1 + 10 ^ ((Elo rival − Elo propio) / 400))\nMovimiento = redondeo( 40 × (Resultado − Expectativa) )\n\nDonde el resultado es 1 si ganaste, 0,5 si empataron y 0 si perdiste. El movimiento nunca supera los ±40 puntos y es de suma cero: lo que uno gana, el otro lo pierde.\n\nLa consecuencia práctica: ganarle a un equipo mucho más fuerte suma mucho, ganarle a uno mucho más débil suma poco. Es la propiedad central del sistema y es intencional.',
        facts: [
          { label: 'Factor K', value: '40' },
          { label: 'Movimiento máximo', value: '±40 por partido' },
        ],
      },
      {
        question: '¿Qué mueve el Elo y qué no?',
        answer:
          'Sólo los partidos de ranking mueven el Elo: los que terminan normalmente y los que se resuelven por walkover (3-0, con el mismo factor K).\n\nNo mueven el Elo: los amistosos, los partidos cancelados y los que se cierran sin resultado. Los amistosos sí suman a tus estadísticas.\n\nTodo lo aplica un solo motor, con una guarda que impide que un partido ya cerrado vuelva a sumar puntos aunque se lo intente reprocesar.',
      },
      {
        question: '¿Se me borra el Elo cuando cambia la temporada?',
        answer:
          'No. Al cambiar de temporada se resetean ganados, empatados, perdidos y goles —tanto los globales como los de cada formato—, pero el Elo y los partidos jugados de por vida quedan intactos.\n\nEl Elo es continuo entre temporadas. No existe ninguna reducción automática.',
      },
      {
        question: '¿Los equipos nuevos están "en calibración"?',
        answer:
          'No. Un equipo entra al ranking desde su primer día, con 1000 puntos en el formato que juegue. La regla vieja que exigía 5 partidos de ranking para aparecer en la tabla fue eliminada.',
      },
      {
        question: '¿Qué es el Fair Play Score?',
        answer:
          'Un puntaje de 0 a 100 que mide qué tan confiable es un equipo para coordinar. Arranca en 100 y se recalcula entero cada vez que pasa algo relevante, así que no acumula errores.\n\nSe muestra en el ranking junto al Elo y desempata las disputas cuando la votación queda empatada.',
        facts: [
          { label: 'Partido finalizado limpio', value: '+1' },
          { label: 'Cancelación tardía (< 24 h)', value: '−5' },
          { label: 'Walkover por falta de quórum', value: '−5' },
          { label: 'Walkover por no presentarse', value: '−15' },
          { label: 'Partido en disputa', value: '−2' },
        ],
      },
      {
        question: '¿Por qué avisar que no juntamos gente cuesta menos que no aparecer?',
        answer:
          'Porque la escala tiene un solo eje: avisaste o no avisaste. Un equipo que no llega a juntar gente y lo registra deja al rival con tiempo de reorganizarse. Uno que directamente no aparece, no.\n\nPor eso falta de quórum cuesta −5 y no presentarse cuesta −15. Un walkover resuelto automáticamente por el sistema cuesta los −15 completos, porque nadie declaró ningún motivo.\n\nDato importante: una solicitud de cancelación rechazada no penaliza. Sólo cuentan las aceptadas.',
      },
      {
        question: '¿Quién decide el motivo de un walkover?',
        answer:
          'Lo declara quien reclama, no quien faltó. Es una asimetría real y está asumida: el rival podría etiquetar como "no presentación" a un equipo que sí avisó.\n\nSe acepta por dos razones. Primero, la escala sólo puede mejorar la situación del ausente respecto del sistema anterior, donde todo costaba −15. Segundo, el reclamo pasa por un administrador que puede rechazarlo. La alternativa —dejar que el ausente se autodeclare "falta de quórum"— habría creado un atajo trivial para bajar la multa sin presentarse.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'market',
    title: 'El Mercado de Pases',
    subtitle: 'Postulaciones, aceptaciones y traspasos',
    icon: 'account-switch-outline',
    entries: [
      {
        question: '¿Cómo me postulo a un equipo?',
        answer:
          'Los equipos publican qué posición buscan, con formato, día, hora, zona y complejo. Cualquier jugador puede postularse desde el Mercado.\n\nPostularte dos veces al mismo aviso no falla ni duplica: la app te avisa que ya estabas postulado. En "Mis postulaciones" ves todas las que enviaste y en qué quedaron.',
      },
      {
        question: 'Me aceptaron. ¿Ya estoy en el equipo?',
        answer:
          'Todavía no, y este es el paso que más sorprende.\n\nCuando un capitán acepta tu postulación, el sistema crea a tu nombre una solicitud de incorporación ya aprobada por ese club. Vos tenés que confirmar el traspaso desde tu perfil, en "Mis solicitudes". Recién ahí entrás al plantel.\n\nEse paso es deliberado y no se va a sacar: dejar tu club actual es una decisión tuya, no un efecto colateral de que otro equipo te acepte.',
      },
      {
        question: '¿Qué pasa con mi club anterior cuando confirmo?',
        answer:
          'El traspaso es una sola operación: se cierra tu ciclo en el club anterior marcado como TRANSFERENCIA —no como abandono— y se abre el nuevo al mismo tiempo.\n\nNunca quedás sin club en el medio, y tu historial de carrera queda correcto. Las estadísticas que ganaste se conservan siempre.',
      },
      {
        question: 'Mi postulación dice "Vista". ¿Qué significa?',
        answer:
          'Que el dueño del aviso abrió la lista de postulantes y tu postulación estaba ahí. No es una respuesta todavía, pero tampoco es silencio: sabés que la vio.',
      },
      {
        question: '¿Por qué desapareció el aviso al que me había postulado?',
        answer:
          'Porque el equipo aceptó a alguien. Al aceptar una postulación, el aviso se cierra y las que quedaban abiertas pasan a "Rechazada".\n\nAntes esas postulaciones quedaban colgadas para siempre sin respuesta. Preferimos una respuesta clara aunque sea negativa.',
      },
      {
        question: 'Soy jugador libre y publiqué un aviso. ¿Cómo funciona de este lado?',
        answer:
          'Publicás tu posición y si buscás equipo o un partido suelto. Del otro lado, un capitán o subcapitán se postula con uno de sus equipos.\n\nAcá el que acepta sos vos, y aceptar no crea ninguna incorporación automática: abre la conversación, nada más. El alta la iniciás vos cuando quieras. Es tu aviso y es tu decisión.',
      },
      {
        question: '¿Cuánto dura una publicación?',
        answer:
          'Los avisos de equipo con fecha de partido vencen cuando pasa esa fecha y hora. Los que sólo tienen fecha vencen al terminar el día. Los avisos de "busco equipo" duran 14 días.\n\nLa limpieza corre una vez por hora, así que un aviso vencido puede seguir visible hasta 60 minutos. Por eso la app revalida la vigencia justo cuando tocás "Postularme": lo que no se muestra, no se puede postular.',
        facts: [
          { label: 'Aviso "busco equipo"', value: '14 días' },
          { label: 'Limpieza automática', value: 'Cada hora' },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'walkovers',
    title: 'Walkovers y Partidos Colgados',
    subtitle: 'Qué pasa cuando algo no sale como estaba pactado',
    icon: 'gavel',
    entries: [
      {
        question: 'El rival no apareció. ¿Qué pasa?',
        answer:
          'Si tu equipo se presentó con quórum y el rival no, el sistema resuelve el partido solo 4 horas después del horario pactado: 3-0 a tu favor, con movimiento de Elo normal si era de ranking, y descuento de Fair Play para el ausente.\n\nLos dos equipos reciben la notificación.',
        facts: [
          { label: 'Resultado', value: '3 – 0' },
          { label: 'Cuándo se resuelve', value: '4 h después del horario' },
        ],
      },
      {
        question: '¿Y si no fue nadie?',
        answer:
          'El partido se cancela y nadie es penalizado en Fair Play.\n\nSin evidencia de quién faltó, el sistema prefiere cerrar el ciclo y liberar a los convocados antes que repartir culpas. Y si los dos hicieron check-in pero el partido quedó trabado, el barrido no inventa un ganador: queda para revisión manual.',
      },
      {
        question: '¿Puedo reclamar el walkover yo mismo, sin esperar?',
        answer:
          'Sí, si el partido está confirmado o en vivo. Podés reclamarlo si sos capitán o subcapitán, o si vos mismo hiciste check-in. Tu equipo tiene que tener check-in registrado: sin eso no hay reclamo.\n\nPodés cargar hasta 3 goleadores sumando como máximo 3 goles, todos de tu propio plantel. El reclamo lo revisa un administrador de torneAR y los dos equipos reciben el veredicto.\n\nSi el admin rechaza el reclamo y el partido estaba confirmado, el partido se cancela: se cierra el ciclo y se liberan los convocados.',
      },
      {
        question: 'Cargamos resultados distintos. ¿Quién gana?',
        answer:
          'Si los dos marcadores coinciden, el partido se cierra solo. Si no coinciden, pasa a EN DISPUTA y lo resuelven los votos.\n\nVotan únicamente los jugadores que hicieron check-in, porque estuvieron ahí. Un voto por persona, y se puede cambiar mientras la votación siga abierta.\n\nA las 24 horas la votación cierra sola y gana la versión más votada; el marcador del otro equipo se corrige. Si hay empate en votos, desempata el Fair Play más alto. Si también empatan en Fair Play, el sistema se niega a decidir y pasa a revisión de un administrador: prefiere no resolver antes que inventar un ganador.',
        facts: [
          { label: 'Duración de la votación', value: '24 horas' },
          { label: 'Quiénes votan', value: 'Los que hicieron check-in' },
          { label: 'Empate de votos', value: 'Gana el Fair Play más alto' },
        ],
      },
      {
        question: '¿Puedo cerrar la votación antes si ya ganamos?',
        answer:
          'No. Nadie puede: ni vos, ni tu capitán, ni el rival. La votación cierra sola a las 24 horas y no hay forma de adelantarla ni de extenderla.\n\nAntes sí existía un botón de "Resolver Disputa" para los capitanes, y era un problema serio: como el desempate cae en Fair Play cuando los votos están igualados —y cero a cero es el estado en que nace toda disputa— el primero en apretar se llevaba el partido. No era un empate que se rompía por mérito, era una carrera por el botón.\n\nAhora el cierre es un evento de tiempo, así que no hay nada que adelantar.',
      },
      {
        question: '¿Y si nadie vota?',
        answer:
          'La votación igual cierra a las 24 horas. Con cero votos de los dos lados, el desempate es por Fair Play y gana el equipo con el puntaje más alto.\n\nSi además el Fair Play está empatado, el partido queda para que lo revise un administrador. Lo mismo pasa si falta el marcador de alguno de los dos equipos: sin un resultado que adoptar, el sistema no inventa uno.\n\nMientras la votación está abierta la app te muestra hacia dónde caería el desempate, así sabés si te conviene juntar votos antes del cierre.',
      },
      {
        question: '¿Un partido puede quedar abierto para siempre?',
        answer:
          'No. Una vez por hora corre un barrido automático que cierra todo lo que quedó sin resolver. Ningún partido queda colgado indefinidamente, y ningún desafío bloquea a dos equipos para siempre.',
        facts: [
          { label: 'Pendiente sin coordinar', value: 'Se cancela a los 14 días' },
          { label: 'En vivo sin resultado', value: 'Se cierra a las 24 h' },
          { label: 'En vivo con un solo resultado', value: 'Pasa a disputa a las 24 h' },
          { label: 'Desafío sin respuesta', value: 'Se rechaza a los 14 días' },
        ],
      },
      {
        question: '¿El barrido puede pisar un reclamo que estoy esperando?',
        answer:
          'No. El barrido automático nunca toca un partido con un reclamo de walkover que un administrador todavía está evaluando.',
      },
      {
        question: '¿Me avisan antes del partido?',
        answer:
          'Sí. Se manda un recordatorio 24 horas antes de cada partido confirmado, exactamente una vez. El sistema lo revisa cada 15 minutos, así que si una corrida falla, la siguiente lo recupera.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'roles',
    title: 'Roles y Permisos',
    subtitle: 'Qué puede hacer cada uno dentro del equipo',
    icon: 'account-key-outline',
    entries: [
      {
        question: '¿Qué roles existen en un equipo?',
        answer:
          'Cuatro: Capitán, Subcapitán, Director Técnico y Jugador.\n\nCapitán y subcapitán tienen las mismas atribuciones en casi todo: son la conducción del club. El DT tiene un recorte específico y el jugador tiene lo que le corresponde por estar en la cancha.',
      },
      {
        question: '¿Qué puede hacer el Capitán o el Subcapitán?',
        answer:
          'Todo lo que compromete al club:\n\n• Enviar y aceptar desafíos.\n• Proponer, confirmar y cancelar partidos.\n• Presentar la lista de convocados y cargar el resultado.\n• Corregir un resultado que cargó otra persona.\n• Reclamar un walkover (cerrar una disputa no puede nadie: cierra sola).\n• Publicar en el Mercado y aceptar postulantes.\n• Administrar miembros y roles del plantel.\n• Escribir en el chat del partido y en los chats del Mercado.',
      },
      {
        question: '¿Qué puede hacer el Director Técnico?',
        answer:
          'Tiene los permisos del día del partido y ninguno de gestión del club.\n\nPUEDE: marcar su llegada, presentar la lista de convocados y cargar el resultado. También votar en una disputa si hizo check-in.\n\nNO PUEDE: proponer, confirmar ni cancelar un partido; responder solicitudes de cancelación; reclamar o resolver un walkover; corregir un resultado que cargó otro; administrar miembros; ni aceptar postulantes del Mercado.\n\nEl corte no es de confianza, es de naturaleza del acto: proponer o confirmar un partido compromete al club frente a otro club —fecha, cancha, seña— y eso es de la conducción. Reclamar o resolver un walkover cierra un resultado.',
        facts: [
          { label: 'Presentar la lista', value: 'Sí' },
          { label: 'Cargar el resultado', value: 'Sí' },
          { label: 'Confirmar o cancelar partidos', value: 'No' },
          { label: 'Gestionar el plantel', value: 'No' },
        ],
      },
      {
        question: '¿Qué puede hacer un Jugador?',
        answer:
          'Marcar su propia llegada al partido, votar en una disputa si hizo check-in, y reclamar un walkover si él mismo hizo check-in.\n\nNo puede presentar la lista, cargar el resultado, ni tocar nada de la gestión del club.',
      },
      {
        question: '¿Quién puede votar en una disputa?',
        answer:
          'Únicamente los jugadores que hicieron check-in en ese partido, sin importar su rol. Capitán, subcapitán, DT y jugador votan igual: lo que habilita el voto es haber estado ahí, no el cargo.\n\nCerrar la votación, en cambio, no puede nadie: la cierra el sistema a las 24 horas.',
      },
      {
        question: '¿Por qué el DT no puede corregir un resultado que cargó otro?',
        answer:
          'Porque ya puede corregir el que cargó él mismo. Pisar el marcador que cargó otra persona —sobre un resultado que ya movió el Elo— es una atribución distinta, y sigue siendo del capitán o subcapitán.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'chats',
    title: 'Los Chats',
    subtitle: 'Cuándo se abren y quién los lee',
    icon: 'chat-outline',
    entries: [
      {
        question: '¿Cuándo se abre el chat de un partido?',
        answer:
          'En el momento exacto en que el rival ACEPTA tu desafío. No al enviarlo: mientras el desafío está esperando respuesta no hay ningún canal abierto entre los dos equipos.\n\nEl chat nace junto con el partido, en la misma operación, y hay uno solo por partido.',
      },
      {
        question: '¿Quién lee el chat del partido?',
        answer:
          'Todos los miembros de los dos equipos, sin importar el rol. Escribir, en cambio, sólo pueden el capitán y el subcapitán de cada equipo.\n\nOjo con esto: NO es un canal privado de tu equipo. El rival lee absolutamente todo lo que se escribe ahí. Es un canal de coordinación entre clubes, no un vestuario.',
        facts: [
          { label: 'Leen', value: 'Ambos planteles completos' },
          { label: 'Escriben', value: 'Capitán y subcapitán' },
          { label: 'Invitados', value: 'No tienen acceso' },
        ],
      },
      {
        question: 'Soy DT, ¿por qué no puedo escribir en el chat del partido?',
        answer:
          'Es una inconsistencia conocida, no una decisión. El DT recibió permisos operativos del día del partido —presentar la lista, cargar el resultado— pero las reglas de mensajería quedaron fuera de ese cambio y siguen admitiendo sólo a capitán y subcapitán.\n\nHoy, en el chat, un DT tiene el mismo acceso que un jugador: ve la conversación completa y no puede responder. Está anotado como pendiente.',
      },
      {
        question: '¿Cuándo se abre un chat del Mercado?',
        answer:
          'Cuando contactás a un equipo desde una publicación del Mercado. Se abre automáticamente después de registrar tu postulación: primero queda asentada la postulación, después se abre la conversación.\n\nHay un solo chat por cada par jugador–equipo: si te postulás a tres avisos del mismo club, seguís teniendo una sola conversación con él.',
      },
      {
        question: '¿Quién lee lo que le escribo a un club?',
        answer:
          'El plantel entero, no sólo quien te responde. Del lado del equipo la lectura está abierta a todos los miembros sin importar el rol; lo que está restringido es la escritura, que queda para capitán y subcapitán.',
      },
      {
        question: 'Me postulé pero el chat no se abrió. ¿Perdí la postulación?',
        answer:
          'No. Son dos pasos separados a propósito y el chat es el secundario. Si el chat falla, tu postulación ya quedó registrada y el capitán la recibe igual.\n\nEs deliberado: decirte "no pudimos postularte" cuando sí quedaste postulado es peor que no abrirte el chat.',
      },
      {
        question: '¿Lo que acordamos por chat vale?',
        answer:
          'Entre ustedes sí, pero el sistema no lo lee. Nada de lo que se escriba por chat modifica un partido, un resultado o un traspaso: todo eso pasa por su propio circuito con sus propias validaciones. Un "dale, ganamos 3-1" por chat no carga ningún resultado.\n\nTampoco sirve como evidencia automática en un reclamo de walkover: ahí lo que cuenta son los check-in registrados y la foto que se adjunta al reclamo.',
      },
    ],
  },
];
