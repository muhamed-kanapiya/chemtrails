import { defineConfig } from 'vite';
import { flightProxy } from './worker/handler.js';
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 650 },
  plugins: [{
    name: 'local-flight-proxy',
    configureServer(server) {
      server.middlewares.use('/api/flights', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        url.pathname = '/flights';
        const result = await flightProxy(new Request(url, { method: req.method }));
        res.statusCode = result.status;
        result.headers.forEach((value,key) => res.setHeader(key,value));
        res.end(Buffer.from(await result.arrayBuffer()));
      });
    },
  }],
});
