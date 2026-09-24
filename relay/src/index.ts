// Cloudflare Worker entry: a CORS-enabled, cached relay in front of adsb.lol so the static
// site can poll live positions from the browser.

import { createFetchRegion } from '../../collector/adsblol.ts';
import { REGIONS } from '../../collector/regions.ts';
import { handleRequest } from './handler.ts';
import { createRelay, type Relay } from './relay.ts';

interface Env {
  /** Comma-separated list of origins allowed to call the relay from a browser. */
  ALLOWED_ORIGINS: string;
  CACHE_TTL_SEC?: string;
}

let relay: Relay | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // No retries here: a viewer is waiting, and a cached snapshot is a better answer than a slow one.
    relay ??= createRelay({
      regions: REGIONS,
      fetchRegion: createFetchRegion({ timeoutMs: 8_000, retryDelaysMs: [] }),
      ttlMs: (Number(env.CACHE_TTL_SEC) || 5) * 1000,
    });
    const origins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    return handleRequest(request, relay, origins);
  },
};
