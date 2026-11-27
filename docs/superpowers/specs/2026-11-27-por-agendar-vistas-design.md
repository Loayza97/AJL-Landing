# «Por agendar»: conteo automático, aviso de pago nuevo y vistas

27-nov-2026. Aprobado en conversación (boceto + opción A para apagar el aviso).

## Por qué
- «Por revisar» pedía anotar a mano lo que la base ya tiene.
- Para ver quién paga pronto había que bajar hasta los cobros de hace un mes.
- Un pago nuevo no se distinguía de los demás.

## Conteo automático (reemplaza «Por revisar»)
Citas usadas de una suscripción de la web:
1. su primera cita, si está confirmada;
2. más las citas confirmadas creadas con link de agenda para el **mismo paciente** (ficha o documento) y el
   **mismo producto** (`control_acompanamiento` cuenta como Acompañamiento; `renovacion_constancia` es un pago
   aparte y no cuenta) reservadas desde que se creó la suscripción. Si el mismo documento es paciente de una
   suscripción y quien paga otra, la cita solo va a la segunda cuando la ficha lleva su primer nombre;
3. si la suscripción no tiene primera cita («ya tiene cita»), también las de ese producto con fecha desde el día
   anterior a su creación, aunque se reservaran antes;
4. más las de links creados desde su fila.

Una cita cuenta para una sola suscripción: la que empezó más tarde antes de reservarla.
Hechas a mano ya asignadas: lo anotado al asignar, más los links de su fila, más las citas del paciente
(mismo producto) reservadas desde que se asignó. Con «otro», solo las de su fila.
Lo que la regla no vea se corrige con «Ajustar».

## Aviso «Nuevo pago»
Encendido si el último cobro es posterior a `citas_por_cobro_desde`, nadie pulsó «Visto» para ese número de
cobro y no se cumple «al día porque se agendó después de registrarse el cobro». Es de todo el equipo.

## Próximo cobro
La revisión de cada 15 min guarda `next_payment_date` de la lista de Mercado Pago en `sus_proximo` (web y a mano),
solo cuando cambia y con tope por vuelta. Las hechas a mano sin ningún cobro también se guardan. Si falta el dato en
una de la web activa: último cobro + 1 mes. Solo se muestra en suscripciones vigentes.

## Panel
- Sección plegable, cerrada al entrar; el título muestra el aviso y cuántas hay por agendar.
- Vistas: «Por agendar», «Cobran pronto» (próximos 30 días y atrasados, del más cercano al más lejano) y «Todas».
- Buscador por nombre. Encabezados «Último cobro» y «Próximo cobro» ordenan en ambos sentidos.
- Sin cobros: no se puede agendar desde la fila.

## Fuera
Conectar la web a la base maestra; unir sola una hecha a mano con su paciente.

## Datos
Migración `0022_por_agendar_vistas.sql`: solo agrega `sus_proximo` y `cobros_vistos`.
Las columnas `por_revisar` y `revisado_*` quedan sin uso.
