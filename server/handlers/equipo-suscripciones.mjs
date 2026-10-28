// ─── Panel del equipo · suscripciones ───────────────────────────────────────
// GET  /api/equipo/suscripciones?filtro=     lista y conteos
// POST /api/equipo/suscripciones             crea un link de suscripción (la URL solo se ve aquí)
// POST /api/equipo/suscripciones-penalidad   marca a mano una penalidad como pagada
import { json, readJson, siteUrl } from '../http.mjs';
import { randomToken, sha256Hex } from '../tokens.mjs';
import * as sus from '../suscripciones/repo.mjs';
import { condicionesSuscripcion } from '../suscripciones/calculo.mjs';

const VENCE_DIAS = 7;
const MES = 30 * 86400000;
const sinAcceso = () => json(401, { ok: false, error: 'Necesitas entrar con un correo autorizado del equipo.' });
const bad = (status, error) => json(status, { ok: false, error });

const fila = (s) => ({
  id: s.id, nombre: s.nombre, dni: s.dni, whatsapp: s.whatsapp, producto: s.producto, duracion_meses: s.duracion_meses,
  titulo: condicionesSuscripcion(s.producto, s.duracion_meses)?.titulo ?? s.producto, cobros_aprobados: s.cobros_aprobados,
  cuota_centimos: s.cuota_centimos, estado: s.estado, penalidad_estado: s.penalidad_estado, penalidad_centimos: s.penalidad_centimos,
  proximo_cobro: s.estado === 'activa' && s.ultimo_cobro_en ? new Date(Date.parse(s.ultimo_cobro_en) + MES).toISOString() : null,
  cancelada_en: s.cancelada_en, motivo_cancelacion: s.motivo_cancelacion,
});

async function crearLink(request, env, deps, email) {
  const d = await readJson(request);
  const nombre = String(d.nombre ?? '').trim().slice(0, 120);
  const c = condicionesSuscripcion(d.producto, Number(d.meses));
  if (!nombre) return bad(400, 'Escribe el nombre del paciente.');
  if (!c) return bad(400, 'Elige el plan y el paquete.');
  const token = randomToken();
  const ahora = deps.ahora();
  const vence = new Date(ahora.getTime() + VENCE_DIAS * 86400000).toISOString();
  await sus.crear(deps.db, { id: crypto.randomUUID(), token: randomToken(), link_token_hash: await sha256Hex(token), vence_en: vence, nombre,
    producto: d.producto, duracion_meses: c.duracion_meses, cuota_centimos: c.cuota_centimos, precio_mes_centimos: c.precio_mes_centimos,
    precio_3m_centimos: c.precio_3m_centimos, estado: 'pendiente', creado_por: email, creado_en: ahora.toISOString() });
  return json(200, { ok: true, url: `${siteUrl(env)}/suscribirse/?l=${token}`, vence_en: vence, titulo: c.titulo,
    cuota_centimos: c.cuota_centimos, precio_mes_centimos: c.precio_mes_centimos });
}

export async function handleEquipoSuscripciones(request, env, deps) {
  if (!['GET', 'POST'].includes(request.method)) return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  if (request.method === 'POST') return crearLink(request, env, deps, acceso.email);
  const filtro = new URL(request.url).searchParams.get('filtro') || 'todas';
  if (!sus.FILTROS_SUSCRIPCION.includes(filtro)) return bad(400, 'Filtro inválido');
  return json(200, { ok: true, filas: (await sus.listar(deps.db, { filtro })).map(fila), conteos: await sus.conteos(deps.db) });
}

export async function handleEquipoSuscripcionPenalidad(request, env, deps) {
  if (request.method !== 'POST') return bad(405, 'Método no permitido');
  const acceso = await deps.acceso(request, env);
  if (!acceso.ok) return sinAcceso();
  const d = await readJson(request);
  if (typeof d.id !== 'string') return bad(400, 'Datos inválidos');
  const ok = await sus.marcarPenalidadPagada(deps.db, { id: d.id, por: acceso.email, ahora: deps.ahora() });
  return ok ? json(200, { ok: true }) : bad(409, 'Esa penalidad ya estaba pagada.');
}
