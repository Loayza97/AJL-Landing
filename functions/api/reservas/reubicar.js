import { handleReubicar } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleReubicar(request, env, makeReservasDeps(env));
