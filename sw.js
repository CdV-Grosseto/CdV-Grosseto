// Aggiornato a v52 - inserita modifica segnalazione
const CACHE_NAME = 'cdv-grosseto-v84';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================
self.addEventListener('push', function (event) {
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('Push ricevuto:', data);

      const options = {
        body: data.body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200, 100, 400],
        data: {
          url: data.url || '/'
        },
        // requireInteraction: true -> Su Chrome mobile può essere fastidioso, meglio default
        tag: 'cdv-alert' // Sovrascrive notifiche vecchie identiche
      };

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (e) {
      console.error('Errore parsing push:', e);
    }
  }
});

self.addEventListener('notificationclick', function (event) {
  console.log('Notifica cliccata');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 1. Cerca una finestra già aperta
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. Se non c'è, aprine una nuova
      if (clients.openWindow) {
        // Usa lo scope del SW invece di '/' per supportare le sottocartelle (es. GitHub Pages)
        return clients.openWindow(self.registration.scope);
      }
    })
  );
});













