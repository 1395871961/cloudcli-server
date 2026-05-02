// Service Worker for CloudCLI PWA
// Cache only manifest (needed for PWA install). HTML and JS are never pre-cached
// so a rebuild + refresh always picks up the latest assets.
const CACHE_NAME = 'claude-ui-v3';
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
      // Build headers, strip hop-by-hop headers that break Response construction
      const safeHeaders = {};
      const skip = new Set(['transfer-encoding', 'connection', 'keep-alive', 'trailer', 'upgrade']);
      Object.entries(ev.data.headers || {}).forEach(([k, v]) => {
        if (!skip.has(k.toLowerCase())) safeHeaders[k] = Array.isArray(v) ? v[0] : v;
      });
      // Body is base64-encoded binary
      const bodyBytes = ev.data.body
        ? Uint8Array.from(atob(ev.data.body), c => c.charCodeAt(0))
        : new Uint8Array(0);
      p.resolve(new Response(bodyBytes, {
        status: ev.data.status || 200,
        headers: new Headers(safeHeaders)
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
    const reqHeaders = {};
    request.headers.forEach((v, k) => { reqHeaders[k] = v; });
    request.arrayBuffer().then(buf => {
      const bodyB64 = buf.byteLength > 0
        ? btoa(String.fromCharCode(...new Uint8Array(buf)))
        : null;
      bc.postMessage({
        type: 'p2p-request', id,
        method: request.method,
        path: url.pathname + url.search,
        headers: reqHeaders,
        body: bodyB64,
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

  // Never intercept WebSocket upgrades or SW/manifest files
  if (href.includes('/ws') || url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
    return;
  }

  // When P2P is active, route ALL requests through P2P (HTML, JS, CSS, API)
  // This allows Render to serve only mobile.html — full SPA comes from desktop
  if (p2pActive) {
    event.respondWith(p2pRequest(event.request, url));
    return;
  }

  // No P2P: navigation requests go to network
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connecting…</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,sans-serif;background:#0f1117;color:#e2e6f3;flex-direction:column;gap:12px}.spinner{width:28px;height:28px;border:3px solid #2e3250;border-top-color:#6c8cff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div><p style="font-size:14px;color:#8891b4">正在连接本地服务器…</p><script>setTimeout(()=>location.reload(),2000)</script></body></html>', {
          headers: { 'Content-Type': 'text/html' }
        })
      )
    );
    return;
  }

  // Hashed assets (JS/CSS in /assets/) — cache-first since filenames change per build
  if (href.includes('/assets/')) {
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
