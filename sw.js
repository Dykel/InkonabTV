// Lets browsers install the website as an app. It caches nothing: the player always
// loads the latest files from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
