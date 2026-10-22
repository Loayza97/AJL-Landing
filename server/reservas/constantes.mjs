// Reglas del negocio que el spec fija (Alejandro, 30-sep y 1-oct-2026).
// Minutos de citas (web y links) por día; ver topeMinutosDia (Alejandro, 2026-10-22).
export const TOPE_MINUTOS = { semana: 300, sabado: 480 };
export const DESDE_DIAS = 1;    // no se reserva para el mismo día
export const HASTA_DIAS = 21;   // hasta tres semanas adelante
export const RETENCION_MIN = 15;
export const RETENCION_MAX_MIN = 30;
export const PESO_EVALUACION = 0.5; // «cuentan como 1/2»: lectura pendiente de Alejandro
export const MAX_RETENCIONES = 2;   // horas apartadas a la vez por persona
