// Guards every /api request: only the verified owner gets through.
import { verifyAccess, json } from '../../lib/access.js';

export async function onRequest(context) {
  try {
    context.data.user = await verifyAccess(context.request, context.env);
  } catch (e) {
    return json({ error: e.message }, e.status || 401);
  }
  try {
    return await context.next();
  } catch (e) {
    return json({ error: e.message || 'Serverfout' }, e.status || 500);
  }
}
