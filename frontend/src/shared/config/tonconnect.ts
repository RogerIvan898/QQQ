const DEFAULT_APP_URL = 'http://localhost:5000';

const normalizeOrigin = (value: string) => value.replace(/\/$/, '');

export const getAppOrigin = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  const appUrl = (import.meta.env as Record<string, string | undefined>)
    .VITE_APP_URL;

  return appUrl ? normalizeOrigin(appUrl) : DEFAULT_APP_URL;
};

export const getTonConnectManifestUrl = () =>
  `${getAppOrigin()}/tonconnect-manifest.json`;

export const createTonConnectManifest = (origin: string) => {
  const appOrigin = normalizeOrigin(origin);

  return {
    url: appOrigin,
    name: 'GRAM Poker',
    iconUrl: `${appOrigin}/ton-icon.png`,
  };
};
