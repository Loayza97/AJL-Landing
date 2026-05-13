# PRD: AJL Nutrición Landing Page

## 1. Product overview

### 1.1 Document title and version

- PRD: AJL Nutrición Landing Page
- Version: 1.0

### 1.2 Product summary

Esta es una landing page de precalificación pasiva para AJL Nutrición, una clínica de nutrición premium con base en Lima, Perú, dirigida a profesionales de 28–45 años de NSE A/B que buscan transformar su composición corporal sin restricciones alimentarias rígidas. La página tiene una función única: convertir tráfico frío y tibio proveniente de Instagram, TikTok, Meta Ads y referidos en leads calificados que llegan al WhatsApp de ventas listos para agendar una Evaluación Nutricional Personal de S/80, que es el producto de entrada del funnel.

A diferencia de un sitio web tradicional, esta landing no busca cerrar ventas ni reemplazar al asesor comercial. Tampoco incorpora un cuestionario interactivo de precalificación, ya que esa fricción ocurre upstream, en el contenido de captación (reels, stories, copies de anuncios) que filtra perfiles antes de que el lead llegue a la página. La landing complementa ese filtro previo con un filtro pasivo: contenido claro que comunica el método, criterios explícitos de "para quién sí / para quién no", y un CTA directo al WhatsApp con mensaje pre-llenado que identifica la fuente del lead vía UTM.

La hipótesis estratégica que esta versión busca validar es que precalificar al lead antes y durante la landing, sin formularios interactivos, mejora la calidad del lead que llega al asesor sin sacrificar volumen significativo. El éxito se medirá tras 60 días de tráfico estable post-lanzamiento por tasa de conversión de WhatsApp (hoy aproximadamente 3.5%) y por la calidad subjetiva del lead reportada por el asesor.

## 2. Goals

### 2.1 Business goals

- Aumentar la conversión de tráfico digital (Instagram, TikTok, Meta Ads) a leads calificados en WhatsApp.
- Validar la hipótesis de que un filtro pasivo en la landing (contenido más criterios explícitos de cliente ideal) mejora la calidad del lead sin sacrificar volumen significativo.
- Establecer la Evaluación Nutricional Personal de S/80 como producto de entrada formal del funnel.
- Generar visibilidad de la fuente del lead mediante UTMs por canal para tomar decisiones de inversión publicitaria con datos.
- Apoyar la meta de pasar de aproximadamente S/35,000/mes a S/60,000–70,000/mes en el año 1.
- Reducir tiempo del asesor con leads no calificados, aumentando capacidad efectiva sin contratar más asesores.

### 2.2 User goals

- Entender rápidamente si el método de AJL es diferente a lo que ya probó y por qué podría funcionar esta vez.
- Conocer el precio y alcance de la Evaluación de S/80 sin tener que escribir a nadie primero.
- Sentir que la clínica entiende su frustración previa (planes rígidos, rebotes, culpa) y no lo va a juzgar.
- Tener un camino claro y de bajo riesgo para empezar (S/80 que se descuentan del primer mes si contrata).
- Identificar si encaja en el perfil de cliente ideal antes de invertir tiempo en una conversación.

### 2.3 Non-goals

- No cerrar ventas de paquetes mensuales directamente en la página.
- No procesar pagos ni gestionar carrito en la v1.0.
- No reemplazar la conversación de WhatsApp con el asesor.
- No funcionar como sitio web institucional con múltiples páginas (blog, equipo, etc.).
- No captar leads sin ningún filtro: la fricción pasiva es intencional.
- No prometer resultados específicos de pérdida de peso ni usar lenguaje de "método revolucionario".
- No convencer a perfiles incompatibles (rechazo de estructura, dogmatismo alimentario, expectativa de magia).

## 3. User personas

### 3.1 Key user types

- Lead frío (tráfico de Meta Ads sin contacto previo con la marca).
- Lead tibio (tráfico orgánico reciente de Instagram/TikTok, link en bio).
- Lead caliente (seguidor antiguo o referido de un cliente actual).
- Visitante no calificado (perfil incompatible con el método: busca dietas rígidas, espera magia, rechaza estructura).
- Asesor comercial / equipo interno (recibe los leads derivados en WhatsApp con el contexto pre-llenado).

### 3.2 Basic persona details

- **Lead frío (Carla, 34, gerente de marketing)**: Llegó desde un anuncio de Meta mientras hacía scroll. No conoce a AJL ni a Alejandro. Ha probado keto, ayuno intermitente y dos nutricionistas en los últimos 3 años. Siempre rebota. Sospecha de cualquier promesa nueva, pero le llamó la atención que el anuncio no prometía bajar X kilos.
- **Lead tibio (Diego, 38, ingeniero)**: Vio dos o tres reels de AJL en las últimas semanas y entró desde el link en bio. Aún no escribe a WhatsApp porque no quiere recibir un sermón. Quiere entender el método antes de hablar con alguien. Le gusta comer fuera, usa Rappi seguido, no piensa renunciar a eso.
- **Lead caliente (Valeria, 41, abogada)**: Sigue a Alejandro desde hace meses o llegó referida por una amiga que ya es paciente. Llega con intención clara de empezar. Necesita confirmación rápida de precios y un camino directo al WhatsApp sin fricción innecesaria.
- **Visitante no calificado (Miguel, 29)**: Quiere "una dieta para bajar 10 kilos en un mes". Espera que le digan qué comer y qué no, sin involucrarse. Cree que el azúcar es veneno. Idealmente la landing lo filtra y se autodescarta al leer la sección "Para quién no".
- **Asesor comercial (Rodrigo)**: No interactúa con la landing como visitante, pero recibe el resultado: un mensaje de WhatsApp pre-llenado que identifica fuente (UTM) y permite iniciar la conversación con contexto.

### 3.3 Role-based access

- **Visitante (público general)**: Acceso total al contenido informativo y al botón de WhatsApp. No requiere registro. No deja datos persistentes salvo lo que voluntariamente envía vía el mensaje pre-llenado.
- **Administrador / equipo interno (futuro)**: En v1.0 no existe panel de admin. La edición de contenido se hace vía despliegue de código (GitHub Pages o equivalente, con futuro dominio propio). Considerado para roadmap, no requisito de v1.0.

## 4. Functional requirements

- **Hero section** (Priority: High)
  - Mostrar titular que valide la frustración previa del lead (intentos fallidos).
  - Mostrar el diferenciador estructural (estructura vida real, no planes ideales).
  - Incluir CTA primario visible above-the-fold dirigido al WhatsApp.
  - Comunicar que no se prometen kilos específicos ni resultados garantizados.
- **Sección "Por qué fallaste antes"** (Priority: High)
  - Mostrar la tabla traducción "lo que el cliente dice" vs "el problema real".
  - Validar emocionalmente sin culpar al lead.
  - Posicionar a AJL como diferente sin caer en lenguaje de gurú.
- **Sección "Cómo funciona el método"** (Priority: High)
  - Presentar los 6 pasos del método de forma visual y escaneable.
  - Destacar diferenciadores: porciones visibles, backend calórico oculto, acompañamiento continuo.
  - No usar lenguaje técnico denso.
- **Sección "Producto de entrada: Evaluación Nutricional S/80"** (Priority: High)
  - Precio visible (S/80).
  - Mensaje claro: "los S/80 se descuentan del primer mes si contratas un paquete".
  - Qué incluye: consulta 20–60 min, diagnóstico, dirección clara.
  - Para quién es / para quién no es.
  - CTA directo hacia WhatsApp.
- **Sección informativa de paquetes** (Priority: Medium)
  - Mostrar los 5 paquetes (Orientación, Impulso, Estándar, Intensivo, Premium) con precio y descripción breve.
  - Tono informativo, no transaccional: el CTA sigue siendo la Evaluación de S/80 vía WhatsApp.
  - Comunicar que los paquetes se eligen después de la evaluación.
- **Sección "Para quién sí / Para quién no"** (Priority: High, central para precalificación pasiva)
  - Criterios explícitos de cliente ideal vs no ideal.
  - Filtra sin rechazar con dureza.
  - Honesto sobre los perfiles donde el método no funciona.
  - Es el principal mecanismo de filtro de la landing: debe ser visualmente prominente.
- **CTA único hacia WhatsApp** (Priority: High)
  - Botón principal hacia WhatsApp con mensaje pre-llenado que incluye UTM de origen.
  - Múltiples ubicaciones a lo largo del scroll: hero, después del método, después de "Para quién sí/no", footer.
  - Mensaje pre-llenado natural, en primera persona del lead, editable.
- **Botón flotante de WhatsApp** (Priority: High)
  - Visible en todo el scroll de la página.
  - Mismo mensaje pre-llenado con UTM de origen.
  - Esquina inferior derecha estándar, mobile-first.
- **Prueba social / testimonios** (Priority: Medium)
  - Testimonios de pacientes reales. Contenido pendiente de selección por el equipo.
  - Pueden ser texto + foto, video corto o ambos según disponibilidad.
  - Sin promesas de kilos específicos, enfocados en cambio de relación con la comida.
- **Tracking y UTMs** (Priority: High)
  - Parámetros UTM por canal (bio Instagram, bio TikTok, ads Meta, referidos). Convención exacta pendiente.
  - Eventos de analytics: visita, scroll a sección, clic en WhatsApp (con sección de origen del clic dentro de la landing).
  - Pixel de Meta para retargeting.
- **FAQ / Objeciones comunes** (Priority: Medium)
  - Responder dudas frecuentes que hoy gastan tiempo del asesor en WhatsApp.
  - Ejemplos: ¿es presencial o virtual?, ¿qué pasa después de la evaluación?, ¿por qué los S/80 no son gratis?, ¿qué diferencia hay entre los paquetes?
- **Pie de página informativo** (Priority: Low)
  - Datos de contacto, redes sociales, link a WhatsApp.
  - Sin formulario de contacto adicional (todo va por WhatsApp).
  - Aviso legal mínimo.

## 5. User experience

### 5.1 Entry points & first-time user flow

- **Instagram (orgánico)**: Llega desde link en bio o sticker de stories. Generalmente lead tibio. UTM identifica origen `ig_bio` o `ig_stories`.
- **TikTok (orgánico)**: Llega desde link en bio. Lead frío o tibio. UTM `tt_bio`.
- **Meta Ads (pagado)**: Llega desde anuncio de Instagram/Facebook. Lead frío por definición. UTM identifica campaña específica.
- **ManyChat**: Recibe link en respuesta automática de comentarios en videos. Lead tibio. UTM `manychat`.
- **Referidos**: Link compartido por paciente actual vía WhatsApp o DM. Lead caliente. UTM `referido`.
- **Directo / desconocido**: Sin UTM, se registra como tal para no perderlo en analítica.
- **Flujo de primer uso**: aterriza en hero → recorre secciones (o salta directo al CTA si ya viene decidido vía botón flotante) → llega a la sección "Para quién sí/no" donde se autoidentifica o se autodescarta → si está convencido, hace clic en cualquier CTA hacia WhatsApp → llega a WhatsApp con mensaje pre-llenado que identifica fuente vía UTM → conversación con el asesor (fuera del scope de la landing).

### 5.2 Core experience

- **Aterrizaje en hero**: El visitante llega y en los primeros 3 segundos lee algo que reconoce su frustración previa.
  - Para que sea una buena primera experiencia: titular emocionalmente preciso, sin clickbait, con visual premium en blanco/negro/dorado que comunica seriedad sin ser clínico.
- **Comprensión del diagnóstico**: Lee la sección "por qué fallaste antes" y entiende que el problema no es su disciplina, sino el modelo restrictivo que internalizó.
  - Para que sea una buena primera experiencia: copy directo, tabla visual fácil de escanear, tono empático sin condescendencia.
- **Entendimiento del método**: Lee los 6 pasos del método AJL y comprende qué es lo estructuralmente distinto.
  - Para que sea una buena primera experiencia: pasos numerados con iconografía clara, énfasis en "porciones visibles" y "backend calórico oculto" como diferenciadores tangibles.
- **Conocimiento del producto de entrada**: Llega a la sección de Evaluación Nutricional de S/80, ve precio, entiende qué incluye y que los S/80 se descuentan del primer mes si contrata.
  - Para que sea una buena primera experiencia: precio visible sin letra chica, beneficio del descuento bien comunicado, sin sensación de "trampa comercial".
- **Autoidentificación (filtro pasivo central)**: Lee la sección "para quién sí / para quién no" y se identifica con el cliente ideal o se autodescarta sin sentirse rechazado. Este es el momento crítico de precalificación.
  - Para que sea una buena primera experiencia: criterios claros en dos columnas, lenguaje honesto, frase tipo "si te describes en la columna derecha, este método no es para ti, y está bien".
- **Resolución de dudas**: Si tiene dudas, las resuelve en la FAQ sin necesidad de escribir al asesor.
  - Para que sea una buena primera experiencia: FAQ accesible en formato acordeón que resuelve objeciones reales.
- **Decisión y derivación a WhatsApp**: Hace clic en cualquier CTA y se abre WhatsApp con mensaje pre-llenado que incluye la fuente del lead (UTM).
  - Para que sea una buena primera experiencia: transición suave (1 clic), mensaje pre-llenado natural y editable, múltiples CTAs a lo largo del scroll para que el lead pueda decidir en el momento que quiera.

### 5.3 Advanced features & edge cases

- **Lead no calificado**: No existe filtro técnico activo. El lead se autodescarta al leer la sección "Para quién no" o el copy honesto del resto de la página. Si aun así escribe a WhatsApp, el asesor lo descarta en conversación (más rápido que antes porque ya leyó contenido que lo prepara).
- **Visitante que no scrollea más allá del hero**: Existe CTA hacia WhatsApp en el hero mismo y botón flotante visible para que el lead pueda escribir aunque no haya consumido todo el contenido.
- **Tráfico sin UTM (directo / desconocido)**: Se registra como tal y aparece en el mensaje de WhatsApp como "origen: directo" para que el asesor pueda preguntar manualmente.
- **Lead caliente (referido / seguidor antiguo)**: Probablemente salta secciones informativas y va directo al CTA. La landing permite ese atajo: botón flotante visible siempre, CTA visible en hero.
- **Visitante en móvil con conexión lenta**: Lighthouse >85 mobile, imágenes optimizadas, sin scripts pesados innecesarios.
- **Visitante fuera de horario de atención del asesor**: WhatsApp Business permite mensaje automático de "fuera de horario". Es configuración de WhatsApp, no de la landing.
- **Visitante que comparte el link**: Meta-share (Open Graph) configurado con título, descripción e imagen que mantengan el tono premium-bold de la marca.

### 5.4 UI/UX highlights

- Paleta dominante blanco/negro con dorado como acento (negro #000000, blanco #ffffff, gris claro #efefef, dorado aproximado #D4A843).
- Tipografía Gilroy Bold/ExtraBold para títulos, con fallback web a Montserrat 700/800 o Poppins 700/800.
- Estilo premium-bold, no clínico ni improvisado. Espaciado generoso, jerarquía tipográfica fuerte, sin sensación de plantilla genérica.
- Mobile-first. La mayoría del tráfico viene de Instagram y TikTok en móvil.
- Botón flotante de WhatsApp siempre visible en esquina inferior derecha.
- Hero section impactante con titular grande, sin imagen genérica de stock. Idealmente foto de Alejandro o de consulta real (a definir con el equipo).
- Microinteracciones suaves en CTAs y transiciones para reforzar sensación premium.
- Sin pop-ups intrusivos de "suscríbete a la newsletter" o similares.
- Accesibilidad básica: contraste suficiente, tamaños de fuente legibles, navegación por teclado funcional.

## 6. Narrative

Diego es un ingeniero de 38 años que ha intentado bajar grasa corporal durante los últimos tres años sin éxito sostenible. Probó keto, una app de conteo de calorías y dos nutricionistas distintos, y cada vez terminó en el mismo ciclo: tres meses de disciplina forzada, abandono, culpa y recuperación del peso perdido. Está cansado de planes que ignoran que almuerza fuera cuatro veces por semana y que no piensa renunciar a la cerveza con amigos los viernes. Lleva semanas viendo reels de AJL Nutrición en Instagram y le llama la atención que el discurso no le promete bajar diez kilos en treinta días, sino algo que nunca le habían ofrecido: estructurar su vida real, no la vida ideal de otro. Entra a la landing desde el link en bio y, por primera vez, lee un titular que reconoce su frustración previa sin culparlo. Recorre el método de seis pasos, entiende qué es la Evaluación Nutricional de S/80, lee con honestidad la sección "para quién es y para quién no", y al identificarse claramente como cliente ideal, hace clic en el botón de WhatsApp con la sensación de que esta vez sí podría funcionar, porque por fin alguien le habló de cómo comer en su vida, no en una vida que no tiene.

## 7. Success metrics

### 7.1 User-centric metrics

- **Tasa de clic en CTA WhatsApp**: % de visitantes que hacen clic en algún CTA hacia WhatsApp. Objetivo inicial: >15% del total de visitantes.
- **Tiempo en página**: Promedio de tiempo de sesión. Objetivo de referencia: 60–120 segundos.
- **Tasa de scroll profundo**: % de visitantes que llegan al menos a la sección "Cómo funciona el método". Objetivo inicial: >50%.
- **Tasa de scroll hasta "Para quién sí/no"**: % que llega a la sección de autoidentificación. Objetivo inicial: >40%. Métrica clave porque esta sección es el principal filtro pasivo.
- **Tasa de rebote en hero**: % que sale sin scroll. Objetivo inicial: <50%.
- **Distribución de clics en CTA por sección**: Qué sección dispara más clics a WhatsApp (hero, después del método, después de "Para quién sí/no", footer, botón flotante). Permite ajustar prioridad de contenido.
- **Satisfacción cualitativa del lead al llegar a WhatsApp**: Feedback subjetivo del asesor sobre si los leads llegan más informados que antes.

### 7.2 Business metrics

- **Calidad del lead (métrica principal de la hipótesis)**: % de conversaciones de WhatsApp con leads provenientes de la landing que terminan agendando Evaluación de S/80. Objetivo inicial: >25%, vs aproximadamente 3.5% actual de conversión global de WhatsApp.
- **Volumen de evaluaciones de S/80 agendadas/mes** provenientes de la landing. Objetivo inicial: 65 evaluaciones/mes en escenario favorable.
- **Conversión Evaluación de S/80 → paquete contratado**: % de quienes agendan evaluación y terminan contratando algún paquete. Objetivo inicial: ~30%.
- **Ingresos adicionales atribuibles a la landing**: Aporte mensual proyectado de ~S/11,600/mes en escenario favorable.
- **Costo de adquisición por lead calificado (CPA calificado)**: Inversión en Meta Ads / nº de leads calificados que llegaron al WhatsApp.
- **Distribución de origen del lead (por UTM)**: % de leads por canal (Instagram bio, TikTok bio, Meta Ads, ManyChat, referidos). Permite decidir dónde invertir.
- **Tasa de leads no calificados que llegan al asesor**: % de conversaciones de WhatsApp que el asesor descarta rápidamente. Objetivo: reducir esta tasa vs el baseline actual.
- **Ventana de medición**: 60 días de tráfico estable post-lanzamiento como mínimo para evaluación de hipótesis.

### 7.3 Technical metrics

- Lighthouse Performance (mobile): objetivo >85.
- Lighthouse Accessibility: objetivo >90.
- Lighthouse SEO: objetivo >90.
- Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1.
- Uptime: >99.5% mensual.
- Tiempo de carga inicial en 3G: <4 segundos.
- Tasa de errores JS en producción: <0.5% de sesiones con error capturado.
- Cobertura de tracking: 100% de eventos clave registrados correctamente en analytics.

## 8. Technical considerations

### 8.1 Integration points

- **WhatsApp vía link directo `wa.me`**: La landing genera un enlace tipo `https://wa.me/<número>?text=<mensaje pre-llenado>` que abre WhatsApp con el contexto del lead. No requiere integración de API completa en v1.0.
- **Meta Pixel**: Para tracking de conversiones de Meta Ads y retargeting. Requiere ID de pixel del negocio.
- **Google Analytics 4 o alternativa (Plausible / Umami)**: Para eventos custom (visita, scroll, clic WhatsApp con sección de origen). Decisión exacta pendiente del equipo.
- **TikTok Pixel**: Opcional si se decide invertir en TikTok Ads a futuro. No crítico para v1.0.
- **UTM parameters**: Convención por canal. Convención exacta pendiente de definición.
- **Hosting**: Sitio estático. Recomendación principal: implementación en Astro desplegada en Vercel, Netlify, Cloudflare Pages o GitHub Pages.
- **Sin integración con CRM en v1.0**: Toda la información del lead viaja en el mensaje pre-llenado de WhatsApp.

### 8.2 Data storage & privacy

- No se almacenan datos personales del visitante en v1.0. No hay formularios de captura: nombre, correo y teléfono solo viajan vía el mensaje pre-llenado de WhatsApp.
- Analytics agregados, no individuales.
- Cookies técnicas de analytics. Si se usa GA4, evaluar si se requiere banner de consentimiento según legislación peruana (Ley 29733). Consulta legal pendiente.
- Política de privacidad: documento corto enlazado desde el footer. Marcado como ítem de roadmap; en v1.0 puede usarse un placeholder si el equipo legal aún no provee texto.
- No aplica GDPR formalmente (negocio opera en Perú), pero se siguen buenas prácticas equivalentes.
- HTTPS obligatorio para todo el tráfico y assets.

### 8.3 Scalability & performance

- Sitio estático: escalabilidad prácticamente infinita para el volumen esperado.
- CDN incluido por defecto en hosting moderno.
- Optimización de assets: imágenes en formato WebP o AVIF, lazy loading, sprites SVG para iconos.
- JS mínimo: la landing puede implementarse con Astro y JS muy ligero en cliente.
- No requiere base de datos en v1.0.
- Sin lógica server-side compleja: toda la lógica del mensaje pre-llenado de WhatsApp corre en el cliente.
- Capacidad de la landing >> capacidad operativa del equipo. El cuello de botella siempre será el asesor humano (~120 citas/semana).

### 8.4 Potential challenges

- **Hipótesis no validada**: El supuesto central (filtro pasivo + filtro upstream en contenido = mejor calidad de lead) puede no cumplirse. Mitigación: ventana de 60 días y métricas claras permiten decisión basada en datos.
- **Precalificación pasiva depende del filtro upstream**: Como la landing no filtra activamente, la calidad final del lead depende fuertemente de qué tan bien filtran reels, stories y copies de anuncios. Mitigación: coordinación estrecha con el equipo de contenido para alinear mensajes de captación con los criterios de cliente ideal.
- **Mensaje pre-llenado de WhatsApp percibido como spam**: Si el mensaje es muy largo o robótico, el lead lo borra y escribe algo genérico. Mitigación: mensaje corto, natural, en primera persona del lead, editable.
- **Volumen de tráfico insuficiente para datos significativos**: Si el tráfico no aumenta, los 60 días pueden ser insuficientes. Mitigación: extender ventana o priorizar inversión en tráfico durante el período de medición.
- **Conflicto entre informar y precalificar pasivamente**: Sin quiz, todo el peso del filtro recae en el contenido. Demasiada información aburre al lead caliente; muy poca no filtra al lead no calificado. Mitigación: jerarquía visual clara, sección "Para quién sí/no" prominente, botón flotante de WhatsApp siempre visible para atajos.
- **Resistencia interna del asesor al nuevo flujo**: Si Rodrigo no usa el UTM del mensaje pre-llenado para contextualizar, parte del valor se pierde. Mitigación: capacitación corta sobre cómo leer UTMs.
- **Mantenimiento del contenido sin panel admin**: Cualquier cambio de copy, precio o testimonio requiere despliegue de código. Aceptable en v1.0.
- **Tipografía Gilroy**: Es una fuente de pago. Si no hay licencia web, usar fallback (Montserrat o Poppins en Google Fonts) desde el inicio.
- **Tracking incompleto post-lanzamiento**: Si UTMs no se configuran correctamente en cada canal, se pierde visibilidad. Mitigación: checklist + auditoría manual en semana 1.

## 9. Milestones & sequencing

### 9.1 Project estimate

- Pequeño: 2–4 semanas de trabajo de extremo a extremo, contando desde definición final de copy y assets hasta despliegue en producción con tracking funcional.

### 9.2 Team size & composition

- Equipo pequeño: 2 a 4 personas total.
  - 1 Product Manager / Owner (puede ser Alejandro o quien lidere la iniciativa internamente).
  - 1 Diseñador UI/UX, diseña en Figma según identidad de marca premium-bold.
  - 1 Desarrollador frontend, implementa en Astro, configura analytics y despliega.
  - 1 Asesor comercial (Rodrigo) en rol consultivo, valida que el contexto pre-llenado del WhatsApp sea útil para su trabajo.

### 9.3 Suggested phases

- **Fase 1**: Definición y diseño (1 semana).
  - Entregables clave: documento de copy final por sección (hero, método, evaluación, paquetes, FAQ, "para quién sí/no"), decisión de testimonios a incluir, definición de convención UTM por canal, diseño en Figma de todas las secciones (mobile y desktop), aprobación de stakeholders.
- **Fase 2**: Implementación técnica (1–1.5 semanas).
  - Entregables clave: setup del proyecto Astro, implementación de todas las secciones estáticas, CTA hacia WhatsApp con construcción del mensaje pre-llenado vía UTM client-side, integración de Meta Pixel y GA4 (o alternativa), eventos custom de tracking (visita, scroll por sección, clic en WhatsApp con sección de origen), botón flotante de WhatsApp, optimización de performance (WebP, lazy loading, Lighthouse >85 mobile), cookie banner mínimo si la consulta legal lo confirma, Open Graph tags. Landing funcional en staging con tracking validado.
- **Fase 3**: Testing, ajustes y despliegue (0.5 semana).
  - Entregables clave: testing manual en dispositivos reales (iPhone, Android, navegadores principales), validación del mensaje pre-llenado de WhatsApp con todos los UTMs posibles, verificación de eventos de analytics, ajustes finales de copy y diseño según feedback, despliegue en producción, capacitación corta a Rodrigo sobre cómo interpretar UTMs en el mensaje recibido. Landing en producción con dashboard de analytics configurado.
- **Fase 4**: Medición y validación de hipótesis (60 días post-lanzamiento).
  - Entregables clave: monitoreo de métricas, ajustes menores de copy según comportamiento real, reporte de resultados al final de la ventana de 60 días, decisión documentada sobre próximos pasos (continuar, pivotar, o iterar a v1.1 reintroduciendo eventualmente un quiz si los datos sugieren que el filtro pasivo no fue suficiente).

## 10. User stories

### 10.1. Aterrizar en la landing desde tráfico orgánico de Instagram

- **ID**: US-001
- **Description**: Como lead tibio que llega desde el link en bio de Instagram, quiero aterrizar en una landing que cargue rápido y comunique de inmediato de qué se trata, para decidir en pocos segundos si me interesa seguir leyendo.
- **Acceptance criteria**:
  - El parámetro `utm_source=ig` y `utm_medium=bio` se registran correctamente en analytics.
  - La página alcanza Largest Contentful Paint <2.5s en conexión 4G.
  - El titular del hero es visible above-the-fold sin scroll en pantallas mobile estándar (375px de ancho).
  - El botón flotante de WhatsApp aparece en la esquina inferior derecha en menos de 2 segundos desde la carga.

### 10.2. Aterrizar en la landing desde Meta Ads

- **ID**: US-002
- **Description**: Como lead frío que llega desde un anuncio de Meta, quiero ver inmediatamente un mensaje que reconozca mi frustración previa, para no sentir que es otro anuncio genérico de pérdida de peso.
- **Acceptance criteria**:
  - Los parámetros UTM de la campaña (`utm_source=meta`, `utm_medium=ads`, `utm_campaign=<nombre>`) se registran en analytics y se incluyen en el mensaje pre-llenado de WhatsApp.
  - El Meta Pixel registra el evento de PageView correctamente.
  - El titular del hero contiene una validación explícita de intentos previos fallidos.

### 10.3. Aterrizar en la landing desde TikTok

- **ID**: US-003
- **Description**: Como lead frío o tibio que llega desde TikTok, quiero que la landing se vea perfecta en mobile, ya que ese es mi único canal de acceso.
- **Acceptance criteria**:
  - UTM `utm_source=tt&utm_medium=bio` se registra correctamente.
  - Todos los elementos son tap-friendly (área mínima de 44x44px).
  - El layout no requiere scroll horizontal en ninguna pantalla mobile estándar.

### 10.4. Aterrizar desde ManyChat tras comentar un video

- **ID**: US-004
- **Description**: Como lead que comentó un video y recibió el link automáticamente vía ManyChat, quiero que la landing reconozca que vengo desde ahí.
- **Acceptance criteria**:
  - UTM `utm_source=manychat` se registra y aparece en el mensaje pre-llenado de WhatsApp.

### 10.5. Aterrizar como referido de un cliente actual

- **ID**: US-005
- **Description**: Como lead caliente referido por un paciente actual vía link compartido, quiero llegar a una landing que me permita ir directo al WhatsApp sin tener que recorrer toda la información si ya estoy decidido.
- **Acceptance criteria**:
  - UTM `utm_source=referido` se registra.
  - El botón flotante de WhatsApp está disponible desde el primer segundo de carga.
  - El CTA del hero también permite saltar directo a WhatsApp.

### 10.6. Aterrizar sin UTM (tráfico directo o desconocido)

- **ID**: US-006
- **Description**: Como visitante cuyo origen no se identifica vía UTM, quiero que el sistema registre mi visita igualmente y derive correctamente al asesor.
- **Acceptance criteria**:
  - El sistema registra el visitante como "origen: directo" en analytics y en el mensaje pre-llenado de WhatsApp.
  - El flujo funciona idéntico al de un visitante con UTM, sin errores.

### 10.7. Leer la sección de validación de frustración previa

- **ID**: US-007
- **Description**: Como visitante que ha probado dietas y nutricionistas sin éxito, quiero leer una sección que reconozca por qué los intentos previos fallaron, para sentirme entendido y no culpado.
- **Acceptance criteria**:
  - La sección "Por qué fallaste antes" está visible al hacer scroll desde el hero.
  - Contiene la tabla "lo que el cliente dice" vs "el problema real".
  - El copy nunca usa lenguaje de culpa hacia el lead.

### 10.8. Comprender el método de los 6 pasos

- **ID**: US-008
- **Description**: Como visitante interesado en saber qué hace AJL diferente, quiero entender los 6 pasos del método de forma visual y escaneable.
- **Acceptance criteria**:
  - Los 6 pasos están presentes y numerados en una sección dedicada.
  - Cada paso destaca su diferenciador (especialmente "porciones visibles" y "backend calórico oculto").
  - La sección es legible en mobile sin scroll horizontal.

### 10.9. Conocer la Evaluación Nutricional Personal de S/80

- **ID**: US-009
- **Description**: Como visitante, quiero ver claramente qué es la Evaluación Nutricional Personal, cuánto cuesta, qué incluye y qué pasa después.
- **Acceptance criteria**:
  - El precio S/80 está visible sin necesidad de hover ni click.
  - Se comunica que los S/80 se descuentan del primer mes si el lead contrata un paquete.
  - Se especifica duración (20–60 min) y que incluye diagnóstico + dirección clara.

### 10.10. Ver el portafolio de paquetes de forma informativa

- **ID**: US-010
- **Description**: Como visitante, quiero ver los paquetes disponibles (Orientación, Impulso, Estándar, Intensivo, Premium) con sus precios y descripciones, para entender el ecosistema completo del servicio.
- **Acceptance criteria**:
  - Los 5 paquetes están presentes con nombre, precio mensual y descripción breve.
  - El CTA de la sección dirige al WhatsApp con mensaje pre-llenado, no a una compra directa.
  - Se comunica que los paquetes se eligen después de la Evaluación de S/80.

### 10.11. Autoidentificarme como cliente ideal o no ideal (filtro pasivo central)

- **ID**: US-011
- **Description**: Como visitante, quiero leer criterios claros sobre para quién sí y para quién no es este método, para decidir honestamente si encajo y autodescartarme si no es para mí.
- **Acceptance criteria**:
  - Existe una sección con dos columnas: "Para ti si..." y "No es para ti si...".
  - El tono filtra sin rechazar con dureza.
  - La sección es visualmente prominente (no escondida al final de la página).
  - El evento "scroll_para_quien" se registra en analytics cuando el visitante llega a esta sección.

### 10.12. Resolver dudas comunes vía FAQ

- **ID**: US-012
- **Description**: Como visitante con dudas específicas, quiero resolverlas en la misma página sin tener que escribir al asesor.
- **Acceptance criteria**:
  - Existe una sección FAQ con preguntas comunes en formato acordeón.
  - Cada respuesta es concisa (máximo 3 oraciones).
  - La FAQ es accesible (navegable por teclado, abre/cierra correctamente).

### 10.13. Hacer clic en CTA hacia WhatsApp desde cualquier sección

- **ID**: US-013
- **Description**: Como visitante decidido a contactar al asesor, quiero poder hacerlo desde múltiples puntos de la landing sin tener que volver al inicio.
- **Acceptance criteria**:
  - Existen CTAs hacia WhatsApp en al menos: hero, después del método, después de la sección "Para quién sí/no", y footer.
  - Cada CTA abre WhatsApp con el mismo mensaje pre-llenado (UTM + texto natural del lead).
  - El evento "whatsapp_click" se registra con la sección de origen del clic dentro de la landing.

### 10.14. Usar el botón flotante de WhatsApp en cualquier momento

- **ID**: US-014
- **Description**: Como lead caliente o decidido, quiero un acceso siempre visible al WhatsApp sin importar dónde estoy en el scroll.
- **Acceptance criteria**:
  - El botón flotante está visible durante todo el scroll de la página.
  - Al hacer clic, abre WhatsApp con el mensaje pre-llenado (UTM de origen incluido).
  - El evento "whatsapp_click_floating" se registra en analytics.

### 10.15. Compartir el link de la landing en redes sociales

- **ID**: US-015
- **Description**: Como visitante que quiere compartir la landing con un amigo, quiero que el preview de redes sociales se vea profesional y alineado con la marca.
- **Acceptance criteria**:
  - Las etiquetas Open Graph (`og:title`, `og:description`, `og:image`) están configuradas.
  - La imagen de Open Graph es de alta calidad y refleja la identidad premium-bold de la marca.
  - El preview se renderiza correctamente en WhatsApp, Facebook, Instagram (DM) y X/Twitter.

### 10.16. Cargar la landing en conexiones móviles lentas

- **ID**: US-016
- **Description**: Como visitante con conexión 3G o 4G débil, quiero que la landing cargue en un tiempo razonable.
- **Acceptance criteria**:
  - El First Contentful Paint en 3G simulado es menor a 4 segundos.
  - Las imágenes usan formato WebP o AVIF con lazy loading.
  - Lighthouse Performance >85 en mobile.

### 10.17. Acceder a la landing con HTTPS garantizado

- **ID**: US-017
- **Description**: Como visitante, quiero que la landing se sirva siempre por HTTPS, garantizando integridad del contenido y del tracking aunque no haya autenticación de usuario.
- **Acceptance criteria**:
  - Todo el tráfico HTTP redirige a HTTPS automáticamente.
  - El certificado SSL es válido y no genera warnings en navegadores modernos.
  - Los assets (imágenes, fuentes, scripts) se cargan también por HTTPS para evitar mixed content.

### 10.18. Recibir leads como asesor con UTM de origen pre-llenado

- **ID**: US-018
- **Description**: Como asesor comercial (Rodrigo), quiero recibir cada lead en WhatsApp con un mensaje pre-llenado que incluya su fuente de origen vía UTM, para iniciar la conversación sabiendo de qué canal viene y ajustar mi abordaje.
- **Acceptance criteria**:
  - El mensaje pre-llenado se construye correctamente en todos los caminos: CTAs de sección y botón flotante.
  - El mensaje contiene UTM de origen siempre que esté disponible; si no, indica "origen: directo".
  - El mensaje es editable por el lead antes de enviar (abre WhatsApp normalmente).
  - El texto del mensaje es natural y corto, en primera persona del lead.
