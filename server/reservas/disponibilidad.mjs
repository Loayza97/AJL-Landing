// Motor puro de horas libres. Sin red ni base de datos: recibe el equipo, los
// eventos del calendario ya normalizados y las reservas activas, y devuelve qué
// horas se pueden vender y a quién se le asignan. Toda regla del spec vive aquí.
import { inicioUtc, fechaLima, diaSemana, diasEntre } from './tiempo.mjs';

export const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
// Horario del consultorio de Lince (src/data/contacto.js). Domingo cerrado.
export const HORARIO_CLINICA = { 1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [10, 20], 6: [9, 19] };
const HORA_MS = 3600 * 1000;

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

// Horas ya tomadas ese día: cada reserva web ocupa 1 h y los eventos manuales
// con hora, su duración. Solo se usa si MAX_HORAS_DIA está activo.
function horasOcupadas(eventos, delDia, fecha) {
  const manuales = eventos
    .filter((ev) => !ev.todoElDia && !ev.propio && ev.bloquea && fechaLima(new Date(ev.desde)) === fecha)
    .reduce((s, ev) => s + (Date.parse(ev.hasta) - Date.parse(ev.desde)) / HORA_MS, 0);
  return delDia.length + manuales;
}

function ventanaCubre(nutricionista, fecha, modalidad, hora) {
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
    return hora >= desde && hora + 1 <= hasta;
  });
}

export function horasLibres({
  fecha, modalidad, peso, nutricionistas, eventos, reservas, ahora,
  filtroNutricionista = null, tope = 3, desdeDias = 1, hastaDias = 21, maxHorasDia = null,
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
  const libres = [];
  for (let hora = 0; hora < 24; hora++) {
    const inicio = inicioUtc(fecha, hora);
    const ini = Date.parse(inicio);
    const fin = ini + HORA_MS;
    if (ini <= ahora.getTime()) continue;
    // Eventos manuales: no dicen quién atiende, así que bloquean la hora entera.
    if (eventos.some((ev) => !ev.propio && ev.bloquea && seCruza(ev, ini, fin))) continue;
    if (modalidad === 'presencial'
      && delDia.some((r) => r.modalidad === 'presencial' && r.inicio_utc === inicio)) continue;

    const candidatas = nutricionistas.filter((n) => !ausentes.has(n.id)
      && (!filtroNutricionista || n.id === filtroNutricionista)
      && ventanaCubre(n, fecha, modalidad, hora)
      && !delDia.some((r) => r.nutricionista_id === n.id && r.inicio_utc === inicio));
    if (!candidatas.length) continue;

    const elegida = candidatas.reduce((a, b) => (carga(b.id) < carga(a.id) ? b : a));
    libres.push({ inicio, hora: `${String(hora).padStart(2, '0')}:00`, nutricionista_id: elegida.id });
  }
  return libres;
}
