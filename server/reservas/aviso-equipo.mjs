// Aviso al equipo de cada cita agendada, cambiada o cancelada (Joaquín,
// 2026-10-22): siempre a Romina, Irene y Alejandro, y a la nutricionista de la cita. Si
// cambia de nutricionista, la anterior recibe un aviso de que ya no la atiende.
// Los correos viven en el secreto CORREOS_EQUIPO (el repo es público):
// {"romina":"…","irene":"…","alejandro":"…","nico":"…","paola":"…","jussara":"…","paolo":"…"}.
// Nunca lanza: un correo que falla no debe tumbar la cita.
import { etiquetaLima } from './tiempo.mjs';
import { eventoEquipo } from './evento-equipo.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const FIJAS = ['romina', 'irene', 'alejandro'];
const MOD = { presencial: 'Presencial', video: 'Virtual' };
const remitente = (env) => env.NEWSLETTER_FROM || 'AJL Nutrición <hola@ajlnutricion.com>';

export function correosEquipo(env) {
  try {
    const c = JSON.parse(env.CORREOS_EQUIPO || '{}');
    return c && typeof c === 'object' ? c : {};
  } catch {
    return {};
  }
}

function destinatarios(env, claves) {
  const c = correosEquipo(env);
  return [...new Set(claves.map((k) => String(c[k] ?? '').trim()).filter((e) => CORREO.test(e)))];
}

const TITULOS = { nueva: 'Nueva cita', cambiada: 'Cita cambiada', cancelada: 'Cita cancelada' };

function correo(tipo, r, n, extra = '') {
  const etiqueta = etiquetaLima(r.inicio_utc);
  const lineas = eventoEquipo(r, n).descripcion.split('\n').map((l) => `<li>${esc(l)}</li>`).join('');
  const titulo = tipo === 'reasignada' ? `Ya no atiendes a ${r.nombre}` : `${TITULOS[tipo]}: ${r.nombre}`;
  return {
    subject: `${titulo} · ${etiqueta}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
      <h2 style="color:${tipo === 'cancelada' ? '#9B2C2C' : '#173C2C'}">${esc(titulo)}</h2>
      ${extra}
      <p><strong>${esc(etiqueta)}</strong> · ${esc(MOD[r.modalidad] ?? r.modalidad)} · ${esc(n?.nombre ?? r.nutricionista_id)}</p>
      <ul style="padding-left:18px">${lineas}</ul>
    </div>`,
  };
}

export async function avisarEquipo(deps, env, { tipo, r, antes = null }) {
  const nombre = (id) => deps.nutricionistas.find((x) => x.id === id);
  const n = nombre(r.nutricionista_id);
  const envios = [];
  const cambios = tipo === 'cambiada' && r.edicion_cambios ? `<p>Cambió: <strong>${esc(r.edicion_cambios)}</strong></p>` : '';
  envios.push([destinatarios(env, [...FIJAS, r.nutricionista_id]), correo(tipo, r, n, cambios)]);
  if (tipo === 'cambiada' && antes && antes.nutricionista_id !== r.nutricionista_id) {
    const aviso = `<p>Esta cita pasó a ${esc(n?.nombre ?? r.nutricionista_id)}. Ya no está en tu agenda.</p>`;
    envios.push([destinatarios(env, [antes.nutricionista_id]), correo('reasignada', r, n, aviso)]);
  }
  for (const [to, c] of envios) {
    if (!to.length) continue;
    try {
      await deps.sendEmail({ from: remitente(env), to, ...c });
    } catch (e) {
      console.error('aviso-equipo', e);
    }
  }
}
