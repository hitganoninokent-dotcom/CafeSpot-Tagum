/* =====================================================================
   Tagum City Cafe Explorer — service worker
   • App shell + libraries are cached so the app opens offline / on weak signal.
   • Page loads: network first (fresh data), cached copy when offline.
   • Scripts, styles, fonts, icons: stale-while-revalidate.
   • Map tiles, routing (OSRM) and street search (Nominatim) are never cached here:
     they need a live connection and their providers' usage policies apply.
   Bump VERSION whenever you deploy changes to the files below.
   ===================================================================== */
const VERSION = "tce-v1";
const SHELL = [
    "./",
    "./index.html",
    "./tokens.css",
    "./app.jsx",
    "./cafes.js",
    "./photos.js",
    "./manifest.webmanifest",
    "./assets/emblem-placeholder.svg",
    "./assets/watermark-cityhall.svg",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/apple-touch-icon.png"
];
const LIBS = [
    "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
    "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
    "https://unpkg.com/@babel/standalone@7.24.7/babel.min.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "https://cdn.tailwindcss.com"
];
const CACHEABLE_HOSTS = ["unpkg.com", "cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"];
const NEVER_CACHE = ["tile.openstreetmap.org", "router.project-osrm.org", "nominatim.openstreetmap.org"];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSION);
        await cache.addAll(SHELL);
        // Libraries: cache what we can; a CDN hiccup shouldn't block installation.
        await Promise.all(LIBS.map(async (url) => {
            try { const res = await fetch(url, { mode: "cors", credentials: "omit" }); if (res.ok) await cache.put(url, res); } catch (e) { /* skip */ }
        }));
        self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (NEVER_CACHE.some((h) => url.hostname.endsWith(h))) return; // straight to the network

    // Page navigations: network first, cached shell when offline.
    if (req.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req);
                const cache = await caches.open(VERSION);
                cache.put("./index.html", fresh.clone());
                return fresh;
            } catch (e) {
                return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
            }
        })());
        return;
    }

    // Same-origin files + known CDNs: stale-while-revalidate.
    if (url.origin === self.location.origin || CACHEABLE_HOSTS.some((h) => url.hostname.endsWith(h))) {
        event.respondWith((async () => {
            const cache = await caches.open(VERSION);
            const cached = await cache.match(req);
            const network = fetch(req).then((res) => {
                if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
                return res;
            }).catch(() => null);
            return cached || (await network) || Response.error();
        })());
    }
});