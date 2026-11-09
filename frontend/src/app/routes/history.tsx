import { createFileRoute } from '@tanstack/react-router';

import { HistoryPage } from 'pages/history';

export const Route = createFileRoute('/history')({
  component: HistoryPage,
  pendingMs: 0,
});
