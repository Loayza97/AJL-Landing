// Fila para pegar en la base maestra (Google Sheets), desde la columna A (APELLIDOS).
// Después de PRODUCTO (M) la base tiene una columna de sesiones (N, «1/1»), así que
// SOLES es la O, RECURRENCIA la R, MODALIDAD la S y NUTRICIONISTA la W (Romi, 2026-10-16).
// El neto de Mercado Pago va en la P, junto al bruto (Romi, 2026-10-22).
// Desde 2026-10-26 (Joaquín) J, K, L y U llevan su fórmula, así pegar no las borra. Usan
// INDIRECTO("H"&FILA()) para apuntar a la fila donde caen, sea cual sea. Lo que se llena
// a mano (I, Q, T, V, X, Y y NOTA, SALUDOS, CICLO) va en blanco.
import { numeroParaPegar } from '../data/telefono.js';

export const COLUMNAS_MAESTRA = 28; // A a AB
const MOD = { presencial: 'Presencial', video: 'Virtual' };
// En la base Paola y Jussara van como Pao y Yuyu (Romi, 2026-10-16); solo al copiar, nunca para pacientes.
const NOMBRE_EN_BASE = { Paola: 'Pao', Jussara: 'Yuyu' };
// Nombres de la lista desplegable de la columna M.
const PRODUCTO_EN_BASE = {
  constancia: 'CONSTANCIA', acompanamiento: 'ACOMPANAMIENTO', control_acompanamiento: 'C.ACOMPANAMIENTO',
  basico: 'BÁS - S/S', transformacion: 'Transformación', evaluacion: 'Evaluación', renovacion_constancia: 'Renovación Constancia',
};
const en = (col) => `INDIRECTO("${col}"&FILA())`;
const ULTIMA_CONSULTA = `=SI(${en('H')}=MAXIFS(H:H, C:C, ${en('C')}), "✅", "❌")`; // J
const TIEMPO = `=($A$1-${en('H')})`; // K
const CONDICION = `=LET(j, ${en('J')}, k, ${en('K')}, SI(j="✅", SI(k<=19, "Paciente activo", SI(k<=30, "Recordatorio de cita", `
  + 'SI(k<=60, "Cita atrasada", "Paciente perdido"))), "-"))'; // L
const MONITOREO = `=LET(t, ${en('T')}, v, ${en('V')}, h, ${en('H')}, ancla, SI(t<>"", t, SI(v="No requiere", h, "")), `
  + 'SI(ancla="", "Falta", SI(HOY()-ancla>28, (HOY()-ancla) & " T", SI(HOY()-ancla>=0, (HOY()-ancla) & " V", ""))))'; // U

const fechaLima = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
const dmy = (f) => (f ? f.split('-').reverse().join('/') : '');

export function filaMaestra(f) {
  const c = Array(COLUMNAS_MAESTRA).fill('');
  c[0] = [f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' '); // A APELLIDOS
  c[1] = f.nombres ?? ''; // B NOMBRES
  c[2] = f.dni ?? ''; // C DNI
  c[3] = f.email ?? ''; // D CORREO
  c[4] = numeroParaPegar(f.whatsapp); // E NÚMERO, los de Perú sin +51
  c[5] = dmy(f.fecha_nacimiento); // F NACIMIENTO
  c[6] = f.pais ?? ''; // G PAÍS, sacado del código del número
  c[7] = f.sin_hora ? '' : fechaLima(f.inicio_utc); // H FECHA
  c[9] = ULTIMA_CONSULTA; // J ÚLTIMA CONSULTA
  c[10] = TIEMPO; // K TIEMPO TRANSCURRIDO
  c[11] = CONDICION; // L CONDICIÓN
  c[12] = PRODUCTO_EN_BASE[f.producto_id] ?? ''; // M PRODUCTO
  c[13] = f.sesiones ?? ''; // N #SESIONES, «2/7»: la columna está en Texto sin formato (Romi, 2026-10-26)
  c[14] = f.soles == null ? '' : String(f.soles); // O SOLES (bruto)
  c[15] = f.neto_soles == null ? '' : String(f.neto_soles); // P NETO de Mercado Pago
  c[17] = f.paciente_nuevo == null ? '' : f.paciente_nuevo ? 'Nuevo' : 'Control'; // R RECURRENCIA
  c[18] = MOD[f.modalidad] ?? ''; // S MODALIDAD
  c[20] = MONITOREO; // U DÍAS DE MONITOREO
  c[22] = NOMBRE_EN_BASE[f.nutricionista] ?? f.nutricionista ?? ''; // W NUTRICIONISTA
  return c.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t');
}
