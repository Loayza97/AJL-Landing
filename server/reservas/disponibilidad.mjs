// Motor puro de horas libres. Sin red ni base de datos: recibe el equipo, los
// eventos del calendario ya normalizados y las reservas activas, y devuelve qué
// horas se pueden vender y a quién se le asignan. Toda regla del spec vive aquí.
import { inicioUtcMin, fechaLima, diaSemana, diasEntre, finDeReserva } from './tiempo.mjs';
import { TOPE_MINUTOS, TOPE_NUTRI_MINUTOS } from './constantes.mjs';

export const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
// Horario del consultorio de Lince (src/data/contacto.js). Domingo cerrado.
export const HORARIO_CLINICA = { 1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [10, 20], 6: [9, 19] };
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

// Tope diario en minutos (Alejandro, 2026-10-22): suman las citas de la web y
// de los links por su duración; de lunes a viernes 300 (5 de una hora, 10 de
// media o cualquier mezcla) y el sábado 480. Lleno, el día se cierra para los
// dos. Los eventos puestos a mano en Google no suman.
export function topeMinutosDia(fecha) {
  return diaSemana(fecha) === 6 ? TOPE_MINUTOS.sabado : TOPE_MINUTOS.semana;
}

// Tope por nutricionista (Joaquín y Alejandro, 2026-10-23): suman sus citas de
// la web y de los links. Llena, ese día ya no se le ofrece; las demás siguen.
export function topeNutriDia(fecha) {
  return diaSemana(fecha) === 6 ? TOPE_NUTRI_MINUTOS.sabado : TOPE_NUTRI_MINUTOS.semana;
}

const minutosDe = (r) => r.duracion_min ?? 60;
const seCruza = (ev, ini, fin) => !ev.todoElDia && Date.parse(ev.desde) < fin && Date.parse(ev.hasta) > ini;

// Un evento con hora puesto a mano en Google ocupa su tramo: si el título
// nombra a una nutricionista (por su apodo), solo a ella; si no nombra a
// nadie, a todas (Alejandro y Joaquín, 2026-10-22). Los que creó el sistema
// (propio) ya están en la base y los marcados como libres no cuentan.
function bloqueadasPorEventos(eventos, nutricionistas, ini, fin) {
  const bloqueadas = new Set();
  for (const ev of eventos) {
    if (ev.propio || !ev.bloquea || !seCruza(ev, ini, fin)) continue;
    const t = normalizar(ev.titulo);
    const nombradas = nutricionistas.filter((n) => n.apodos.some((a) => contienePalabra(t, a)));
    for (const n of nombradas.length ? nombradas : nutricionistas) bloqueadas.add(n.id);
  }
  return bloqueadas;
}

// ¿La nutricionista atiende de `m` a `m + dur` (minutos desde la medianoche de
// Lima) ese día y en esa modalidad? Nada puede pisar la hora del almuerzo.
function ventanaCubre(nutricionista, fecha, modalidad, m, dur) {
  if (m < (HORA_ALMUERZO + 1) * 60 && m + dur > HORA_ALMUERZO * 60) return false;
  const dow = diaSemana(fecha);
  return nutricionista.ventanas.some((v) => {
    if (v.dia !== DIAS[dow]) return false;
    // null = ambas. Quien atiende presencial también puede atender por video
    // (Alejandro, 2026-10-15); una ventana solo virtual no se vuelve presencial.
    if (v.modalidad && v.modalidad !== modalidad && !(v.modalidad === 'presencial' && modalidad === 'video')) return false;
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
  fecha, modalidad, nutricionistas, eventos, reservas, ahora,
  filtroNutricionista = null, desdeDias = 1, hastaDias = 21,
  duracionMin = 60, pasoMin = 60, sinTope = false,
}) {
  const distancia = diasEntre(fechaLima(ahora), fecha);
  if (distancia < desdeDias || distancia > hastaDias) return [];

  const { ausentes, cerrada } = ausenciasDelDia(eventos, fecha, nutricionistas);
  if (cerrada) return [];

  const delDia = reservas.filter((r) => r.fecha_lima === fecha);
  const usados = delDia.reduce((s, r) => s + minutosDe(r), 0);
  if (!sinTope && usados + duracionMin > topeMinutosDia(fecha)) return [];

  const carga = (id) => delDia.filter((r) => r.nutricionista_id === id).length;
  const minutosNutri = (id) => delDia.filter((r) => r.nutricionista_id === id).reduce((s, r) => s + minutosDe(r), 0);
  const topeNutri = topeNutriDia(fecha);
  const cruza = (r, ini, fin) => Date.parse(r.inicio_utc) < fin && Date.parse(finDeReserva(r)) > ini;
  const libres = [];
  for (let m = 0; m + duracionMin <= 24 * 60; m += pasoMin) {
    const inicio = inicioUtcMin(fecha, m);
    const ini = Date.parse(inicio);
    const fin = ini + duracionMin * MIN_MS;
    if (ini <= ahora.getTime()) continue;
    if (modalidad === 'presencial'
      && delDia.some((r) => r.modalidad === 'presencial' && cruza(r, ini, fin))) continue;

    const bloqueadas = bloqueadasPorEventos(eventos, nutricionistas, ini, fin);
    const candidatas = nutricionistas.filter((n) => !ausentes.has(n.id) && !bloqueadas.has(n.id)
      && (sinTope || minutosNutri(n.id) + duracionMin <= topeNutri)
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
