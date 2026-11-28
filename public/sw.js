/* Service worker của WorkHub: nhận thông báo đẩy và mở đúng trang khi bấm.
   Cố ý không cache trang — dữ liệu nghiệp vụ luôn lấy mới từ máy chủ. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Thông báo', body: event.data && event.data.text() }; }
  const title = data.title || 'Thông báo mới';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/api/pwa-icon?size=192',
      badge: '/api/pwa-icon?size=192',
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
      data: { url: data.url || '/dashboard', ...(data.data || {}) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();

  // Nút thao tác nhanh (vd. Duyệt) — gọi API kèm token ký sẵn, rồi báo kết quả
  if (event.action && data.actionUrl && data.actionToken) {
    event.waitUntil(
      fetch(data.actionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: event.action, token: data.actionToken }),
        credentials: 'include',
      })
        .then((r) => r.json().catch(() => ({})))
        .then((r) => self.registration.showNotification(r && r.ok ? 'Đã xử lý' : 'Chưa xử lý được', {
          body: (r && r.message) || (r && r.ok ? '' : 'Mở ứng dụng để thử lại.'),
          tag: n.tag,
          data: { url: data.url },
        }))
        .catch(() => {}),
    );
    return;
  }

  const target = new URL(data.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
