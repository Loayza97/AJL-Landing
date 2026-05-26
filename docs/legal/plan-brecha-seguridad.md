# Plan de respuesta a brechas de seguridad

> Qué hacer si se detecta una brecha de seguridad en los datos personales tratados.
> **Plazo legal de notificación: 48 horas** a la ANPDP desde que se tomó conocimiento.
> Base legal: Reglamento DS N° 016-2024-JUS.

---

## Qué cuenta como "brecha de seguridad"

Cualquier evento que comprometa la **confidencialidad**, **integridad** o **disponibilidad**
de datos personales. Por ejemplo:

- Notificación oficial de Supabase, Resend, Vercel o ImprovMX informando un
  incidente de seguridad que pudo afectar tu cuenta.
- Acceso no autorizado a la cuenta de `ajlnutricion@gmail.com` (compromiso de
  credenciales).
- Exposición pública accidental de la tabla `reclamos` (ej. RLS desactivado
  por error).
- Pérdida o robo de dispositivo con acceso a sistemas con datos personales.
- Email enviado a la persona equivocada con datos personales adjuntos.
- Hallazgo de filtración de datos en foros, dark web o redes sociales.

**Importante:** El plazo de 48 horas empieza desde que **tomás conocimiento**, no
desde que ocurrió. Si Supabase reporta un incidente el lunes y vos te enterás el
miércoles, las 48 horas empiezan el miércoles.

---

## Paso 1 — Triage (primeras 4 horas)

Antes de notificar, determinar si efectivamente es una brecha:

| Pregunta | Si la respuesta es... |
|---|---|
| ¿Hubo acceso, divulgación, alteración o destrucción de datos? | **No** → No es brecha, registrar y cerrar. **Sí** → Continuar. |
| ¿Los datos afectados son personales (no anonimizados)? | **No** → No es brecha de Ley 29733, evaluar otros impactos. **Sí** → Continuar. |
| ¿Hay riesgo para los derechos de los titulares? | **No** → Notificar igual (la ley exige). **Sí** → Notificación urgente. |
| ¿Cuántos titulares pueden estar afectados? | Estimar (10? 100? 1000?). |

Documentar el triage en una nota interna con fecha y hora.

---

## Paso 2 — Contención (primeras 12 horas)

Antes de notificar, hacer lo que esté al alcance para contener el daño:

- **Si es compromiso de credenciales** → cambiar passwords inmediatamente
  (Supabase, Resend, Vercel, ImprovMX, Google Workspace si aplica).
- **Si es RLS desactivado** → re-activar inmediatamente.
- **Si es email enviado por error** → solicitar al destinatario que lo borre y
  confirme eliminación.
- **Si es filtración pública** → reportar el contenido para que la plataforma
  lo baje (formularios de reporte de Google, Twitter/X, etc.).
- **Documentar** todas las acciones tomadas, con timestamp.

---

## Paso 3 — Notificación a la ANPDP (dentro de 48 horas)

### A quién

Autoridad Nacional de Protección de Datos Personales (ANPDP), Ministerio de
Justicia y Derechos Humanos del Perú.

### Cómo

- **Email**: consultas a través de los canales oficiales del MINJUS / ANPDP
  (https://www.gob.pe/minjus). Buscar el formulario o correo de "Comunicación
  de incidentes de seguridad" en su portal.
- **Mesa de partes virtual** del MINJUS si el formulario electrónico no está
  disponible.

> ⚠️ **Verificar el canal oficial vigente al momento del incidente.** Estos
> portales cambian de URL con el tiempo. Si no encontrás el formulario, llamar
> al MINJUS o consultar la página de la ANPDP para confirmar el canal vigente.

### Qué incluir en la comunicación

```
Asunto: Comunicación de incidente de seguridad — FJ INVESTMENTS S.A.C.

A la Autoridad Nacional de Protección de Datos Personales:

Conforme al Reglamento de la Ley N° 29733 (DS N° 016-2024-JUS), comunicamos
el siguiente incidente de seguridad:

1. IDENTIFICACIÓN DEL RESPONSABLE
   - Razón social: FJ INVESTMENTS S.A.C.
   - RUC: 20609894963
   - Nombre comercial: AJL Nutrición
   - Domicilio: Av. Almirante Manuel Villavicencio 1461, Lince, Lima
   - Contacto: reclamos@ajlnutricion.com

2. DESCRIPCIÓN DEL INCIDENTE
   - Fecha y hora estimada del incidente: [FECHA/HORA]
   - Fecha y hora en que se tomó conocimiento: [FECHA/HORA]
   - Descripción de los hechos: [QUÉ PASÓ, BREVE]
   - Causa raíz (si se conoce): [EJ. ACCESO NO AUTORIZADO POR CREDENCIALES
     COMPROMETIDAS, FALLA EN CONFIGURACIÓN DE BASE DE DATOS, ETC.]

3. DATOS AFECTADOS
   - Tipo de datos: [EJ. NOMBRE, DNI, EMAIL, TELÉFONO, CONTENIDO DE RECLAMOS]
   - Categorías sensibles incluidas: [SÍ/NO, ESPECIFICAR]
   - Número estimado de titulares afectados: [CANTIDAD]

4. CONSECUENCIAS POTENCIALES PARA LOS TITULARES
   [EJ. POSIBLE USO INDEBIDO DE DATOS, RIESGO DE PHISHING, ETC.]

5. MEDIDAS ADOPTADAS
   - Contención: [QUÉ SE HIZO]
   - Investigación: [QUÉ SE INVESTIGA]
   - Comunicación a titulares: [SÍ/NO, CUÁNDO]
   - Medidas para evitar recurrencia: [QUÉ SE IMPLEMENTARÁ]

6. CONTACTO PARA SEGUIMIENTO
   - Nombre: [NOMBRE_RESPONSABLE]
   - Email: reclamos@ajlnutricion.com
   - Teléfono: +51 919 151 237

Quedamos atentos a cualquier requerimiento adicional.

[NOMBRE_RESPONSABLE]
Representante de FJ INVESTMENTS S.A.C.
```

---

## Paso 4 — Notificación a titulares afectados (si aplica)

El reglamento exige notificación a titulares si la brecha **presenta alto riesgo**
para sus derechos. En caso de duda, **notificar** (mejor sobrar que faltar).

### Cuándo notificar

- Datos sensibles expuestos (salud, finanzas, etc.).
- Riesgo de suplantación de identidad.
- Riesgo de pérdida financiera.
- Daño reputacional probable.

### Cuándo NO es estrictamente obligatorio (pero igual recomendable)

- Brecha de bajo impacto (datos no sensibles, sin riesgo concreto).
- Datos cifrados que no fueron descifrados.

### Plantilla de notificación a titulares

```
Asunto: Información importante sobre tus datos personales en AJL Nutrición

Hola,

Te escribimos para informarte sobre un incidente de seguridad que pudo
afectar tus datos personales en nuestra plataforma.

QUÉ PASÓ
[DESCRIPCIÓN BREVE Y CLARA, SIN TECNICISMOS]

QUÉ DATOS PUDIERON ESTAR AFECTADOS
[LISTA ESPECÍFICA]

QUÉ HEMOS HECHO
[ACCIONES DE CONTENCIÓN]

QUÉ TE RECOMENDAMOS HACER
[EJ. CAMBIAR PASSWORD SI USAS EL MISMO EN OTROS LADOS, ESTAR ATENTO A
INTENTOS DE PHISHING, ETC.]

CONTACTO
Si tenés consultas o querés ejercer tu derecho de acceso/rectificación/
cancelación, escribinos a reclamos@ajlnutricion.com.

Lamentamos sinceramente este inconveniente y nos comprometemos a seguir
mejorando nuestras medidas de seguridad.

[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

---

## Paso 5 — Documentación interna del incidente

Independientemente del tamaño de la brecha, dejar registro interno con:

- ID interno del incidente (ej. `INC-2026-001`)
- Fecha y hora del incidente
- Fecha y hora de descubrimiento
- Descripción técnica detallada
- Personas involucradas (interno y externo)
- Sistemas afectados
- Datos afectados (tipos, cantidad)
- Comunicaciones enviadas (ANPDP, titulares, terceros)
- Acciones correctivas implementadas
- Lecciones aprendidas

Conservar este registro al menos 5 años. Es prueba de cumplimiento ante
auditorías o fiscalizaciones futuras.

---

## Anexo — Contactos de proveedores en caso de incidente

| Proveedor | Status page | Contacto soporte |
|---|---|---|
| Vercel | https://www.vercel-status.com | support@vercel.com |
| Supabase | https://status.supabase.com | support@supabase.io |
| Resend | https://status.resend.com | support@resend.com |
| ImprovMX | https://improvmx.statuspage.io | support@improvmx.com |
| Namecheap | https://status.namecheap.com | support@namecheap.com (chat 24/7) |

Suscribirse a las status pages para enterarse rápido de incidentes que afecten a estos proveedores.
