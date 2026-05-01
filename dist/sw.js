// Service Worker for CloudCLI PWA
// Cache only manifest (needed for PWA install). HTML and JS are never pre-cached
// so a rebuild + refresh always picks up the latest assets.
const CACHE_NAME = 'claude-ui-v2';
const urlsToCache = [
  '/manifest.json'
];

// ─── P2P Proxy ────────────────────────────────────────────────────────────────
// When a mobile client connects P2P to a desktop, API calls are routed through
// BroadcastChannel → P2P data channel → desktop local server.
let p2pActive = false;
const P2P_CHANNEL = 'cloudcli-p2p-proxy';
const bc = new BroadcastChannel(P2P_CHANNEL);
const pendingP2P = new Map();

bc.addEventListener('message', (ev) => {
  if (ev.data.type === 'p2p-response') {
    const p = pendingP2P.get(ev.data.id);
    if (p) {
      pendingP2P.delete(ev.data.id);
      const bodyText = ev.data.body ? atob(ev.data.body) : '';
      p.resolve(new Response(bodyText, {
        status: ev.data.status || 200,
        headers: new Headers({ 'Content-Type': 'application/json', ...(ev.data.headers || {}) })
      }));
    }
  }
});

self.addEventListener('message', (ev) => {
  if (ev.data.type === 'p2p-connected') { p2pActive = true; }
  if (ev.data.type === 'p2p-disconnected') { p2pActive = false; pendingP2P.clear(); }
});

function p2pRequest(request, url) {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingP2P.set(id, { resolve });
    request.text().then(body => {
      bc.postMessage({
        type: 'p2p-request', id,
        method: request.method,
        path: url.pathname + url.search,
        body: body || null,
      });
    });
    setTimeout(() => {
      if (pendingP2P.has(id)) {
        pendingP2P.delete(id);
        resolve(new Response('{"error":"P2P timeout"}', { status: 504, headers: { 'Content-Type': 'application/json' } }));
      }
    }, 20000);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Fetch event — network-first for everything except hashed assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const href = event.request.url;

  // Route /api/* through P2P when connected
  if (url.pathname.startsWith('/api/') && p2pActive) {
    event.respondWith(p2pRequest(event.request, url));
    return;
  }

  // Never intercept WebSocket upgrades or non-P2P API requests
  if (href.includes('/api/') || href.includes('/ws')) {
    return;
  }

  // Navigation requests (HTML) — always go to network, no caching
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/manifest.json').then(() =>
        new Response('<h1>Offline</h1><p>Please check your connection.</p>', {
          headers: { 'Content-Type': 'text/html' }
        })
      ))
    );
    return;
  }

  // Hashed assets (JS/CSS in /assets/) — cache-first since filenames change per build
  if (url.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Activate event — purge old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'CloudCLI', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/logo-256.png',
    badge: '/logo-128.png',
    data: payload.data || {},
    tag: payload.data?.tag || `${payload.data?.sessionId || 'global'}:${payload.data?.code || 'default'}`,
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CloudCLI', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const sessionId = event.notification.data?.sessionId;
  const provider = event.notification.data?.provider || null;
  const urlPath = sessionId ? `/session/${sessionId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          client.postMessage({
            type: 'notification:navigate',
            sessionId: sessionId || null,
            provider,
            urlPath
          });
          return;
        }
      }
      return self.clients.openWindow(urlPath);
    })
  );
});
