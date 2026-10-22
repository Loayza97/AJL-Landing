// Dependencias reales de las funciones de reservas, desde context.env.
import { crearSendEmail } from '../correo.mjs';
import { crearGoogle } from './google.mjs';
import { crearMp } from './mercadopago.mjs';
import { nutricionistas } from '../../src/data/nutricionistas.js';

export function makeReservasDeps(env, ctx) {
  return {
    db: env.DB,
    sendEmail: crearSendEmail(env),
    google: crearGoogle(env),
    mp: crearMp(env),
    nutricionistas,
    ahora: () => new Date(),
    // En Pages Functions, una promesa que sigue tras devolver la respuesta se
    // corta a media ejecución: hay que registrarla con waitUntil para que el
    // runtime la termine igual. Fuera de ese contexto (tests, scripts) solo
    // queda correr la promesa tal cual.
    enSegundoPlano: (p) => (ctx?.waitUntil ? ctx.waitUntil(p) : p),
  };
}
