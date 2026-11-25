// Reglas del negocio que el spec fija (Alejandro, 30-sep y 1-oct-2026).
// Minutos de citas (web y links) por día; ver topeMinutosDia (Alejandro, 2026-10-22).
// L-V sube de 300 a 360 (6 h) el 2026-11-19 (Alejandro); el sábado sigue en 480.
export const TOPE_MINUTOS = { semana: 360, sabado: 480 };
// Minutos de citas por nutricionista y día (2026-10-23): 4 horas L-V (antes 3; Alejandro, 2026-11-19), 5 el sábado.
export const TOPE_NUTRI_MINUTOS = { semana: 240, sabado: 300 };
// Fechas sin ningún tope, ni del equipo ni por nutricionista (Alejandro, 2026-11-25:
// el sábado 28-nov sin límite de horas). Pasada la fecha ya no hacen nada y se pueden borrar.
export const SIN_TOPE_FECHAS = ['2026-11-28'];
export const TOPE_LIBRE = 100000; // minutos: en la práctica, sin tope
export const DESDE_DIAS = 0;    // se puede reservar el mismo día; solo horas que aún no empiezan (Alejandro, 2026-11-12; antes 1)
// Margen mínimo entre la reserva y el inicio de la cita (Alejandro, 2026-11-12): solo horas que empiezan en 1 h o más.
export const MARGEN_MIN = 60;
// Días que se pueden pedir de una vez a /horas: la ventana completa y un margen.
export const MAX_DIAS_CONSULTA = 45;
export const HASTA_DIAS = 42;   // hasta seis semanas adelante (Romi, 2026-10-23; antes 21)
export const RETENCION_MIN = 15;
export const RETENCION_MAX_MIN = 30;
export const PESO_EVALUACION = 0.5; // «cuentan como 1/2»: lectura pendiente de Alejandro
export const MAX_RETENCIONES = 2;   // horas apartadas a la vez por persona
