// sw.js — Project Pages safe
const CACHE = 'manga-pwa-v7'; // bump to force update
const ASSETS = ['./index.html','./styles.css','./app.js','./manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // don't intercept cross-origin (MangaDex via proxy)
});
