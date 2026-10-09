// ─── API de reservas y pago · AJL Nutrición ─────────────────────────────────
// GET  /api/reservas/horas      horas libres de una semana
// POST /api/reservas/apartar    aparta una hora 15 min
// POST /api/reservas/pagar      guarda los datos y crea el pago en Mercado Pago
// GET  /api/reservas/estado     estado de la reserva (y respaldo del webhook)
// POST /api/reservas/webhook-mp aviso firmado de Mercado Pago
// GET  /api/reservas/ics        archivo para «Agregar a mi calendario»
// POST /api/reservas/reubicar   nueva hora para quien pagó y perdió la suya
// POST /api/reservas/resumen-diario  correo diario al equipo con quienes no pagaron (cron)
import { json, readJson, siteUrl, clientIp } from '../http.mjs';
import { randomToken } from '../tokens.mjs';
import { inicioUtc, sumarDias, fechaLima, etiquetaLima } from '../reservas/tiempo.mjs';
import { horasLibres, primerasManuales } from '../reservas/disponibilidad.mjs';
import { cotizar } from '../reservas/catalogo.mjs';
import { correoResumenNoPagadas } from '../reservas/correos.mjs';
import { TOPE_PRIMERAS, DESDE_DIAS, HASTA_DIAS, MAX_HORAS_DIA, MAX_RETENCIONES } from '../reservas/constantes.mjs';
import * as repo from '../reservas/repo.mjs';
import { procesarPago, finalizarConfirmacion } from '../reservas/confirmar.mjs';
import { firmaValida } from '../reservas/mercadopago.mjs';
import { icsDeReserva } from '../reservas/ics.mjs';
import { CONDICIONES_VERSION } from '../../src/data/condiciones.js';
import { contacto } from '../../src/data/contacto.js';
import { validarDatos, hoyEnLima } from '../../src/data/validar-datos.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
const MODALIDADES = new Set(['presencial', 'video']);
const bad = (status, error, extra = {}) => json(status, { ok: false, error, ...extra });
const MSJ_OCUPADA = 'Esa hora acaba de ocuparse. Elige otra.';
const MSJ_TOPE = 'Ese día ya no tiene cupos para primeras sesiones. Elige otro día.';

const nutriValida = (deps, id) => !id || deps.nutricionistas.some((n) => n.id === id);

// Huella para el límite de retenciones: la IP no se guarda, solo un hash que
// cambia cada día y se borra cuando termina la retención.
async function huellaDe(request, fecha) {
  const datos = new TextEncoder().encode(`${clientIp(request) || 'sin-ip'}|${fecha}`);
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function contexto(deps, desde, dias) {
  const eventos = await deps.google.listarEventos(inicioUtc(desde, 0), inicioUtc(sumarDias(desde, dias), 0));
  const reservas = await repo.reservasActivasEntre(deps.db, desde, sumarDias(desde, dias), deps.ahora());
  return { eventos, reservas };
}

function libresDelDia(deps, ctx, { fecha, modalidad, peso, filtro }) {
  return horasLibres({ fecha, modalidad, peso, nutricionistas: deps.nutricionistas, eventos: ctx.eventos, reservas: ctx.reservas,
    ahora: deps.ahora(), filtroNutricionista: filtro || null, tope: TOPE_PRIMERAS, desdeDias: DESDE_DIAS, hastaDias: HASTA_DIAS,
    maxHorasDia: MAX_HORAS_DIA });
}

export function vista(r, deps, ultimo = null) {
  const precio = cotizar(r.producto, r.duracion_meses);
  const n = deps.nutricionistas.find((x) => x.id === r.nutricionista_id);
  const vencida = ['apartada', 'pagando'].includes(r.estado) && Date.parse(r.retencion_hasta) < deps.ahora().getTime();
  return {
    ok: true,
    estado: vencida ? 'expirada' : r.estado,
    titulo: precio?.titulo ?? r.producto,
    producto: r.producto,
    duracion_meses: r.duracion_meses,
    monto_centimos: r.monto_centimos,
    requiere_dni: Boolean(precio?.requiereDni),
    retencion_hasta: r.retencion_hasta,
    inicio: r.inicio_utc,
    etiqueta: etiquetaLima(r.inicio_utc),
    modalidad: r.modalidad,
    nutricionista: n ? { id: n.id, nombre: n.nombre } : null,
    nombre: r.nombre ? r.nombre.split(' ')[0] : null,
    meet: r.meet_url || null,
    ultimo_pago: ultimo?.estado ?? null,
  };
}

export async function handleHoras(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const desde = q.get('desde') || '';
  const modalidad = q.get('modalidad');
  const precio = cotizar(q.get('producto'), Number(q.get('duracion')));
  const filtro = q.get('nutricionista') || '';
  if (!FECHA.test(desde) || !MODALIDADES.has(modalidad) || !precio || !nutriValida(deps, filtro)) return bad(400, 'Parámetros inválidos');
  try {
    const ctx = await contexto(deps, desde, 7);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const fecha = sumarDias(desde, i);
      dias.push({ fecha, horas: libresDelDia(deps, ctx, { fecha, modalidad, peso: precio.peso, filtro }) });
    }
    return json(200, { ok: true, dias, nutricionistas: deps.nutricionistas.map(({ id, nombre, foto }) => ({ id, nombre, foto })) });
  } catch (e) {
    console.error('horas', e);
    return bad(503, 'No pudimos consultar la agenda. Intenta en un momento.');
  }
}

export async function handleApartar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const precio = cotizar(d.producto, Number(d.duracion));
  if (!precio || !MODALIDADES.has(d.modalidad) || !INICIO.test(d.inicio || '') || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const ahora = deps.ahora();
  const fecha = fechaLima(new Date(d.inicio));
  try {
    // Si eligió otra hora en la misma visita, primero se suelta la anterior.
    if (typeof d.liberar === 'string' && d.liberar) await repo.liberarRetencion(deps.db, d.liberar, ahora);
    const ctx = await contexto(deps, fecha, 1);
    const hora = libresDelDia(deps, ctx, { fecha, modalidad: d.modalidad, peso: precio.peso, filtro: d.nutricionista }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const token = randomToken();
    const res = await repo.crearRetencion(deps.db, {
      id: crypto.randomUUID(), token, producto: d.producto, duracion_meses: precio.duracion_meses, monto_centimos: precio.monto_centimos,
      peso_tope: precio.peso, nutricionista_id: hora.nutricionista_id, inicio_utc: hora.inicio, fecha_lima: fecha, modalidad: d.modalidad,
      primerasManuales: primerasManuales(ctx.eventos, fecha), tope: TOPE_PRIMERAS, ahora,
      huella: await huellaDe(request, fechaLima(ahora)), maxRetenciones: MAX_RETENCIONES,
    });
    if (!res.ok && res.motivo === 'limite') {
      return bad(429, 'Ya tienes horas apartadas. Termina tu pago o espera unos minutos.', { motivo: 'limite' });
    }
    if (!res.ok) return bad(409, res.motivo === 'tope' ? MSJ_TOPE : MSJ_OCUPADA, { motivo: res.motivo });
    deps.enSegundoPlano?.(repo.purgarNoPagadas(deps.db, ahora).catch((e) => console.error('purga', e)));
    const n = deps.nutricionistas.find((x) => x.id === hora.nutricionista_id);
    return json(200, {
      ok: true, token, retencion_hasta: res.retencion_hasta, titulo: precio.titulo, monto_centimos: precio.monto_centimos,
      requiere_dni: precio.requiereDni, inicio: hora.inicio, etiqueta: etiquetaLima(hora.inicio), modalidad: d.modalidad,
      nutricionista: { id: n.id, nombre: n.nombre },
    });
  } catch (e) {
    console.error('apartar', e);
    return bad(503, 'No pudimos apartar la hora. Intenta en un momento.');
  }
}

export async function handlePagar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const r = await repo.reservaPorToken(deps.db, String(d.token || ''));
  if (!r) return bad(404, 'No encontramos tu reserva. Vuelve a elegir tu hora.');
  const precio = cotizar(r.producto, r.duracion_meses);
  const v = validarDatos(d, hoyEnLima(deps.ahora()));
  if (!v.ok) return bad(400, v.error);
  const { cliente } = v;

  const ahora = deps.ahora();
  const res = await repo.guardarDatosYPagar(deps.db, {
    reserva: r, cliente,
    condicionesVersion: CONDICIONES_VERSION, novedades: d.novedades === true, ahora,
  });
  if (!res.ok) return bad(410, 'Se venció el tiempo para pagar. Elige tu hora de nuevo.', { motivo: 'vencida' });
  try {
    const pref = await deps.mp.crearPreferencia({
      reservaId: r.id, titulo: precio.titulo, montoCentimos: r.monto_centimos, email: cliente.email, nombre: cliente.nombre,
      venceEn: new Date(res.retencion_hasta), ahora, urlRetorno: `${siteUrl(env)}/reservar/listo/?r=${r.token}`,
      urlNotificacion: `${siteUrl(env)}/api/reservas/webhook-mp`,
    });
    await repo.guardarPreferencia(deps.db, r.id, pref.id, ahora);
    return json(200, { ok: true, url: pref.init_point });
  } catch (e) {
    console.error('preferencia', e);
    return bad(503, 'No pudimos abrir Mercado Pago. Intenta de nuevo.');
  }
}

export async function handleEstado(request, env, deps) {
  if (request.method !== 'GET') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  let r = await repo.reservaPorToken(deps.db, q.get('r') || '');
  if (!r) return bad(404, 'No encontramos tu reserva.');
  const paymentId = q.get('payment_id');
  if (paymentId && /^\d+$/.test(paymentId) && !['confirmada', 'pagada_sin_hora'].includes(r.estado)) {
    try {
      await procesarPago(deps, env, paymentId, { reservaId: r.id });
      r = await repo.reservaPorToken(deps.db, r.token);
    } catch (e) {
      console.error('estado/procesarPago', e);
    }
  }
  return json(200, vista(r, deps, await repo.ultimoPago(deps.db, r.id)));
}

export async function handleWebhookMp(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const q = new URL(request.url).searchParams;
  const cuerpo = await readJson(request);
  const tipo = q.get('type') || cuerpo.type;
  const dataId = String(q.get('data.id') || cuerpo?.data?.id || '');
  if (tipo !== 'payment' || !dataId) return json(200, { ok: true, ignorado: true });
  if (!env.MP_WEBHOOK_SECRET) {
    console.error('Falta MP_WEBHOOK_SECRET');
    return bad(503, 'Webhook sin configurar');
  }
  const valida = await firmaValida({ xSignature: request.headers.get('x-signature'), xRequestId: request.headers.get('x-request-id'),
    dataId, secreto: env.MP_WEBHOOK_SECRET });
  if (!valida) return bad(401, 'Firma inválida');
  try {
    await procesarPago(deps, env, dataId);
    return json(200, { ok: true });
  } catch (e) {
    console.error('webhook', e);
    return bad(500, 'Error procesando el pago'); // Mercado Pago reintenta
  }
}

export async function handleIcs(request, env, deps) {
  const r = await repo.reservaPorToken(deps.db, new URL(request.url).searchParams.get('r') || '');
  if (!r || r.estado !== 'confirmada') return bad(404, 'No encontramos tu reserva.');
  const precio = cotizar(r.producto, r.duracion_meses);
  const texto = icsDeReserva({
    uid: r.id,
    titulo: `Tu sesión en AJL Nutrición · ${precio?.titulo ?? ''}`,
    inicioUtc: r.inicio_utc,
    finUtc: new Date(Date.parse(r.inicio_utc) + 3600 * 1000).toISOString(),
    ubicacion: r.modalidad === 'presencial' ? contacto.direccion : (r.meet_url || 'Videollamada (enlace en tu invitación)'),
    descripcion: 'Si necesitas mover tu cita, escríbenos por WhatsApp: +51 919 151 237.',
    ahora: deps.ahora(),
  });
  return new Response(texto, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="sesion-ajl.ics"', 'Cache-Control': 'no-store' } });
}

export async function handleReubicar(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const d = await readJson(request);
  const r = await repo.reservaPorToken(deps.db, String(d.token || ''));
  if (!r) return bad(404, 'No encontramos tu reserva.');
  if (r.estado !== 'pagada_sin_hora') return bad(409, 'Esta reserva ya tiene hora.', { motivo: 'estado' });
  if (!MODALIDADES.has(d.modalidad) || !INICIO.test(d.inicio || '') || !nutriValida(deps, d.nutricionista)) return bad(400, 'Datos inválidos');
  const fecha = fechaLima(new Date(d.inicio));
  try {
    const ctx = await contexto(deps, fecha, 1);
    const hora = libresDelDia(deps, ctx, { fecha, modalidad: d.modalidad, peso: r.peso_tope, filtro: d.nutricionista }).find((h) => h.inicio === d.inicio);
    if (!hora) return bad(409, MSJ_OCUPADA, { motivo: 'ocupada' });
    const res = await repo.reubicar(deps.db, { id: r.id, nutricionista_id: hora.nutricionista_id, inicio_utc: hora.inicio, fecha_lima: fecha,
      modalidad: d.modalidad, primerasManuales: primerasManuales(ctx.eventos, fecha), tope: TOPE_PRIMERAS, ahora: deps.ahora() });
    if (!res.ok) return bad(409, res.motivo === 'tope' ? MSJ_TOPE : MSJ_OCUPADA, { motivo: res.motivo });
    const actual = await repo.reservaPorToken(deps.db, r.token);
    await finalizarConfirmacion(deps, env, actual);
    return json(200, vista(await repo.reservaPorToken(deps.db, r.token), deps));
  } catch (e) {
    console.error('reubicar', e);
    return bad(503, 'No pudimos guardar tu nueva hora. Intenta en un momento.');
  }
}

// Comparación de tokens en tiempo constante.
async function mismoToken(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const u = new Uint8Array(x);
  const w = new Uint8Array(y);
  let dif = 0;
  for (let i = 0; i < u.length; i++) dif |= u[i] ^ w[i];
  return dif === 0;
}

export async function handleResumenDiario(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  if (!env.RESUMEN_TOKEN) return bad(503, 'Resumen sin configurar');
  if (!(await mismoToken(request.headers.get('Authorization') || '', `Bearer ${env.RESUMEN_TOKEN}`))) return bad(401, 'No autorizado');
  const ahora = deps.ahora();
  const fecha = fechaLima(ahora);
  const filas = await repo.noPagadasEntre(deps.db, new Date(ahora.getTime() - 86400000).toISOString(), ahora.toISOString());
  const unicas = [...new Map(filas.map((f) => [f.email, f])).values()];
  if (!unicas.length) return json(200, { ok: true, enviados: 0 });
  if (!(await repo.marcarResumen(deps.db, fecha, ahora))) return json(200, { ok: true, enviados: 0, repetido: true });
  const personas = unicas.map((f) => ({
    nombre: f.nombre, whatsapp: f.whatsapp, titulo: cotizar(f.producto, f.duracion_meses)?.titulo ?? f.producto,
    etiqueta: etiquetaLima(f.inicio_utc), modalidad: f.modalidad,
    nutricionista: deps.nutricionistas.find((x) => x.id === f.nutricionista_id)?.nombre ?? 'el equipo',
  }));
  const enviado = await deps.sendEmail({
    from: env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>', to: env.NOTIFICATION_EMAIL,
    ...correoResumenNoPagadas({ fecha, personas }),
  });
  if (!enviado) {
    await repo.desmarcarResumen(deps.db, fecha);
    return bad(503, 'No se pudo enviar el resumen');
  }
  return json(200, { ok: true, enviados: personas.length });
}
