import { createFileRoute } from '@tanstack/react-router';

import { SessionDetailsPage } from 'pages/history';

export const Route = createFileRoute('/history_/$sessionId')({
  component: SessionDetailsPage,
});
