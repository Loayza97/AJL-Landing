import { handleSubscribe } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleSubscribe(request, env, makeDeps(env));
