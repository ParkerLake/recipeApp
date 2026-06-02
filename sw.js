/* ── Salty Lake Recipes — Service Worker ──────────────── */
const CACHE = 'slr-20260601';
const PRECACHE = [
  '/recipeApp/',
  '/recipeApp/index.html',
  '/recipeApp/recipe.html',
  '/recipeApp/kitchen.html',
  '/recipeApp/assets/style.css',
  '/recipeApp/assets/app.js',
  '/recipeApp/assets/recipe.js',
  '/recipeApp/assets/kitchen.js',
  '/recipeApp/icons/icon-192.png',
  '/recipeApp/icons/icon-512.png'
];

/* Install: pre-cache app shell */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

/* Activate: delete old caches */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: network-first for recipes.json (always fresh), cache-first for everything else */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always fetch recipes.json fresh from network
  if (url.pathname.endsWith('recipes.json')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for app shell and static assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/recipeApp/'));
    })
  );
});
