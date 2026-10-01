// Reglas del negocio que el spec fija (Alejandro, 30-sep y 1-oct-2026).
export const TOPE_PRIMERAS = 3; // primeras sesiones por día, todos los canales
export const DESDE_DIAS = 1;    // no se reserva para el mismo día
export const HASTA_DIAS = 21;   // hasta tres semanas adelante
export const RETENCION_MIN = 15;
export const RETENCION_MAX_MIN = 30;
export const PESO_EVALUACION = 0.5; // «cuentan como 1/2»: lectura pendiente de Alejandro
export const MAX_HORAS_DIA = null;  // «5 horas de operación L-V»: apagado hasta que se aclare
export const MAX_RETENCIONES = 2;   // horas apartadas a la vez por persona
