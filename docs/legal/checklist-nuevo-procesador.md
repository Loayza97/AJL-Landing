# Checklist — Incorporar nuevo procesador de datos

> A correr **antes** de empezar a usar cualquier herramienta SaaS nueva que vaya
> a tratar datos personales de usuarios o pacientes.
> Base legal: Art. 12 y 13 del Reglamento DS N° 016-2024-JUS (encargados de tratamiento).

---

## Cuándo aplicar este checklist

Antes de empezar a usar **cualquier** servicio nuevo que:

- Reciba, almacene, procese o transmita datos personales (nombre, email, DNI,
  teléfono, IP, comportamiento de usuario, etc.).
- Acceda a la cuenta donde están los datos personales (ej. integraciones de
  Supabase, Notion como CRM, etc.).
- Envíe comunicaciones a usuarios en nombre del negocio (ej. email marketing,
  SMS, push, WhatsApp Business API).

Ejemplos típicos:
- Mailchimp / ConvertKit / Brevo (email marketing)
- Calendly / Cal.com (agendamiento)
- Typeform / Tally / Google Forms (formularios)
- Stripe / Mercado Pago (pagos adicionales)
- Notion / Airtable (si los usás como CRM)
- Zapier / Make (integraciones que mueven datos)
- WhatsApp Business API / Twilio (mensajería)
- Crisp / Intercom (chats en vivo)
- Hotjar / Microsoft Clarity (analytics de sesión)

Si la herramienta solo te ayuda a vos internamente sin tocar datos de usuarios
(ej. Linear, Trello para tareas internas, Figma para diseño), **no aplica**
este checklist.

---

## Checklist

### Paso 1 — Diagnóstico inicial

- [ ] ¿Qué herramienta es?
- [ ] ¿Para qué la queremos usar exactamente?
- [ ] ¿Qué datos personales va a procesar?
  - [ ] Nombre
  - [ ] Email
  - [ ] Teléfono
  - [ ] DNI
  - [ ] Dirección
  - [ ] Datos de pago
  - [ ] Datos de navegación
  - [ ] Datos de salud
  - [ ] Otros: _____________
- [ ] ¿De cuántos titulares (estimado)?
- [ ] ¿En qué país está la infraestructura del proveedor?
  - País principal de procesamiento: _____________
  - ¿Permite transferencias a EE.UU., UE, otros? _____________

### Paso 2 — Evaluación legal

- [ ] ¿El proveedor tiene **Data Processing Agreement (DPA)** estándar disponible?
  - **Sí, y lo firmaremos** → Continuar.
  - **Sí, pero requiere upgrade pago** → Evaluar si el plan free no es suficiente.
  - **No tiene DPA** → ⛔ NO usar para datos personales. Buscar alternativa.

- [ ] ¿El proveedor está en la UE o tiene certificación adecuada (ISO 27001,
      SOC 2, etc.)?
  - Sí → Bajo riesgo.
  - No → Evaluar caso por caso.

- [ ] ¿Cumple con GDPR / LGPD / o equivalente? (Casi todos los SaaS grandes sí.)
  - Sí → OK.
  - No / desconocido → Investigar más.

- [ ] Si transfiere datos a EE.UU. u otro país sin nivel adecuado: ¿hay
      cláusulas contractuales tipo (SCC) en el DPA?
  - Sí → OK.
  - No → ⛔ Requerir o no usar.

### Paso 3 — Decisión

- [ ] ¿Vamos a usarla?
  - Sí → Continuar al Paso 4.
  - No → Documentar la decisión y por qué (para futura referencia).

### Paso 4 — Setup técnico

- [ ] Crear cuenta usando `ajlnutricion@gmail.com` (cuenta corporativa, NO
      personal).
- [ ] Configurar autenticación de dos factores (2FA) en la cuenta.
- [ ] Guardar credenciales en gestor de passwords (1Password, Bitwarden, etc.).
      Nunca en notas planas o email.
- [ ] Configurar permisos al mínimo necesario (principio de mínimo privilegio).
- [ ] Si requiere API key: guardar en variables de entorno (no hardcoded en código).
- [ ] Si requiere DNS records: agregarlos en Namecheap.

### Paso 5 — Actualizar documentación legal

⚠️ **Este paso es el más fácil de olvidar y el más reclamable.**

- [ ] Actualizar `/privacidad/index.html`:
  - [ ] Agregar el nuevo procesador a la **tabla del Bloque 4** (Encargados
        del tratamiento y transferencias internacionales) con:
    - Nombre del proveedor
    - Servicio que presta
    - País de procesamiento
    - Datos involucrados
  - [ ] Si trata datos para una **finalidad nueva** (ej. marketing, retargeting,
        chat en vivo): agregar a la **tabla del Bloque 3** (Finalidades y
        base legal) con la base legal correspondiente.
  - [ ] Si recolecta cookies nuevas: agregar a la **sección 9** (Cookies y
        tecnologías de seguimiento).
  - [ ] Actualizar la fecha de "Última actualización" arriba del documento.

- [ ] Si se requiere consentimiento separado (ej. para marketing):
  - [ ] Implementar el checkbox/opt-in en el flujo correspondiente.
  - [ ] Validar en backend que el consentimiento se otorgó.
  - [ ] Persistir prueba del consentimiento (fecha, IP, contexto).

- [ ] Si el procesador maneja datos sensibles o gran volumen, agregar a la
      **sección 8** (Medidas de seguridad) si corresponde mencionarlo
      explícitamente.

### Paso 6 — Comunicar a usuarios (si es cambio sustancial)

Si el nuevo procesador implica una **finalidad nueva** que requiere
consentimiento (ej. empezás a hacer email marketing donde antes no), avisar:

- Banner en el sitio durante 7-14 días.
- Email a usuarios actuales (si los hay) explicando el cambio.

Si solo cambia un proveedor por otro de la misma finalidad (ej. migrás de Resend a SendGrid), bastará con actualizar la política.

### Paso 7 — Documentar la incorporación

Registrar internamente:
- Fecha de incorporación
- Quién aprobó
- Para qué se usa
- DPA firmado (link al documento o referencia)
- Fecha en que se actualizó la política de privacidad
- Permisos otorgados

---

## Anexo — Procesadores actuales (a 2026-05-26)

Para referencia, esta es la lista de procesadores activos hoy. Actualizar
cuando se agreguen/quiten.

| Proveedor | Servicio | País | Datos | DPA | Agregado |
|---|---|---|---|---|---|
| Vercel | Hosting y serverless functions | EE.UU. | Todos los del libro + tráfico web | Standard DPA en setup | 2026-05-22 |
| Supabase | Base de datos del libro | Brasil (São Paulo) | Datos del libro de reclamaciones | DPA estándar | 2026-05-22 |
| Resend | Envío de emails transaccionales | EE.UU. | Email + nombre + contenido reclamo | DPA estándar | 2026-05-22 |
| ImprovMX | Reenvío de correos entrantes | Francia / EE.UU. | Contenido de correos a reclamos@ | DPA estándar | 2026-05-26 |
| Culqi | Procesamiento de pagos | Perú | Datos de tarjeta (no pasan por nosotros) | DPA PCI | ya existente |
| Meta (Pixel) | Analytics y remarketing | EE.UU. / Irlanda | Cookies, eventos navegación | Standard Terms of Service | ya existente |
| Google (GA4, Fonts) | Analytics + tipografía | EE.UU. | Cookies, IP truncada | DPA estándar | ya existente |
| Google (Search Console) | SEO insights | EE.UU. | Datos agregados, no personales | DPA estándar | 2026-05-26 |
| Namecheap | Registro de dominio y DNS | EE.UU. | Datos de contacto del titular del dominio (no de usuarios) | Standard ToS | ya existente |
