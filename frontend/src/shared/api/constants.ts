/** API origin, e.g. https://api.example.com (empty: same origin as the app). */
export const API_URL = import.meta.env.VITE_API_URL ?? '';
/** Give up on a request after this long (shows a retry instead of hanging). */
export const API_TIMEOUT_MS = 15_000;
export const APP_HEADER = 'X-Requested-With';
export const APP_HEADER_VALUE = 'TelegramMiniApp';
