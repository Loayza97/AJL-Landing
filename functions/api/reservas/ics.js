import { handleIcs } from '../../../server/handlers/reservas.mjs';
import { makeReservasDeps } from '../../../server/reservas/deps.mjs';

export const onRequest = ({ request, env }) => handleIcs(request, env, makeReservasDeps(env));
