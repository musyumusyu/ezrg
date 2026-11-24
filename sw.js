// アプリ本体(同一オリジン)だけをキャッシュする Service Worker。
// スプレッドシート/譜面/音源など外部へのリクエストには一切介入しない。
// バージョンは version.js の APP_VERSION が唯一の基準(上げると古いキャッシュは自動削除され、新版へ入れ替わる)。
try { importScripts('version.js'); } catch (e) {}
const VERSION = self.APP_VERSION || 'dev';
const CACHE = 'amat-shell-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './version.js',
  './manifest.webmanifest',
  './fonts/amat-sans-400.woff',
  './fonts/amat-sans-700.woff',
  './fonts/amat-serif.woff',
  './fonts/amat-mono.woff',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // 1つ取得できないファイルがあっても、インストール自体は失敗させない
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('amat-shell-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部(Googleシート等)は素通し

  // ページ遷移 と version.js: ネット優先 → 失敗(オフライン)ならキャッシュ(表示するバージョンを本体と食い違わせないため)
  if (req.mode === 'navigate' || url.pathname.endsWith('/version.js')) {
    e.respondWith(
      fetch(req).then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')).then(r => r || caches.match('./')))
    );
    return;
  }

  // フォント(変わらない大きなファイル): キャッシュ優先、無ければ取得して保存(裏での再取得はしない)
  if (url.pathname.includes('/fonts/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
    return;
  }

  // その他の静的ファイル: キャッシュ優先 + 裏で更新
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
