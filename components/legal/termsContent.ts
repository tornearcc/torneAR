/**
 * Términos y Condiciones de uso de torneAR — **Versión Final 11**.
 *
 * Transcripción de `docs/legales/Terminos_y_Condiciones_TorneAR_Version_11_LISTA_PARA_PUBLICAR.pdf`.
 * El texto legal NO se reescribe ni se resume: se transcribe. Si hay que
 * cambiar una cláusula, se cambia primero el documento legal y después acá.
 *
 * Espejo 1:1 de dashboard/lib/legal/termsContent.ts. Sincronización manual:
 * si tocás este archivo, replicá el cambio allá (y viceversa).
 *
 * ── Dos desvíos deliberados respecto del PDF ─────────────────────────────────
 *
 * 1. DOMICILIOS OMITIDOS. La cláusula 2 del PDF incluye el domicilio físico de
 *    cada Titular. Acá se publican sólo DNI y CUIT/CUIL, por decisión del
 *    equipo: son domicilios particulares y esta pantalla es pública. El canal
 *    de contacto legal es `tornearcc@gmail.com` (misma cláusula 2), que es lo
 *    que se ofrece a usuarios y terceros para consultas, reclamos y ejercicio
 *    de derechos.
 *
 * 2. TACHADO APLICADO. En las cláusulas 8 y 9 el PDF trae "ilícito o no
 *    consentido" con tachado (marca de edición), calificando a "contenido/
 *    material sexual". Se transcribe con el tachado YA APLICADO —es decir, sin
 *    esas palabras—, lo que deja la prohibición de contenido sexual como
 *    absoluta y no acotada a lo ilícito o no consentido.
 *
 * ── Cómo se versiona ─────────────────────────────────────────────────────────
 * `TERMS_LAST_UPDATED` no es decorativo: alimenta `LEGAL_VERSIONS.terms`
 * (tornear/constants/legal.ts), que es la constancia versionada que se guarda
 * en `user_metadata.tyc_version` al aceptar. Cambiar esta fecha hace que
 * `needsLegalAcceptance()` considere desactualizados a todos los usuarios que
 * aceptaron la versión anterior y dispara `LegalVersionGate` — que es
 * exactamente lo que corresponde para un cambio de versión como este.
 */

export interface LegalSection {
  /** Se renderiza en mayúsculas; escribirlo normal. */
  title: string;
  /**
   * Uno o más párrafos. Array y no string con `\n` para que el renderizador
   * controle el espaciado entre párrafos en vez de depender de saltos de línea.
   */
  paragraphs: string[];
}

/**
 * Se muestra bajo el título Y actúa como identificador de versión del
 * documento (ver el header). Cambiarlo al publicar una versión nueva.
 */
export const TERMS_LAST_UPDATED = '20 de Agosto, 2026';

export const TERMS_INTRO =
  'Al utilizar torneAR, aceptás someterte a estos Términos y Condiciones. Leé detenidamente esta información antes de utilizar la plataforma. Versión Final 11.';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Definiciones',
    paragraphs: [
      'A los efectos del presente documento, se entenderá por:',
      '«TorneAR»: plataforma tecnológica de intermediación que facilita el contacto, la interacción y la coordinación entre usuarios y equipos vinculados con la práctica del fútbol. Permite, entre otras funcionalidades, buscar jugadores o equipos, publicar disponibilidad o interés en disputar partidos y acceder, publicar o intercambiar información relativa a partidos, torneos u otras actividades futbolísticas organizadas por usuarios o terceros. TorneAR no crea, organiza, administra ni gestiona torneos, partidos ni actividades deportivas.',
      '«Usuario»: toda persona mayor de dieciocho (18) años que se registre en la plataforma.',
      '«Equipo»: conjunto de usuarios que participe o se organice mediante la plataforma.',
      '«Organizador»: usuario que, por iniciativa propia y bajo su responsabilidad, crea, convoca, publica, administra u organiza un partido, torneo o actividad utilizando las herramientas de TorneAR.',
      '«Contenido de Usuario»: fotografías, videos, escudos, nombres, descripciones, mensajes y demás material cargado o generado por los usuarios a través de la plataforma.',
    ],
  },
  {
    title: '2. Identificación de los Titulares y Operadores',
    paragraphs: [
      'La plataforma tecnológica denominada «TorneAR» es de titularidad conjunta y es operada por Juan Ignacio Sacco Moriconi, DNI N.° 44787831, CUIT/CUIL N.° 20447878314, y Agustín Saladino, DNI N.° 45415371, CUIT/CUIL N.° 20454153716, en adelante denominados conjuntamente los «Titulares» u «Operadores».',
      'A los efectos de estos Términos y Condiciones, la denominación «TorneAR» identifica a la plataforma tecnológica, su nombre, marca y signo distintivo, actualmente de titularidad conjunta de los Titulares identificados precedentemente.',
      'TorneAR no se encuentra actualmente constituida como una persona jurídica independiente de sus Titulares. Esta circunstancia no implica renuncia, cesión, abandono, autorización ni liberación alguna respecto de los derechos de los Titulares sobre la denominación, marca, identidad, software, desarrollos y demás activos vinculados con TorneAR.',
      'La utilización de la denominación «TorneAR» en estos Términos y Condiciones y en la explotación de la plataforma constituye una identificación del proyecto y de la actividad desarrollada por sus Titulares, sin perjuicio de los derechos marcarios, de propiedad intelectual y demás derechos que les correspondan.',
      'Queda expresamente prohibido a cualquier persona humana o jurídica ajena a los Titulares, sin autorización previa y expresa de ambos, utilizar, registrar, solicitar el registro, reservar o intentar apropiarse de la denominación «TorneAR», de la marca TorneAR o de signos idénticos o confundibles, como marca, designación comercial, denominación o razón social, nombre de persona jurídica, nombre de dominio, usuario o identificación en redes sociales, aplicación, plataforma digital o cualquier otro signo identificatorio, cuando dicho uso pueda afectar los derechos de los Titulares o generar confusión, asociación o apariencia de vinculación con TorneAR.',
      'Asimismo, queda prohibido utilizar la denominación, marca, identidad, software, código, diseños, documentación, know-how u otros activos de TorneAR para constituir o desarrollar una persona jurídica, emprendimiento, plataforma, aplicación o actividad que se presente como titular, continuadora, vinculada, autorizada o relacionada con TorneAR sin consentimiento previo y expreso de ambos Titulares.',
      'La eventual constitución futura de una sociedad por los Titulares para continuar la explotación de TorneAR no conferirá derecho alguno a terceros sobre la denominación, marca o demás activos del proyecto. La transferencia o aporte de dichos derechos a la futura sociedad deberá ser decidida por ambos Titulares e instrumentada conforme a la legislación aplicable.',
      'Consultas, comunicaciones, reclamos y ejercicio de derechos: correo electrónico y canal de contacto: tornearcc@gmail.com.',
    ],
  },
  {
    title: '3. Objeto y naturaleza de la plataforma',
    paragraphs: [
      'TorneAR es exclusivamente una plataforma tecnológica de intermediación. Su función consiste en facilitar el contacto, la interacción y la coordinación entre usuarios y equipos interesados en actividades vinculadas con el fútbol y poner a su disposición herramientas digitales para buscar jugadores o equipos, publicar disponibilidad o interés en disputar partidos y acceder, publicar o intercambiar información relativa a partidos, torneos u otras actividades futbolísticas organizadas por usuarios o terceros.',
      'TorneAR no crea, organiza, administra ni gestiona torneos, partidos o actividades deportivas y no asume, por el solo hecho de proporcionar la plataforma o herramientas tecnológicas de intermediación, el carácter de organizador, coorganizador, empleador, representante, asegurador, árbitro, prestador médico, propietario, locador o explotador de establecimientos deportivos.',
      'La responsabilidad por la creación, convocatoria, organización, administración y desarrollo material de cada partido, torneo o actividad corresponde exclusivamente al usuario, Organizador o tercero que la asuma y, cuando corresponda, a los respectivos prestadores de servicios.',
      'TorneAR no verifica de forma activa la idoneidad física, aptitud médica ni veracidad de los datos que cada usuario carga sobre sí mismo, su equipo o sus condiciones para la práctica deportiva, salvo los controles expresamente previstos en estos Términos y Condiciones.',
    ],
  },
  {
    title: '4. Requisitos de registro',
    paragraphs: [
      'Los usuarios deberán proporcionar información exacta, veraz y actualizada; mantener la confidencialidad de sus credenciales; utilizar la plataforma conforme a la legislación vigente; y contar con capacidad legal suficiente para contratar. Cada usuario es responsable de la actividad realizada desde su cuenta y deberá comunicar cualquier acceso no autorizado del que tome conocimiento. La cuenta es personal e intransferible. El usuario no podrá cederla, venderla, prestarla ni permitir deliberadamente su utilización por terceros.',
    ],
  },
  {
    title: '5. Edad mínima, declaración y verificación',
    paragraphs: [
      'El acceso y registro en TorneAR está reservado exclusivamente a personas mayores de dieciocho (18) años. Queda prohibido el registro de menores de edad, aun mediando autorización de padres, tutores o representantes legales.',
      'Como condición indispensable para completar el registro, el usuario deberá marcar expresamente un checkbox con una declaración sustancialmente equivalente a: «Declaro bajo juramento que tengo 18 años cumplidos o más».',
      'TorneAR conservará evidencia electrónica razonable de dicha aceptación, incluyendo la identificación de la cuenta, fecha y hora y versión de los Términos y Condiciones aceptados, de acuerdo con su Política de Privacidad y los plazos de conservación aplicables.',
      'TorneAR podrá solicitar documentación razonable para verificar la edad cuando existan indicios de falsedad y podrá suspender o cancelar la cuenta. La falsedad de la declaración constituye un incumplimiento esencial.',
      'Cuando TorneAR compruebe razonablemente que una cuenta corresponde a una persona menor de dieciocho (18) años, procederá a suspender o cancelar la cuenta y adoptará las medidas correspondientes respecto de los datos personales asociados, conforme a la Política de Privacidad y las obligaciones legales de conservación aplicables.',
    ],
  },
  {
    title: '6. Veracidad de la información',
    paragraphs: [
      'Cada usuario será el único responsable de la exactitud, integridad y actualización de la información suministrada. TorneAR no se responsabiliza por errores, omisiones, falsedades, suplantaciones de identidad u otros incumplimientos imputables a los usuarios, sin perjuicio de las obligaciones legales que correspondan a la plataforma.',
    ],
  },
  {
    title: '7. Fair Play y conducta',
    paragraphs: [
      'Los usuarios deberán mantener una conducta respetuosa y acorde con la sana competencia. Se prohíben amenazas, agresiones físicas o verbales, discriminación, hostigamiento, conductas violentas, difusión de contenido ilícito, identidades falsas y manipulación de resultados. Los incumplimientos podrán dar lugar a las medidas previstas en estos Términos y Condiciones.',
    ],
  },
  {
    title: '8. Comunicaciones entre usuarios',
    paragraphs: [
      'En las comunicaciones realizadas mediante la plataforma se prohíbe el spam, la difusión no autorizada de información privada de terceros, contenido sexual, estafas, amenazas y cualquier conducta ilícita. TorneAR podrá moderar, restringir o eliminar contenido y actuar frente a denuncias conforme a estos Términos y Condiciones y la legislación aplicable.',
    ],
  },
  {
    title: '9. Contenido prohibido',
    paragraphs: [
      'Los usuarios son responsables del contenido que publiquen, transmitan o incorporen a TorneAR. Queda prohibido el contenido que: infrinja derechos de autor, marcas, nombres, escudos, diseños u otros derechos de terceros; utilice imágenes, videos o datos personales de terceros sin autorización cuando ésta resulte necesaria; sea ilícito, fraudulento, engañoso o deliberadamente falso; contenga amenazas, hostigamiento, discriminación o incitación a la violencia o al odio; incluya material sexual; promueva delitos, comercialización o consumo ilegal de drogas o sustancias prohibidas; promocione apuestas o juegos no autorizados; constituya publicidad engañosa, spam o comunicaciones comerciales no autorizadas; o vulnere la privacidad, honor, imagen u otros derechos de terceros.',
      'TorneAR podrá retirar, bloquear o restringir dicho contenido y adoptar medidas respecto de la cuenta responsable.',
      'Quien considere que un contenido publicado en TorneAR infringe derechos de propiedad intelectual, imagen u otros derechos podrá comunicarlo a tornearcc@gmail.com, identificando razonablemente el contenido cuestionado y el derecho invocado. TorneAR podrá adoptar medidas preventivas respecto del contenido mientras analiza el reporte, de conformidad con estos Términos y Condiciones y la legislación aplicable.',
    ],
  },
  {
    title: '10. Ausencia de relación laboral, societaria o de intermediación laboral',
    paragraphs: [
      'La utilización de TorneAR no genera relación laboral, de dependencia, societaria, de agencia, representación ni intermediación laboral entre TorneAR y los usuarios, ni entre los usuarios entre sí. Cualquier contraprestación económica pactada entre usuarios es ajena a TorneAR y de exclusiva responsabilidad de quienes la acuerden.',
    ],
  },
  {
    title: '11. Responsabilidad del Organizador',
    paragraphs: [
      'Cuando un usuario o tercero cree, convoque, publique, administre u organice por iniciativa propia un partido, torneo, campeonato o actividad deportiva y utilice TorneAR como medio de intermediación, contacto o difusión, revestirá el carácter de «Organizador» a los efectos de estos Términos y Condiciones.',
      'El Organizador será responsable, en la medida de las funciones efectivamente asumidas por él, de establecer y comunicar reglas particulares; coordinar fechas, horarios y lugares; efectuar convocatorias; gestionar inscripciones; contratar o coordinar canchas, árbitros y proveedores; obtener permisos o autorizaciones exigibles; informar condiciones particulares; adoptar medidas razonables de organización y seguridad; y cumplir las obligaciones legales, administrativas, fiscales y contractuales que resulten aplicables.',
      'TorneAR actúa exclusivamente como plataforma tecnológica de intermediación. La publicación, difusión, contacto o interacción a través de la plataforma no convierte a TorneAR ni a sus Titulares en organizadores o coorganizadores de la actividad.',
      'El Organizador deberá mantener indemnes a los Titulares de TorneAR frente a reclamos de terceros derivados directamente de incumplimientos o conductas imputables al Organizador, dentro de los límites permitidos por la legislación aplicable.',
    ],
  },
  {
    title: '12. Actividad deportiva y riesgos inherentes',
    paragraphs: [
      'La práctica del fútbol implica riesgos inherentes, incluyendo golpes, caídas, choques, esguinces, fracturas, lesiones musculares o articulares y otras contingencias propias de la actividad física.',
      'Cada usuario participa por su exclusiva voluntad, asume los riesgos propios e inherentes de la actividad, declara encontrarse en condiciones adecuadas para practicarla y es responsable de realizar los controles médicos que correspondan según su situación personal.',
      'TorneAR no presta servicios de evaluación, diagnóstico, supervisión o certificación de aptitud física o médica, y ninguna información disponible en la plataforma constituye recomendación médica.',
      'Los riesgos inherentes a la práctica deportiva son distintos de cualquier responsabilidad que pudiera corresponder a los Titulares por una conducta directamente imputable a la operación de la plataforma, que se evaluará conforme a la legislación aplicable. Los Titulares, así como sus eventuales empleados o colaboradores, no serán responsables por contingencias derivadas de la actividad deportiva que no les resulten legalmente imputables.',
    ],
  },
  {
    title: '13. Responsabilidad por daños y pérdidas',
    paragraphs: [
      'Los Titulares de TorneAR no serán responsables por robos, hurtos o extravíos; daños materiales; pérdida de objetos; conflictos entre usuarios; daños ocasionados por terceros; ni incumplimientos, negligencias o hechos imputables a Organizadores, árbitros, establecimientos deportivos u otros terceros ajenos a la operación de la plataforma. Esta exclusión no alcanza a responsabilidades que legalmente resulten directamente imputables a los Titulares.',
    ],
  },
  {
    title: '14. Limitación de responsabilidad',
    paragraphs: [
      'En los casos en que legalmente se determine responsabilidad de los Titulares de TorneAR, ésta quedará limitada a los daños que guarden relación de causalidad adecuada y directa con la conducta que les resulte imputable, conforme al Código Civil y Comercial de la Nación y demás normativa aplicable.',
      'Ninguna disposición de estos Términos y Condiciones deberá interpretarse como una exclusión o limitación de responsabilidad en supuestos en los que la ley prohíba hacerlo, incluyendo los casos alcanzados por el artículo 1743 del Código Civil y Comercial de la Nación y las normas imperativas de defensa del consumidor.',
    ],
  },
  {
    title: '15. Estado de instalaciones y canchas de terceros',
    paragraphs: [
      'TorneAR no garantiza las condiciones de seguridad, higiene, mantenimiento o funcionamiento de canchas o instalaciones de terceros. La elección y contratación del lugar corresponde a los usuarios, Organizadores o terceros involucrados. La mera publicación de información o facilitación del contacto con un establecimiento no convierte a TorneAR ni a sus Titulares en propietarios, explotadores ni responsables de dicho establecimiento.',
    ],
  },
  {
    title: '16. Seguros y cobertura médica',
    paragraphs: [
      'El registro en TorneAR, la creación o incorporación a un equipo, la inscripción en un torneo o la participación en un partido coordinado mediante la plataforma no implica, por sí mismo, la contratación ni existencia de seguro alguno.',
      'Salvo información expresa en contrario para una funcionalidad determinada, los Titulares de TorneAR no proporcionan seguros de accidentes personales, cobertura médica, seguro de vida ni seguro de responsabilidad civil por el solo uso de la plataforma.',
      'Cada usuario deberá verificar las coberturas médicas o asegurativas que considere adecuadas. El Organizador deberá verificar, cuando corresponda, los seguros, servicios de emergencia y demás requisitos legal o contractualmente exigibles.',
    ],
  },
  {
    title: '17. Disponibilidad y seguridad de la plataforma',
    paragraphs: [
      'TorneAR adopta medidas técnicas y organizativas razonables para resguardar la integridad, disponibilidad y seguridad del servicio y de la información, sin garantizar la inexistencia absoluta de errores, interrupciones, fallas informáticas, pérdida de datos, ataques cibernéticos o accesos no autorizados.',
    ],
  },
  {
    title: '18. Exclusión de garantías',
    paragraphs: [
      'TorneAR no es responsable de la concreción de partidos, la asistencia de jugadores o árbitros, el nivel deportivo de los equipos ni la veracidad de la información suministrada por los usuarios. TorneAR no garantiza la identidad de los usuarios salvo respecto de aquellas verificaciones que expresamente informe haber realizado, y únicamente con el alcance informado para cada mecanismo de verificación.',
    ],
  },
  {
    title: '19. Resultados, rankings y clasificaciones',
    paragraphs: [
      'Cuando la plataforma permita a los usuarios informar resultados, rankings, puntajes o clasificaciones, dicha información será suministrada por los propios usuarios u Organizadores. TorneAR podrá establecer mecanismos técnicos de reporte, corrección o moderación ante indicios razonables de irregularidades, sin que ello implique asumir la organización o gestión del partido, torneo o competencia.',
    ],
  },
  {
    title: '20. Cancelaciones, inasistencias, «no show», suspensiones y abandono',
    paragraphs: [
      'Los usuarios y equipos deberán actuar de buena fe y respetar los compromisos asumidos respecto de partidos y torneos.',
      'Podrán considerarse incumplimientos: confirmar participación y no presentarse sin aviso o justificación razonable («no show»); cancelar reiteradamente con escasa antelación; abandonar injustificadamente un partido o torneo; incumplir reiteradamente horarios o condiciones aceptadas; o generar deliberadamente situaciones destinadas a impedir la actividad.',
      'TorneAR podrá aplicar medidas vinculadas exclusivamente al uso de la plataforma, incluyendo advertencias, restricciones, suspensión o cancelación de cuentas y, cuando una funcionalidad lo permita, registrar o reflejar incidencias reportadas por los usuarios. Tales medidas no implican que TorneAR organice, administre o gestione el partido o torneo.',
      'Cuando una actividad no pueda realizarse o deba suspenderse por lluvia, condiciones climáticas, indisponibilidad o estado de la cancha, ausencia del árbitro, caso fortuito, fuerza mayor o hechos de terceros, TorneAR no garantiza su reprogramación ni será responsable por consecuencias que no le sean legalmente imputables.',
    ],
  },
  {
    title: '21. Disputas, reportes y revisión',
    paragraphs: [
      'Los usuarios podrán reportar usuarios, equipos, mensajes, resultados o contenidos. TorneAR podrá revisar dichos reportes únicamente a efectos de la administración y seguridad de la plataforma y adoptar medidas sobre cuentas o contenidos. TorneAR no actuará como árbitro ni resolverá controversias deportivas, contractuales o económicas entre usuarios, Organizadores o terceros, sin perjuicio de mecanismos técnicos de corrección de información manifiestamente errónea o contraria a estos Términos.',
    ],
  },
  {
    title: '22. Pagos, comisiones y reintegros',
    paragraphs: [
      'A la fecha de estos Términos y Condiciones, el uso de TorneAR no genera el cobro de comisiones a los usuarios. Si en el futuro se incorporan servicios pagos, funcionalidades premium o comisiones, sus condiciones serán informadas previamente y podrán regirse por términos específicos adicionales, de acuerdo con la normativa aplicable.',
    ],
  },
  {
    title: '23. Cláusula de indemnidad',
    paragraphs: [
      'Cada usuario se compromete a mantener indemnes a los Titulares de TorneAR frente a reclamos de terceros derivados directamente de conductas ilícitas del usuario; incumplimientos imputables a éste; contenido que infrinja derechos de terceros; falsedad de información; o, cuando actúe como Organizador, incumplimientos propios de las obligaciones asumidas en tal carácter. Esta cláusula no alcanza a reclamos derivados de conductas legalmente imputables a los Titulares.',
    ],
  },
  {
    title: '24. Propiedad intelectual, marca y prohibición de uso por terceros',
    paragraphs: [
      'La denominación «TorneAR», su marca, nombre, logotipo, signos distintivos, diseños, identidad visual, software, código fuente y código objeto, interfaces, bases de datos, algoritmos, documentación, contenidos gráficos, desarrollos y demás activos de propiedad intelectual vinculados con la plataforma pertenecen a sus respectivos Titulares, conforme a los acuerdos de cotitularidad existentes entre ellos, y se encuentran protegidos por la legislación aplicable.',
      'Ninguna persona humana o jurídica distinta de los Titulares podrá utilizar, reproducir, copiar, imitar, modificar, adaptar, publicar, distribuir, comercializar, explotar, registrar, solicitar el registro, licenciar o utilizar de cualquier otra forma la marca «TorneAR», su denominación, logotipo, signos distintivos, software, código, diseños, contenidos u otros activos de propiedad intelectual, sin autorización previa y expresa de los Titulares, salvo los usos expresamente permitidos por la legislación aplicable.',
      'En particular, queda prohibido a terceros, salvo autorización previa y expresa de los Titulares: a) utilizar la denominación o marca «TorneAR» con fines comerciales, publicitarios, promocionales o identificatorios; b) utilizar signos, denominaciones, logotipos, nombres de dominio, perfiles o identificadores que reproduzcan la marca o puedan razonablemente generar confusión respecto de su vinculación con TorneAR; c) registrar o intentar registrar la marca «TorneAR», signos idénticos, similares o confundibles, nombres de dominio, perfiles de redes sociales u otros identificadores relacionados con ella; d) copiar, reproducir, modificar, adaptar, distribuir, sublicenciar, comercializar o explotar el software, código, diseños, interfaces, documentación u otros desarrollos propios de TorneAR, salvo en los casos permitidos por la legislación aplicable; e) presentarse como titular, representante, asociado, patrocinador, licenciatario, organizador o persona vinculada con TorneAR sin autorización; y f) utilizar la marca o identidad de TorneAR de forma que pueda inducir a error respecto de la existencia de una relación comercial, societaria, contractual o institucional con sus Titulares.',
      'El registro como usuario o la utilización de la plataforma no otorga licencia, autorización, cesión ni derecho de propiedad alguno sobre la marca, denominación, logotipo, software o demás activos de propiedad intelectual de TorneAR, excepto el derecho limitado, personal, revocable, no exclusivo e intransferible de utilizar la plataforma de conformidad con estos Términos y Condiciones.',
      'Todo uso no autorizado podrá dar lugar al ejercicio, por quienes se encuentren legitimados, de las acciones administrativas, civiles y/o judiciales que correspondan para obtener su cese, prevenir o reparar los daños ocasionados y proteger los derechos sobre TorneAR.',
      'El Contenido de Usuario continuará perteneciendo a quien resulte su legítimo titular. El usuario otorga a los Titulares de TorneAR una licencia no exclusiva, gratuita y limitada para alojar, reproducir, adaptar técnicamente y mostrar dicho contenido únicamente en la medida necesaria para proporcionar las funcionalidades de la plataforma.',
      'Los Titulares prevén que en el futuro podrá constituirse una persona jurídica destinada a continuar el desarrollo y explotación de TorneAR y, en su caso, a ser titular de la marca y/o de otros activos del proyecto. La constitución de dicha persona jurídica no producirá por sí sola transferencia alguna. Toda cesión, aporte, licencia o transferencia de la marca, software u otros derechos deberá instrumentarse conforme a la legislación aplicable. Una vez perfeccionada y, cuando corresponda, registrada dicha transferencia, las referencias de estos Términos y Condiciones a los «Titulares» respecto de los activos transferidos se entenderán efectuadas a la persona jurídica que resulte su titular, sin perjuicio de la actualización formal de estos Términos y Condiciones y de la Política de Privacidad que corresponda.',
    ],
  },
  {
    title: '25. Imagen y contenido audiovisual',
    paragraphs: [
      'El uso dentro de la plataforma de fotografías de perfil, escudos y demás contenido necesario para prestar el servicio se regirá por estos Términos y por la Política de Privacidad.',
      'El uso de imagen, nombre, voz, fotografías o videos identificables de un usuario con fines promocionales, publicitarios o comerciales fuera de las funcionalidades esenciales requerirá autorización previa, específica, informada y separada.',
      'Cuando corresponda, TorneAR presentará un checkbox independiente y no preseleccionado con una declaración sustancialmente equivalente a: «Autorizo a TorneAR a utilizar mi imagen y/o contenido audiovisual en comunicaciones institucionales, promocionales y publicitarias, conforme a las condiciones informadas».',
      'La negativa a otorgar esta autorización no impedirá el registro ni el uso de las funcionalidades esenciales. La autorización podrá revocarse para usos futuros conforme a la Política de Privacidad, sin afectar los tratamientos lícitos realizados con anterioridad.',
    ],
  },
  {
    title: '26. Datos personales y Política de Privacidad',
    paragraphs: [
      'El tratamiento de datos personales se regirá por la Ley N.° 25.326, sus normas reglamentarias, las disposiciones de la Agencia de Acceso a la Información Pública y demás normativa aplicable. Mientras TorneAR no se encuentre constituida como persona jurídica independiente, serán responsables del tratamiento las personas humanas que, en su carácter de Titulares y Operadores de TorneAR, determinen las finalidades y medios del tratamiento. La regulación específica del tratamiento de datos personales se desarrollará en una Política de Privacidad independiente de estos Términos y Condiciones, que será puesta a disposición de los usuarios mediante un enlace o mecanismo accesible dentro de la plataforma y que integrará el marco contractual aplicable al uso de TorneAR.',
      'En cumplimiento del deber de información establecido por el artículo 6 de la Ley N.° 25.326, TorneAR mantendrá a disposición de los usuarios una Política de Privacidad clara, accesible y actualizada, que informará las condiciones aplicables a la recolección y tratamiento de sus datos personales.',
      'La Política de Privacidad será elaborada y actualizada sobre la base del funcionamiento técnico real de TorneAR y deberá reflejar, según corresponda, las categorías de datos efectivamente recolectados; sus finalidades; el carácter obligatorio o facultativo de cada dato; las consecuencias de proporcionarlo o negarse a hacerlo; los destinatarios; proveedores tecnológicos, encargados y servicios de terceros utilizados; modalidades y lugares de almacenamiento; eventuales transferencias nacionales o internacionales; criterios y plazos de conservación; procedimientos de baja, eliminación o anonimización; medidas de seguridad; derechos de los titulares y canales para ejercerlos; tratamiento de geolocalización; fotografías, videos y demás Contenido de Usuario; y cualquier otro tratamiento que resulte del relevamiento técnico de la aplicación.',
      'Antes de implementar o habilitar tratamientos de datos personales que requieran información específica o consentimiento del usuario, TorneAR deberá contar con la Política de Privacidad correspondiente debidamente publicada y con los mecanismos de información, aceptación o consentimiento que resulten legalmente exigibles. Cualquier nueva funcionalidad que implique categorías de datos, finalidades, proveedores, transferencias o modalidades de tratamiento no contempladas deberá ser evaluada y, cuando corresponda, reflejada previamente en la Política de Privacidad.',
      'TorneAR recopilará únicamente datos adecuados, pertinentes y razonablemente necesarios para las finalidades previamente informadas. Los datos de geolocalización aproximada o precisa serán tratados únicamente cuando una funcionalidad efectivamente implementada y solicitada por el usuario lo requiera, con el alcance, finalidad y condiciones que se informen en la Política de Privacidad y en los permisos del dispositivo o sistema operativo que correspondan.',
      'TorneAR no solicitará ni tratará datos relativos a la salud salvo que una funcionalidad futura lo requiera legítimamente y se implementen previamente las condiciones legales, técnicas y de consentimiento que correspondan. Los canales específicos para consultas, reclamos y ejercicio de derechos en materia de datos personales serán identificados en la Política de Privacidad y deberán encontrarse disponibles al momento de su publicación. Los Titulares adoptarán medidas técnicas y organizativas razonables y proporcionales a los tratamientos efectivamente realizados para preservar la confidencialidad, integridad y disponibilidad de los datos personales.',
      'TorneAR no recopila intencionalmente datos personales de menores de dieciocho (18) años. Si toma conocimiento de una cuenta perteneciente a un menor, adoptará las medidas de suspensión o baja y el tratamiento de los datos asociados se realizará conforme a la normativa aplicable y a la Política de Privacidad vigente.',
    ],
  },
  {
    title: '27. Geolocalización',
    paragraphs: [
      'Las funcionalidades que efectivamente utilicen ubicación aproximada o precisa deberán informar previamente al usuario la finalidad, alcance y modalidad del tratamiento. TorneAR accederá a la ubicación únicamente en la medida necesaria para la funcionalidad solicitada y de acuerdo con los permisos otorgados por el usuario. No se accederá a la ubicación en segundo plano salvo que una funcionalidad concreta lo requiera, se informe expresamente y exista la habilitación correspondiente. La negativa o revocación del permiso de ubicación podrá limitar únicamente las funcionalidades que dependan de dicho dato, conforme se detalle en la Política de Privacidad.',
    ],
  },
  {
    title: '28. Baja, suspensión y cancelación de cuentas',
    paragraphs: [
      'El usuario podrá solicitar la baja de su cuenta por los medios que se habiliten e informen en la plataforma y en la Política de Privacidad. El tratamiento posterior de los datos asociados a una cuenta dada de baja —incluyendo su eliminación, anonimización o conservación temporal— se realizará conforme a las finalidades, plazos y obligaciones legales que se detallen en la Política de Privacidad vigente y en la normativa aplicable.',
      'TorneAR podrá aplicar suspensión preventiva, suspensión temporal o cancelación definitiva ante incumplimientos, fraude, riesgos de seguridad o requerimientos legales. Salvo urgencia, se informará el motivo y se brindará una instancia razonable de descargo. Las medidas justificadas no generarán derecho a indemnización, sin perjuicio de los derechos inderogables que correspondan.',
    ],
  },
  {
    title: '29. Emergencias',
    paragraphs: [
      'TorneAR no presta servicios médicos, de asistencia sanitaria ni de emergencias. Ante un accidente, lesión, descompensación o situación de riesgo, los participantes y/o el Organizador deberán contactar inmediatamente al servicio de emergencias correspondiente al lugar donde se desarrolla la actividad y adoptar las medidas razonables que las circunstancias requieran.',
      'Las herramientas de TorneAR no sustituyen la intervención de profesionales médicos, servicios de emergencia, fuerzas de seguridad ni autoridades competentes.',
    ],
  },
  {
    title: '30. Modificaciones',
    paragraphs: [
      'Los Titulares podrán modificar estos Términos y Condiciones para reflejar cambios en la plataforma, la normativa o las prácticas aplicables. Los cambios menores podrán regir desde su publicación. Los cambios relevantes en derechos u obligaciones serán informados con antelación razonable y, cuando corresponda, se solicitará una nueva aceptación.',
    ],
  },
  {
    title: '31. Legislación aplicable y jurisdicción',
    paragraphs: [
      'Estos Términos y Condiciones se regirán e interpretarán de conformidad con las leyes de la República Argentina. Toda controversia será sometida a los tribunales que resulten competentes conforme a la legislación argentina aplicable. Cuando no resulte aplicable una norma imperativa que atribuya competencia a una jurisdicción determinada, serán competentes los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.',
    ],
  },
  {
    title: '32. Aceptación de los Términos y Política de Privacidad',
    paragraphs: [
      'Para completar el registro, el usuario deberá aceptar expresamente estos Términos y Condiciones y, una vez publicada, la Política de Privacidad vigente, mediante los mecanismos electrónicos habilitados por TorneAR. Cuando un tratamiento requiera un consentimiento específico, éste deberá recabarse en forma separada de la aceptación general de los Términos y Condiciones, cuando así lo exija la normativa aplicable.',
      'Los Titulares conservarán evidencia electrónica razonable de las aceptaciones y consentimientos que correspondan, incluyendo la versión del documento aceptado, la cuenta asociada y la fecha y hora, de acuerdo con la Política de Privacidad vigente, los plazos de conservación aplicables y la normativa correspondiente.',
      'La utilización posterior de la plataforma quedará sujeta a la versión vigente de los documentos debidamente comunicada al usuario.',
      'La versión vigente de este documento siempre está disponible en https://tornear.vercel.app/legal/tyc.',
    ],
  },
];
