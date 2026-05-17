self.addEventListener('push', function (event) {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title || '冰箱管家', {
      body: body || '',
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag: 'fridge-expiry',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
