/* Мой планер — service worker.
   Делает планер устанавливаемым и позволяет открывать его без интернета.
   Версия кэша берётся из js/version.js: при выпуске новой версии кэш обновляется сам. */
importScripts('js/version.js');

/* префикс «dailyflow-» — внутреннее имя кэша, его не меняем, чтобы старые кэши очищались */
const CACHE = 'dailyflow-' + self.AppInfo.version;

/* Всё, что нужно для запуска без сети */
const SHELL = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/version.js',
  'js/utils.js',
  'js/icons.js',
  'js/store.js',
  'js/views.js',
  'js/comments.js',
  'js/reminders.js',
  'js/whatsnew.js',
  'js/pwa.js',
  'js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('dailyflow-') === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Сеть в приоритете (всегда свежая версия), при отсутствии сети или долгом ответе — кэш */
function timeout(ms) {
  return new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request.url, { cache: 'no-cache' }), timeout(4000)]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const page = (await cache.match('index.html')) || (await cache.match('./'));
      if (page) return page;
    }
    throw err;
  }
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

/* Нажатие на уведомление открывает приложение (или переключается на уже открытое окно) */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (let i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
