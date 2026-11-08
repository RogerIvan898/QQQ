import { createRouter } from '@tanstack/react-router';

import { routeTree } from 'app/routeTree.gen';

import { RouteError, RoutePending } from './route-status';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',

  defaultPendingComponent: RoutePending,
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  interface HistoryState {
    wsUrl: string;
  }
}
