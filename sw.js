// =============================================
// sw.js — あいぜん不動産 長崎市3Dエリアマップ
// キャッシュ戦略: Shell は即時キャッシュ、
//               地図タイルはネットワーク優先・フォールバックキャッシュ
// =============================================

const CACHE_VERSION = 'v18';
const SHELL_CACHE   = `shell-${CACHE_VERSION}`;
const TILE_CACHE    = `tiles-${CACHE_VERSION}`;

// アプリシェル（オフラインでも表示したいファイル群）
const SHELL_ASSETS = [
  '/nagasaki-3d-map/',
  '/nagasaki-3d-map/index.html',
  // MapLibre GL JS（CDN版を使用している場合はURLを合わせてください）
  // '/nagasaki-3d-map/maplibre-gl.js',
  // '/nagasaki-3d-map/maplibre-gl.css',
];

// -----------------------------------------------
// install: シェルをキャッシュに保存
// -----------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// -----------------------------------------------
// activate: 古いキャッシュを削除
// -----------------------------------------------
self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, TILE_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !keep.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// -----------------------------------------------
// fetch: リクエスト種別ごとに戦略を分岐
// -----------------------------------------------
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ① 地図タイルリクエスト（国土地理院 / Mapbox など）
  //    → ネットワーク優先、失敗したらキャッシュを返す
  if (isTileRequest(url)) {
    event.respondWith(networkFirstTile(request));
    return;
  }

  // ② アプリシェル（同一オリジン）
  //    → キャッシュ優先、なければネットワーク
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ③ その他外部リソース（MapLibre CDN 等）
  //    → ネットワーク優先
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// -----------------------------------------------
// ヘルパー関数
// -----------------------------------------------

/** 地図タイルURLかどうかを判定 */
function isTileRequest(url) {
  return (
    url.hostname.includes('cyberjapandata.gsi.go.jp') ||  // 国土地理院
    url.hostname.includes('api.mapbox.com') ||            // Mapbox
    url.hostname.includes('a.tiles.mapbox.com') ||
    url.hostname.includes('b.tiles.mapbox.com') ||
    url.hostname.includes('c.tiles.mapbox.com') ||
    url.hostname.includes('d.tiles.mapbox.com') ||
    url.hostname.includes('events.mapbox.com') ||         // タイルと別扱いにしたい場合は削除
    url.pathname.match(/\.(pbf|png|jpg|webp)$/) !== null  // タイル拡張子
  );
}

/** キャッシュ優先（アプリシェル用） */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('オフラインです。ネットワーク接続を確認してください。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/** ネットワーク優先（地図タイル用）― キャッシュサイズを制限 */
async function networkFirstTile(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // タイルが取得できない場合は透明1px PNGを返す（地図が白くなるのを防ぐ）
    return new Response(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
      { status: 200, headers: { 'Content-Type': 'image/png' } }
    );
  }
}
