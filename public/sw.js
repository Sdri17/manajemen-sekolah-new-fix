// Service Worker for EduSync - Offline Resilience & Push Notifications
const CACHE_NAME = 'edusync-cache-v1';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated');
  event.waitUntil(self.clients.claim());
});

// Listen for Push Events
self.addEventListener('push', (event) => {
  let data = { title: 'EduSync Notification', body: 'Pembaruan data terbaru di kelas.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Ada data penting baru yang masuk ke EduSync.',
    icon: '/icon.png',
    badge: '/pwa-192.png',
    vibrate: [100, 50, 100],
    data: data.url || '/',
    tag: data.tag || 'edusync-push-notification',
    renotify: true,
    actions: [
      { action: 'open', title: 'Buka Aplikasi' },
      { action: 'close', title: 'Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'EduSync Notifikasi', options)
  );
});

// Listen for Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
