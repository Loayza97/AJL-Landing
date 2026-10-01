import { handleEstado } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleEstado(request, env, makeReservasDeps(env));
