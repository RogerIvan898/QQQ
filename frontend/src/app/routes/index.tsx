import { createFileRoute } from '@tanstack/react-router';

import { MenuPage } from 'pages/main-menu';

export const Route = createFileRoute('/')({
  component: MenuPage,
});
