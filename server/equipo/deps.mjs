// Dependencias reales del panel del equipo, desde context.env.
import { verificarAcceso } from './acceso.mjs';
import { crearSendEmail } from '../correo.mjs';
import { crearGoogle } from '../reservas/google.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

export function makeEquipoDeps(env) {
  const deps = { db: env.DB, ahora: () => new Date(), nutricionistas, sendEmail: crearSendEmail(env), google: crearGoogle(env) };
  deps.acceso = (request) => verificarAcceso(request, env, deps);
  return deps;
}
