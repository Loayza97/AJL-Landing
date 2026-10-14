// Motor puro de horas libres. Sin red ni base de datos: recibe el equipo, los
// eventos del calendario ya normalizados y las reservas activas, y devuelve qué
// horas se pueden vender y a quién se le asignan. Toda regla del spec vive aquí.
import { inicioUtcMin, fechaLima, diaSemana, diasEntre, finDeReserva } from './tiempo.mjs';

export const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
// Horario del consultorio de Lince (src/data/contacto.js). Domingo cerrado.
export const HORARIO_CLINICA = { 1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [10, 20], 6: [9, 19] };
const HORA_MS = 3600 * 1000;
const MIN_MS = 60 * 1000;
// De 1 a 2 p. m. es el almuerzo del equipo, todos los días: esa hora no se ofrece.
export const HORA_ALMUERZO = 13;

export function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function contienePalabra(texto, palabra) {
  return new RegExp(`(^|[^a-z0-9])${palabra}([^a-z0-9]|$)`).test(texto);
}

const cubreDia = (ev, fecha) => ev.todoElDia && ev.desde <= fecha && fecha < ev.hasta;
const seCruza = (ev, ini, fin) => !ev.todoElDia && Date.parse(ev.desde) < fin && Date.parse(ev.hasta) > ini;

export function ausenciasDelDia(eventos, fecha, nutricionistas) {
  const ausentes = new Set();
  let cerrada = false;
  for (const ev of eventos) {
    if (!cubreDia(ev, fecha)) continue;
    const t = normalizar(ev.titulo);
    if (contienePalabra(t, 'cerrado') || contienePalabra(t, 'feriado')) cerrada = true;
    // «nico viene» marca presencia en su sábado alterno; solo «no viene» es ausencia.
    if (contienePalabra(t, 'viene') && !t.includes('no viene')) continue;
    for (const n of nutricionistas) {
      if (n.apodos.some((a) => contienePalabra(t, a))) ausentes.add(n.id);
    }
  }
  return { ausentes, cerrada };
}

export function primerasManuales(eventos, fecha) {
  return eventos.filter((ev) => !ev.todoElDia && !ev.propio
    && fechaLima(new Date(ev.desde)) === fecha
    && normalizar(ev.titulo).trim().startsWith('1ra')).length;
}

// Horas ya tomadas ese día: cada reserva ocupa su duración y los eventos manuales
// con hora, su duración. Solo se usa si MAX_HORAS_DIA está activo.
function horasOcupadas(eventos, delDia, fecha) {
  const manuales = eventos
    .filter((ev) => !ev.todoElDia && !ev.propio && ev.bloquea && fechaLima(new Date(ev.desde)) === fecha)
    .reduce((s, ev) => s + (Date.parse(ev.hasta) - Date.parse(ev.desde)) / HORA_MS, 0);
  return delDia.reduce((s, r) => s + (r.duracion_min ?? 60) / 60, 0) + manuales;
}

// ¿La nutricionista atiende de `m` a `m + dur` (minutos desde la medianoche de
// Lima) ese día y en esa modalidad? Nada puede pisar la hora del almuerzo.
function ventanaCubre(nutricionista, fecha, modalidad, m, dur) {
  if (m < (HORA_ALMUERZO + 1) * 60 && m + dur > HORA_ALMUERZO * 60) return false;
  const dow = diaSemana(fecha);
  return nutricionista.ventanas.some((v) => {
    if (v.dia !== DIAS[dow]) return false;
    if (v.modalidad && v.modalidad !== modalidad) return false; // null = ambas
    if (v.cadaDosSemanas && Math.abs(diasEntre(v.cadaDosSemanas, fecha)) % 14 !== 0) return false;
    let desde = v.desde;
    let hasta = v.hasta;
    if (modalidad === 'presencial') {
      const clinica = HORARIO_CLINICA[dow];
      if (!clinica) return false;
      desde = Math.max(desde, clinica[0]);
      hasta = Math.min(hasta, clinica[1]);
    }
    return m >= desde * 60 && m + dur <= hasta * 60;
  });
}

export function horasLibres({
  fecha, modalidad, peso, nutricionistas, eventos, reservas, ahora,
  filtroNutricionista = null, tope = 3, desdeDias = 1, hastaDias = 21, maxHorasDia = null,
  duracionMin = 60, pasoMin = 60,
}) {
  const distancia = diasEntre(fechaLima(ahora), fecha);
  if (distancia < desdeDias || distancia > hastaDias) return [];

  const { ausentes, cerrada } = ausenciasDelDia(eventos, fecha, nutricionistas);
  if (cerrada) return [];

  const delDia = reservas.filter((r) => r.fecha_lima === fecha);
  const suma = delDia.reduce((s, r) => s + r.peso_tope, 0) + primerasManuales(eventos, fecha);
  if (suma + peso > tope) return [];
  if (maxHorasDia !== null && horasOcupadas(eventos, delDia, fecha) >= maxHorasDia) return [];

  const carga = (id) => delDia.filter((r) => r.nutricionista_id === id).length;
  const cruza = (r, ini, fin) => Date.parse(r.inicio_utc) < fin && Date.parse(finDeReserva(r)) > ini;
  const libres = [];
  for (let m = 0; m + duracionMin <= 24 * 60; m += pasoMin) {
    const inicio = inicioUtcMin(fecha, m);
    const ini = Date.parse(inicio);
    const fin = ini + duracionMin * MIN_MS;
    if (ini <= ahora.getTime()) continue;
    // Eventos manuales: no dicen quién atiende, así que bloquean ese tramo entero.
    if (eventos.some((ev) => !ev.propio && ev.bloquea && seCruza(ev, ini, fin))) continue;
    if (modalidad === 'presencial'
      && delDia.some((r) => r.modalidad === 'presencial' && cruza(r, ini, fin))) continue;

    const candidatas = nutricionistas.filter((n) => !ausentes.has(n.id)
      && (!filtroNutricionista || n.id === filtroNutricionista)
      && ventanaCubre(n, fecha, modalidad, m, duracionMin)
      && !delDia.some((r) => r.nutricionista_id === n.id && cruza(r, ini, fin)));
    if (!candidatas.length) continue;

    const elegida = candidatas.reduce((a, b) => (carga(b.id) < carga(a.id) ? b : a));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    libres.push({ inicio, hora: `${hh}:${mm}`, nutricionista_id: elegida.id });
  }
  return libres;
}
