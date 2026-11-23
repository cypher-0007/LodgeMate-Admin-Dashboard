/* LodgeMate Admin Service Worker — Web Push Notifications & Deep-Link Navigation */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "LodgeMate Admin",
    body: "You have a new administrative notification.",
    url: "/",
    tag: "lodgemate-admin-general",
  };

  try {
    const parsed = event.data.json();
    payload = {
      title: parsed.title || payload.title,
      body: parsed.body || payload.body,
      url: parsed.url || payload.url,
      tag: parsed.tag || payload.tag,
    };
  } catch {
    payload.body = event.data.text() || payload.body;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: payload.tag, // Prevents duplicate notifications for the same event
      renotify: false,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
