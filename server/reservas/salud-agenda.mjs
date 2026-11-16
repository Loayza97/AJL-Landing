// Revisión de la agenda web (Alejandro, 16-nov-2026). El 14-nov venció el permiso de Google
// y /api/reservas/horas dio 503 casi un día sin que nadie se enterara. El cron
// (workers/resumen-cron) llama esto cada 15 min: hace lo mismo que la página de reservas
// (leer Google Calendar y las reservas de D1) y, si falla dos veces seguidas, avisa a
// AVISOS_RESPALDO. Mientras siga caída, recuerda cada 3 h; cuando vuelve, avisa que volvió.
import { esc } from './correos.mjs';
import { avisarRespaldo } from './aviso-equipo.mjs';
import { etiquetaLima } from './tiempo.mjs';
import * as repo from './repo.mjs';

export const CLAVE = 'alerta_agenda';
export const REPETIR_MS = 3 * 3600000;
export const ESPERA_REINTENTO_MS = 20000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// El texto de Google puede ser largo; para el correo basta el comienzo.
const resumenError = (e) => String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300);

function correoCaida(error, desde, ahora) {
  const pista = /invalid_grant/.test(error)
    ? '<p>El error es <strong>invalid_grant</strong>: venció o se revocó el permiso de Google. Hay que reautorizar con <code>scripts/google-oauth.mjs</code> y volver a publicar.</p>'
    : '';
  const repetido = desde.getTime() !== ahora.getTime();
  return {
    subject: repetido ? `La agenda web sigue caída (desde ${etiquetaLima(desde.toISOString())})` : 'La agenda web está caída',
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
      <h2 style="color:#9B2C2C">La agenda web no muestra horas</h2>
      <p>Desde ${esc(etiquetaLima(desde.toISOString()))} nadie puede ver ni reservar horas en la web.</p>
      <p>Error: <code>${esc(error)}</code></p>
      ${pista}
      <p style="font-size:13px;color:#5E6B63">Mientras siga caída, este aviso se repite cada 3 horas.</p>
    </div>`,
  };
}

function correoVuelta(desde, ahora) {
  const min = Math.round((ahora - desde) / 60000);
  const dur = min < 120 ? `${min} min` : `${Math.round(min / 60)} h`;
  return {
    subject: 'La agenda web volvió',
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#20302A">
      <h2 style="color:#173C2C">La agenda web volvió a funcionar</h2>
      <p>Estuvo caída unos ${esc(dur)}, desde ${esc(etiquetaLima(desde.toISOString()))}.</p>
    </div>`,
  };
}

async function leerEstado(deps) {
  try {
    const v = await repo.leerSync(deps.db, CLAVE);
    return v ? JSON.parse(v) : null;
  } catch {
    return null; // si D1 tampoco responde, no hay cómo recordar: se avisa igual
  }
}

async function guardarEstado(deps, estado) {
  try {
    await repo.guardarSync(deps.db, CLAVE, estado ? JSON.stringify(estado) : '');
  } catch (e) {
    console.error('salud-agenda: no se pudo guardar el estado', e);
  }
}

// `probar` hace la consulta de la página de reservas; lanza si falla.
export async function revisarAgenda(deps, env, probar, { esperar = dormir } = {}) {
  let error = null;
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await esperar(ESPERA_REINTENTO_MS);
    try {
      await probar();
      error = null;
      break;
    } catch (e) {
      error = resumenError(e);
    }
  }
  const ahora = deps.ahora();
  const estado = await leerEstado(deps);
  if (!error) {
    if (estado) {
      await avisarRespaldo(deps, env, correoVuelta(new Date(estado.desde), ahora));
      await guardarEstado(deps, null);
    }
    return { ok: true, volvio: Boolean(estado) };
  }
  console.error('salud-agenda: la agenda no responde', error);
  const desde = estado ? new Date(estado.desde) : ahora;
  const avisar = !estado || ahora - new Date(estado.avisado) >= REPETIR_MS;
  if (avisar) {
    await avisarRespaldo(deps, env, correoCaida(error, desde, ahora));
    await guardarEstado(deps, { desde: desde.toISOString(), avisado: ahora.toISOString() });
  }
  return { ok: false, error, avisado: avisar };
}
