/* ═══════════════════════════════════════════════════════
   SERVICE WORKER — sw.js
   ─────────────────────────────────────────────────────
   This file makes Mathesis work offline.
   After your first visit, the app is cached in your browser.
   You can open it without internet and everything still works.
   Only the AI and sync features need internet.
═══════════════════════════════════════════════════════ */

const CACHE = 'mathesis-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json'];

// On install: cache all core files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// On activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// On fetch: serve from cache first, fall back to network
self.addEventListener('fetch', e => {
  // Don't cache API calls — always go to network for those
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('deepseek') ||
      e.request.url.includes('pollinations')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
