// Service Worker for Web Push Notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Nova Notificação', body: '', icon: '/placeholder.svg', tag: 'default' };
  
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    data.body = event.data?.text() || '';
  }

  const options = {
    body: data.body,
    icon: data.icon || '/placeholder.svg',
    badge: '/placeholder.svg',
    tag: data.tag || 'default',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/app',
    },
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/app') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
