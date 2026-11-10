const CACHE = "pushpull-v2-4";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
const MARKER = "pushpull_v2";   // 只有真正的 App 页面才含这个字符串

const OFFLINE = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>推拉 · 离线</title>
<style>
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
   background:#0b0b0e;color:#f4f4f6;font:15px/1.6 -apple-system,"PingFang SC",sans-serif;text-align:center;padding:24px}
 div{max-width:300px}
 p{color:#8a8a93;font-size:13.5px;margin:10px 0 20px}
 button{background:#f4f4f6;color:#0b0b0e;border:0;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:600}
</style>
<div><h3 style="font-size:19px;margin:0">还没缓存到这台设备</h3>
<p>需要联网打开一次，之后就能离线用了</p>
<button onclick="location.reload()">重试</button></div></html>`;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function serveApp(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    let res;
    try {
      res = await fetch(req, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    // 只认「真正的 App 页面」：200 + HTML + 含标记
    if (res && res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const txt = await res.clone().text();
      if (txt.includes(MARKER)) {
        cache.put("index.html", res.clone());
        return res;
      }
    }
    // 隧道挂了会返回 502 / “no tunnel” 页面 —— 一律当失败，走缓存
    throw new Error("bad response");
  } catch (err) {
    const hit = (await cache.match("index.html")) || (await cache.match("./"));
    return hit || new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(serveApp(req));
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        fetch(req).then(res => { if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match("index.html"));
    })
  );
});
