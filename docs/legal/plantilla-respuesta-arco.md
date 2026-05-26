# Plantilla — Respuesta a solicitudes ARCO

> Para responder solicitudes de derechos del titular según Ley N° 29733 y DS N° 016-2024-JUS.
> **Plazo legal: 10 días hábiles** desde la recepción de la solicitud completa.

---

## Paso 1 — Identificar el tipo de solicitud

Cuando llega un correo a `reclamos@ajlnutricion.com` que menciona privacidad,
identificar cuál de los 6 derechos del titular está ejerciendo:

| Derecho | Frases típicas |
|---|---|
| **Acceso** | "qué datos tienen de mí", "envíenme una copia de mis datos", "quiero saber qué información manejan" |
| **Rectificación** | "mi DNI está mal", "corrijan mi email", "cambien mi domicilio" |
| **Cancelación / Supresión** | "borren mis datos", "elimínenme de su base", "no quiero estar más en su sistema" |
| **Oposición** | "no quiero que usen mis datos para X", "dejen de procesarme para Y" |
| **Portabilidad** | "envíen mis datos en formato descargable", "transfieran mis datos a otra empresa" |
| **Olvido** | "borren todo rastro de mí", "elimínenme completamente" (similar a cancelación, pero más amplio) |

## Paso 2 — Verificar identidad del solicitante

**Crítico:** Antes de actuar, confirmar que la persona es quien dice ser.
Sin verificación, no responder con datos personales.

Pedirle al solicitante:
- Nombre completo
- DNI o CE
- Foto/copia de su DNI o CE (no es invasivo — la Ley lo permite y lo exige)
- Email desde el que envió la solicitud (verificar que coincida con el de los datos)

**Si la solicitud llega incompleta** (ej. solo dice "borren mis datos" sin DNI),
responder pidiendo los faltantes. El plazo de 10 días empieza desde que la
solicitud está completa, no desde el primer correo.

## Paso 3 — Ejecutar la solicitud

### Acceso

1. Buscar en Supabase (`SELECT * FROM reclamos WHERE consumidor_dni = '...';`)
2. Exportar el resultado a un PDF o documento legible.
3. Responder con la plantilla #1 (abajo) + adjuntar.

### Rectificación

1. Confirmar el cambio que pide (que indique exactamente qué dato a qué valor).
2. Ejecutar el UPDATE en Supabase.
3. Responder con la plantilla #2.

### Cancelación / Olvido

1. Verificar si hay obligación legal de conservar (en este caso, **no**:
   los reclamos del Libro deben conservarse 3 años para fiscalización INDECOPI,
   PERO el titular puede solicitar supresión y la respuesta es: "podemos
   anonimizar los datos identificables pero conservar el registro del reclamo
   por obligación legal hasta los 3 años").
2. Ejecutar el UPDATE para anonimizar:
   ```sql
   UPDATE reclamos
   SET consumidor_nombre = '[BORRADO POR SOLICITUD ARCO]',
       consumidor_dni = '[BORRADO]',
       consumidor_email = '[BORRADO]',
       consumidor_telefono = NULL,
       consumidor_domicilio = NULL,
       apoderado_nombre = NULL
   WHERE correlativo = 'AJL-XXXX-XXXX';
   ```
3. Responder con plantilla #3.

### Oposición

1. Identificar a qué tratamiento se opone (marketing, analytics, etc.).
2. Implementar la oposición (ej. quitar del Mailchimp, no usar para campañas).
3. Responder con plantilla #4.

### Portabilidad

1. Exportar datos del titular en formato JSON o CSV.
2. Responder con plantilla #5 + adjuntar.

## Paso 4 — Documentar

Guardar registro de cada solicitud ARCO atendida:
- Fecha de recepción
- Fecha de respuesta
- Tipo de derecho ejercido
- Identidad del solicitante (correlativo del reclamo asociado si lo hay)
- Acción tomada

Esto es prueba ante una eventual fiscalización de la ANPDP.

---

## Plantillas de respuesta

### Plantilla #1 — Acceso

```
Asunto: Respuesta a tu solicitud de acceso a datos personales

Hola [NOMBRE],

Confirmamos la recepción de tu solicitud de acceso a tus datos personales,
enviada el [FECHA].

Adjunto a este correo encontrarás un documento con la totalidad de los datos
que tratamos sobre ti, junto con información de las finalidades, base legal y
plazo de conservación.

Si tienes consultas adicionales, responde a este correo y te atendemos.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

### Plantilla #2 — Rectificación

```
Asunto: Confirmación de rectificación de datos

Hola [NOMBRE],

Confirmamos que hemos rectificado los siguientes datos en nuestros registros,
según tu solicitud del [FECHA]:

  [DATO]: [VALOR ANTERIOR] → [VALOR NUEVO]

Si detectas algún otro error o quieres ejercer otro derecho, escríbenos
a reclamos@ajlnutricion.com.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

### Plantilla #3 — Cancelación / Supresión

```
Asunto: Confirmación de supresión de datos personales

Hola [NOMBRE],

Confirmamos que hemos suprimido tus datos identificables de nuestros sistemas,
conforme a tu solicitud del [FECHA] y al derecho que te otorga la Ley N° 29733.

Por obligación legal (Ley N° 29571, Código del Consumidor), debemos conservar
el registro del reclamo asociado por un período de 3 años, pero todos los datos
que te identifiquen personalmente han sido eliminados o anonimizados.

A partir de hoy, no recibirás más comunicaciones de nuestra parte y tus datos
no serán utilizados para ninguna finalidad.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

### Plantilla #4 — Oposición

```
Asunto: Confirmación de oposición al tratamiento de datos

Hola [NOMBRE],

Confirmamos que hemos atendido tu solicitud del [FECHA] de oponerte al
tratamiento de tus datos para [FINALIDAD ESPECÍFICA, ej. marketing].

A partir de hoy:
- No recibirás más [TIPO DE COMUNICACIÓN]
- [OTRAS ACCIONES TOMADAS]

Si quieres reactivar este tratamiento en el futuro, puedes escribirnos en
cualquier momento.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

### Plantilla #5 — Portabilidad

```
Asunto: Datos personales en formato portable

Hola [NOMBRE],

Adjunto a este correo encontrarás un archivo con todos tus datos personales
en formato JSON (estructurado, de uso común y lectura mecánica), conforme a
tu solicitud del [FECHA] y al derecho de portabilidad reconocido en el
Reglamento DS N° 016-2024-JUS.

Si deseas que transfiramos directamente estos datos a otro responsable
del tratamiento, indícanos el contacto y los gestionamos.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

### Plantilla #6 — Pedido de más información

Cuando la solicitud llega incompleta:

```
Asunto: Necesitamos información adicional para atender tu solicitud

Hola,

Recibimos tu solicitud relacionada con tus datos personales en AJL Nutrición.

Para verificar tu identidad y atenderla correctamente conforme a la
Ley N° 29733, necesitamos que nos envíes:

- Tu nombre completo
- Tu número de DNI o Carné de Extranjería
- Una foto o escaneo de tu documento de identidad
- Especificar exactamente qué derecho deseas ejercer (acceso, rectificación,
  cancelación, etc.) y sobre qué datos.

Apenas recibamos esta información, atenderemos tu solicitud dentro del plazo
máximo de 10 días hábiles establecido por la ley.

Saludos,
[NOMBRE_RESPONSABLE]
AJL Nutrición — FJ INVESTMENTS S.A.C.
```

---

## Casos especiales

### Solicitud por terceros (abogados, ANPDP)

Si recibís un correo de un abogado o de la ANPDP pidiendo info sobre un
titular específico, la respuesta es la misma — pero verificar primero que
la persona representada autoriza la solicitud (poder notarial o autorización
por escrito).

### Solicitud anónima

Si alguien escribe sin identificarse pidiendo "borren mis datos", responder
con la Plantilla #6 pidiendo identificación. **No actuar sin verificar.**

### Solicitud abusiva o repetitiva

Si la misma persona hace 10 solicitudes ARCO en un mes sin razón válida,
podés responder cobrando un costo razonable o negándote a actuar, según
permite el reglamento. Conservar evidencia del abuso.

### Si el plazo de 10 días se va a vencer

Si por complejidad de la solicitud no llegás a los 10 días, responder
antes del vencimiento avisando que necesitás más tiempo (la ley permite
ampliar el plazo en casos justificados, comunicándolo al titular).
