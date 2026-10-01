import { handleUnsubscribe } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleUnsubscribe(request, env, makeDeps(env));
