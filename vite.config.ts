import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { handleRelay } from './relay/relay.ts';

// During `npm run dev`, answer /relay locally with the same code the Worker runs.
// The token comes from the FINITY_TOKEN environment variable (default "dev").
function devRelay(): Plugin {
  return {
    name: 'finity-dev-relay',
    configureServer(server) {
      server.middlewares.use('/relay', async (req, res) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/relay', 'http://localhost');
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const response = await handleRelay(new Request(url, { method: req.method, headers }), {
          FINITY_TOKEN: process.env.FINITY_TOKEN ?? 'dev',
        });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  // Relative paths, so the app works at a site's root (Cloudflare) or in a subfolder (GitHub Pages).
  base: './',
  plugins: [devRelay()],
  test: {
    environment: 'jsdom',
  },
});
