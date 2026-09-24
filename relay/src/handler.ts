import { UpstreamError } from '../../collector/adsblol.ts';
import { RegionNotFoundError, type Relay } from './relay.ts';

const LIVE_ROUTE = /^\/v1\/regions\/([a-z0-9-]+)\/live$/;

function corsHeaders(request: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = origin !== null && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'));
  return {
    Vary: 'Origin',
    ...(allowed && {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Expose-Headers': 'X-Relay-Cache, X-Snapshot-Age',
      'Access-Control-Max-Age': '86400',
    }),
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/**
 * Routes:
 *   GET /v1/health              -> { ok: true }
 *   GET /v1/regions/{id}/live   -> Snapshot (same shape as the static latest.json)
 *
 * `X-Snapshot-Age` (ms since the relay fetched the data) lets clients place `sourceTime` on
 * their own clock without trusting that their clock agrees with anyone else's.
 */
export async function handleRequest(request: Request, relay: Relay, allowedOrigins: string[]): Promise<Response> {
  const cors = corsHeaders(request, allowedOrigins);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { ...cors, Allow: 'GET, OPTIONS' });

  const { pathname } = new URL(request.url);
  if (pathname === '/v1/health') return json({ ok: true }, 200, cors);

  const regionId = LIVE_ROUTE.exec(pathname)?.[1];
  if (!regionId) return json({ error: 'Not found' }, 404, cors);

  try {
    const { snapshot, cache, ageMs } = await relay.get(regionId);
    return json(snapshot, 200, { ...cors, 'X-Relay-Cache': cache, 'X-Snapshot-Age': String(ageMs) });
  } catch (err) {
    if (err instanceof RegionNotFoundError) return json({ error: err.message }, 404, cors);
    const status = err instanceof UpstreamError && err.status === 429 ? 503 : 502;
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Upstream unavailable: ${message}` }, status, { ...cors, 'Retry-After': '15' });
  }
}
