import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useUnit } from 'effector-react';

import { sessionModel } from 'entities/session';

const AccountOutlet = () => {
  const userId = useUnit(sessionModel.$currentUserId);

  return <Outlet key={userId} />;
};

export const Route = createRootRoute({
  component: AccountOutlet,
});
