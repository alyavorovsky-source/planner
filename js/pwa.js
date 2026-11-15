/* DailyFlow — регистрация service worker (установка как приложение и работа без сети).
   Работает только по HTTPS (например, GitHub Pages) или на localhost: так требует браузер. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      if (window.console) console.warn('DailyFlow: service worker не зарегистрирован', err);
    });
  });
})();
