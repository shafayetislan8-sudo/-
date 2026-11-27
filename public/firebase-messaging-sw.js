importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

// Initialized at runtime via Firebase Messaging configuration
self.addEventListener('push', function (event) {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.notification?.title || 'Mess Manager Pro';
    const options = {
      body: payload.notification?.body || '',
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // ignore malformed push payload
  }
});
