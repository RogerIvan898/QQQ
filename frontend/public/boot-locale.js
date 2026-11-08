// Boot screen label in the player's language, before the app loads.
// A file, not an inline <script>, so the CSP can forbid inline scripts.
// Same order as detectLocale(): saved choice, then browser language.
// (Telegram's language isn't available yet: its script loads below.)
(function () {
  var locale = '';
  try {
    locale = localStorage.getItem('poker:locale') || '';
  } catch (e) {}
  if (!locale) locale = (navigator.language || '').slice(0, 2);
  if (locale === 'ru') {
    document.getElementById('boot-label').textContent = 'Загрузка…';
    document.documentElement.lang = 'ru';
  }
})();
