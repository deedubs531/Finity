// Cloudflare Worker entry: serves the built app and answers /relay requests.
import { handleRelay, type RelayEnv } from './relay.ts';

interface Env extends RelayEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/relay') return handleRelay(request, env);
    return env.ASSETS.fetch(request);
  },
};
