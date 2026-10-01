// Dependencias reales de las funciones de reservas, desde context.env.
import { crearSendEmail } from '../correo.mjs';
import { crearGoogle } from './google.mjs';
import { crearMp } from './mercadopago.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

export function makeReservasDeps(env) {
  return {
    db: env.DB,
    sendEmail: crearSendEmail(env),
    google: crearGoogle(env),
    mp: crearMp(env),
    nutricionistas,
    ahora: () => new Date(),
  };
}
