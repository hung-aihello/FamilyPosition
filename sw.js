// Network-first: luôn lấy bản mới nhất khi có mạng, dùng cache khi mất mạng.
const CACHE = "nhaminh-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "sound.js", "native.js", "config.js", "icon.svg", "manifest.webmanifest"];
const CACHEABLE_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com", "cdn.jsdelivr.net"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Trình duyệt còn giữ file trong bộ nhớ của tab theo max-age, không hỏi lại service worker: đổi thành "no-cache"
// để "Tải lại để cập nhật" luôn lấy bản mới.
function noStale(res) {
  if (!res.ok || res.type !== "basic") return res;
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-cache");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return; // bản đồ, Firebase: đi thẳng

  e.respondWith(
    // Trang của mình: hỏi lại máy chủ (no-cache), không dùng bản trình duyệt còn giữ — GitHub Pages cho giữ 10 phút,
    // vừa phát hành xong dễ ra index.html mới chạy với app.js cũ.
    fetch(req, sameOrigin ? { cache: "no-cache" } : {})
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return sameOrigin ? noStale(res) : res;
      })
      .catch(() => caches.match(req, { ignoreSearch: sameOrigin }))
  );
});
