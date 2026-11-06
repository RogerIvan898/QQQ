import { lingui } from '@lingui/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const normalizeOrigin = (value: string) => value.replace(/\/$/, '');

const createTonConnectManifest = (origin: string) => {
  const appOrigin = normalizeOrigin(origin);

  return {
    url: appOrigin,
    name: 'GRAM Poker',
    iconUrl: `${appOrigin}/ton-icon.png`,
  };
};

const tonConnectManifestPlugin = (): Plugin => ({
  name: 'tonconnect-manifest',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/tonconnect-manifest.json') {
        next();
        return;
      }

      const host = req.headers.host ?? 'localhost:5000';
      const protocol =
        req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const origin = `${protocol}://${host}`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(createTonConnectManifest(origin)));
    });
  },
  closeBundle() {
    const origin = normalizeOrigin(
      process.env.VITE_APP_URL ?? 'http://localhost:5000'
    );

    this.emitFile({
      type: 'asset',
      fileName: 'tonconnect-manifest.json',
      source: JSON.stringify(createTonConnectManifest(origin), null, 2),
    });
  },
});

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      enableDisablingOutdatedRouteFiles: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
      routeFileIgnorePattern: '.*\\.(test|spec|styles)\\.(ts|tsx)$',
      quoteStyle: 'single',
      semicolons: true,
    }),
    lingui({ macroTransform: true }),
    react(),
    nodePolyfills({
      include: ['buffer'],
    }),
    tonConnectManifestPlugin(),
  ],
  resolve: {
    alias: {
      app: resolve(import.meta.dirname, 'src/app'),
      pages: resolve(import.meta.dirname, 'src/pages'),
      features: resolve(import.meta.dirname, 'src/features'),
      entities: resolve(import.meta.dirname, 'src/entities'),
      shared: resolve(import.meta.dirname, 'src/shared'),
      widgets: resolve(import.meta.dirname, 'src/widgets'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
});
