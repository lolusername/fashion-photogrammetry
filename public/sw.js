const CACHE_NAME = 'fashion-system-runtime-v1';
const CACHEABLE_ASSET = /\.(?:glb|jpg|jpeg|png|svg|webp)$/i;
const HASHED_BUILD_ASSET = /^\/assets\/.+\.(?:css|js)$/i;
const ITERATED_ASSET = /^\/patchwork_dress_latest\.glb$/i;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname === '/sw.js') {
    return;
  }

  if (!CACHEABLE_ASSET.test(url.pathname) && !HASHED_BUILD_ASSET.test(url.pathname)) {
    return;
  }

  if (ITERATED_ASSET.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      void cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }

      return response;
    })
    .catch((error) => {
      if (cached) {
        return cached;
      }

      throw error;
    });

  return cached || fresh;
}
