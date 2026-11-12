/* Service worker de base : rend Flash WFM installable sans mettre les réponses en cache. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  /* Le gestionnaire fetch est requis pour l'installation. Le réseau reste prioritaire. */
});
