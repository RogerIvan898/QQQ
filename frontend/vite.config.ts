import { lingui } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AtRule, Plugin as PostcssPlugin } from 'postcss';
import { defineConfig, loadEnv, type Plugin } from 'vite';
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

const stripMockServiceWorkerPlugin = (mockServer: boolean): Plugin => {
  let outDir = 'dist';

  return {
    name: 'strip-mock-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!mockServer) {
        rmSync(resolve(outDir, 'mockServiceWorker.js'), { force: true });
      }
    },
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
  generateBundle() {
    const origin = normalizeOrigin(
      process.env.VITE_APP_URL || 'http://localhost:5000'
    );

    this.emitFile({
      type: 'asset',
      fileName: 'tonconnect-manifest.json',
      source: JSON.stringify(createTonConnectManifest(origin), null, 2),
    });
  },
});

const insideHoverMedia = (node: { parent?: unknown }) => {
  let parent = node.parent as (AtRule & { parent?: unknown }) | undefined;

  while (parent) {
    if (parent.type === 'atrule' && parent.params.includes('hover: hover')) {
      return true;
    }

    parent = parent.parent as typeof parent;
  }

  return false;
};

const hoverOnlyOnPointerDevices = (): PostcssPlugin => ({
  postcssPlugin: 'hover-only-on-pointer-devices',
  OnceExit(root, { AtRule }) {
    root.walkRules(rule => {
      if (!rule.selector.includes(':hover') || insideHoverMedia(rule)) {
        return;
      }

      const hover = rule.selectors.filter(s => s.includes(':hover'));
      const rest = rule.selectors.filter(s => !s.includes(':hover'));
      const media = new AtRule({ name: 'media', params: '(hover: hover)' });

      media.append(rule.clone({ selectors: hover }));
      rule.after(media);

      if (rest.length > 0) {
        rule.selectors = rest;
      } else {
        rule.remove();
      }
    });
  },
});

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || '/',
  css: {
    postcss: { plugins: [hoverOnlyOnPointerDevices()] },
  },
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
    babel({ presets: [reactCompilerPreset()] }),
    nodePolyfills({
      include: ['buffer'],
    }),
    tonConnectManifestPlugin(),
    stripMockServiceWorkerPlugin(
      loadEnv(mode, import.meta.dirname, 'VITE_').VITE_MOCK_SERVER === 'true'
    ),
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
}));
