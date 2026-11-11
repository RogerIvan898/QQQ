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
