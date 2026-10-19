/**
 * CafeSpot Tagum — app.js
 * UI logic: hash routing (+404), Leaflet map with live tracking,
 * cafe rendering, forms (validation, spam & rate limiting),
 * user dashboard (stamps, badges, history, next steps),
 * auth UI (log in, sign up, remember me, password recovery),
 * admin dashboard, cookie consent, toasts, theme.
 */
import {
    CONFIG, ALL_TAGS,
    initLocalDatabase, escapeHTML as esc, validate, checkRateLimit, looksLikeSpam,
    getCurrentUser, isAdmin, loginUser, registerUser, logoutUser, getUsers, deleteUser,
    maskEmail, maskHandle, maskName, getLoginLog,
    AUTH_MODE, getSessionInfo, getKnownAccounts, forgetKnownAccount,
    resetPasswordWithRecoveryKey, sendPasswordResetLink, regenerateRecoveryKey, acknowledgeRecoveryKey,
    getActivity, getProgress, onAuthChange,
    getCafes, getCafe, addCafe, updateCafe, deleteCafe, resetCafeDirectory, addReviewToCafe,
    getOpenStatus, formatHours, formatTime, getSchedule, facebookLink, getCafePhotos, formatKm,
    getSavedCafeIds, toggleSavedCafe, getVisitedCafeIds, toggleVisitedCafe, getVisitDate,
    locationState, onLocationChange, startLocationWatch, stopLocationWatch, distanceMeters, formatDistance,
    getConsent, setConsent, trackEvent, getAnalyticsEvents,
    getTheme, setTheme
} from "./db.js";

/* ============================================================
 * STATE & HELPERS
 * ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MAIN_VIEWS = ["home", "explore", "map", "saved", "admin", "privacy", "terms"];
const state = {
    route: null,
    baseView: "home",
    search: "",
    tags: new Set(),
    area: "",
    sort: "open",
    pageSize: 24,
    shown: 24,
    lastOrderKey: "",
    detailId: null
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

const FALLBACK_IMG = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="#e6f6ec"/><g transform="translate(280 150)" fill="none" stroke="#057d3c" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M0 30h60v25a30 30 0 0 1-30 30h0A30 30 0 0 1 0 55z"/><path d="M60 38h8a12 12 0 0 1 0 24h-8"/><path d="M18 0v14M38 0v14"/></g></svg>`
);

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function navigate(path) {
    location.hash = "#/" + path;
}

function distanceTo(cafe) {
    return locationState.coords ? distanceMeters(locationState.coords, cafe) : null;
}

function starsText(rating) {
    return rating == null ? "New" : rating.toFixed(1);
}

/** Pill for open / closed / unknown hours. */
function statusPill(status, { long = false, extra = "" } = {}) {
    const cls = status.isOpen === null ? "status-unknown" : status.isOpen ? "status-open" : "status-closed";
    const text = long ? status.label : status.isOpen === null ? "Hours n/a" : status.isOpen ? "Open now" : "Closed";
    return `<span class="status-pill ${cls} ${extra}"><span class="status-dot"></span>${esc(text)}</span>`;
}

function socialLinks(cafe, size = "sm") {
    const btn = size === "sm" ? "social-btn" : "social-btn social-btn-lg";
    const fb = cafe.social?.facebook;
    const ig = cafe.social?.instagram;
    return `
      <a class="${btn}" href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer"
         aria-label="${fb ? `${esc(cafe.name)} on Facebook` : `Search Facebook for ${esc(cafe.name)}`}" title="${fb ? "Facebook page" : "Search on Facebook"}">
        <svg class="w-4 h-4" aria-hidden="true"><use href="#i-fb"/></svg>${size === "lg" ? `<span>${fb ? "Facebook" : "Find on Facebook"}</span>` : ""}
      </a>
      ${ig ? `<a class="${btn}" href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener noreferrer" aria-label="${esc(cafe.name)} on Instagram (@${esc(ig)})" title="@${esc(ig)}">
        <svg class="w-4 h-4" aria-hidden="true"><use href="#i-ig"/></svg>${size === "lg" ? `<span>@${esc(ig)}</span>` : ""}
      </a>` : ""}`;
}

function directionsUrl(cafe) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name}, ${cafe.address}`)}`;
}

function priceText(item) {
    return item.price == null ? `<span class="text-muted font-normal italic">Price not listed</span>` : `${item.from ? "from " : ""}${peso.format(item.price)}`;
}

/* ============================================================
 * RUBBER STAMP — pressed onto a café when you mark it visited
 * Café name runs around the top of the ring, "Tagum City" around
 * the bottom, visit date in the middle. Each café keeps the same
 * tilt every time it's drawn (hashed from its id).
 * ============================================================ */
let stampUid = 0;
function stampTilt(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return (Math.abs(h) % 25) - 12; // −12° … +12°
}

function stampSvg(cafe, { pressed = false, delay = 0 } = {}) {
    const iso = getVisitDate(cafe.id);
    const date = iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "Visited";
    const ring = cafe.name.length > 24 ? cafe.name.slice(0, 23).trim() + "…" : cafe.name;
    const top = `stamp-top-${++stampUid}`, bottom = `stamp-bot-${stampUid}`;
    return `<svg class="stamp${pressed ? " stamp--pressed" : ""}" viewBox="0 0 120 120" style="--rot:${stampTilt(cafe.id)}deg;--delay:${delay}ms"
        role="img" aria-label="Stamp: visited ${esc(cafe.name)}${iso ? ` on ${esc(date)}` : ""}">
      <defs>
        <path id="${top}" d="M19 60 A41 41 0 0 1 101 60" />
        <path id="${bottom}" d="M13 60 A47 47 0 0 0 107 60" />
      </defs>
      <g filter="url(#stamp-ink)">
        <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="4.5" />
        <circle cx="60" cy="60" r="29" fill="none" stroke="currentColor" stroke-width="2" />
        <text font-size="${ring.length > 18 ? 9.5 : 11}" font-weight="800" letter-spacing=".6"><textPath href="#${top}" startOffset="50%" text-anchor="middle">${esc(ring)}</textPath></text>
        <text font-size="8.5" font-weight="700" letter-spacing="2.2"><textPath href="#${bottom}" startOffset="50%" text-anchor="middle">TAGUM CITY</textPath></text>
        <text x="60" y="61" text-anchor="middle" font-size="16" font-weight="800">${esc(date)}</text>
        <text x="60" y="74" text-anchor="middle" font-size="8.5" font-weight="700" letter-spacing="1">VISITED</text>
      </g>
    </svg>`;
}

/* ============================================================
 * TOASTS
 * ============================================================ */
const ICONS = { success: "i-check", error: "i-x", info: "i-locate" };
export function showToast(message, type = "success", ms = 2800) {
    const region = $("#toast-region");
    while (region.children.length >= 3) region.firstElementChild.remove();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#${ICONS[type] || "i-check"}"/></svg><span></span>`;
    el.querySelector("span").textContent = message;
    region.appendChild(el);
    setTimeout(() => {
        el.classList.add("leaving");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    }, ms);
}

/* ============================================================
 * DIALOGS
 * ============================================================ */
function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("modal-open");
    $$("form", dialog).forEach((f) => (f.dataset.openedAt = String(Date.now())));
}
function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
}

function setupDialogs() {
    $$("dialog.modal").forEach((d) => {
        // Click on the backdrop area closes
        d.addEventListener("click", (e) => { if (e.target === d) closeDialog(d); });
        d.addEventListener("close", () => {
            if (!$$("dialog[open]").length) document.body.classList.remove("modal-open");
        });
    });
}

let confirmResolver = null;
function confirmAction(text, confirmLabel = "Delete") {
    const d = $("#confirm-modal");
    $("#confirm-text").textContent = text;
    $('[data-confirm="yes"]', d).textContent = confirmLabel;
    openDialog(d);
    return new Promise((resolve) => (confirmResolver = resolve));
}

/* ============================================================
 * ROUTER (hash-based, with 404 fallback)
 * ============================================================ */
function parseRoute() {
    const hash = location.hash;
    if (!hash || hash === "#" || hash === "#/") return { view: "home" };
    if (!hash.startsWith("#/")) return null; // in-page anchor like #main — not a route
    const path = decodeURIComponent(hash.slice(2)).replace(/\/+$/, "");
    if (MAIN_VIEWS.includes(path)) return { view: path };
    const m = path.match(/^cafe\/([\w-]+)$/);
    if (m) return { view: "cafe", id: m[1] };
    return { view: "notfound", path: "/" + path };
}

function handleRoute(isInitial = false) {
    const route = parseRoute() || (isInitial ? { view: "home" } : null);
    if (!route) return; // plain in-page anchor (e.g. skip link) — leave the current view alone

    if (route.view === "cafe") {
        const cafe = getCafe(route.id);
        if (!cafe) return showView("notfound", { path: `/cafe/${route.id}` });
        if (state.route !== "cafe") state.cafeEntry = isInitial ? "direct" : "app"; // where "Back" should go
        openCafeDetail(cafe.id);
        return;
    }
    state.detailId = null;
    showView(route.view, { path: route.path, isInitial });
}

function showView(view, { path = "", isInitial = false, silent = false } = {}) {
    const previous = state.route;
    state.route = view;
    if (MAIN_VIEWS.includes(view)) state.baseView = view;

    $$(".view-panel").forEach((p) => p.classList.add("hidden"));
    const panel = $(`#view-${view}`);
    panel.classList.remove("hidden", "view-enter");
    void panel.offsetWidth; // restart animation
    panel.classList.add("view-enter");

    document.title = panel.dataset.title || "CafeSpot Tagum";
    $$("[data-nav]").forEach((a) => {
        if (a.dataset.nav === view) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
    });

    if (view === "notfound") {
        $("#notfound-path").textContent = path || location.hash;
        trackEvent("not_found", { path });
    }
    if (view === "map") ensureMap();
    if (view === "admin") renderAdmin();
    if (view === "saved") renderSaved();

    if (!isInitial && !silent) {
        window.scrollTo({ top: 0, behavior: "auto" });
        $("#main").focus({ preventScroll: true });
    }
    if (!silent && previous !== view) {
        trackEvent(isInitial ? "page_view" : "tab_switch", { from: previous, to: view });
    }
}

/* ============================================================
 * HEADER / AUTH STATE
 * ============================================================ */
function renderHeader() {
    const user = getCurrentUser();
    lastUserId = user?.id || null;
    $("#profile-display-name").textContent = user ? user.name : "Guest Account";
    $("#profile-display-handle").textContent = user ? user.handle : CONFIG.HANDLE;
    $("#auth-login-btn").classList.toggle("hidden", !!user);
    $("#auth-logout-btn").classList.toggle("hidden", !user);
    $$(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
}

/* ============================================================
 * CAFE CARDS & LISTS
 * ============================================================ */
function cafeCard(cafe, i = 0) {
    const saved = getSavedCafeIds().includes(cafe.id);
    const visited = getVisitedCafeIds().includes(cafe.id);
    const status = getOpenStatus(cafe);
    const dist = distanceTo(cafe);
    const reviewCount = cafe.reviews?.length || 0;

    return `
    <article class="cafe-card" style="--i:${Math.min(i, 11)}" data-cafe="${esc(cafe.id)}">
      ${visited ? `<div class="card-stamp">${stampSvg(cafe)}</div>` : ""}
      <div class="cafe-media">
        <img src="${esc(cafe.image)}" alt="${esc(cafe.imageAlt || `Photo of ${cafe.name}`)}" loading="lazy" decoding="async" width="640" height="400" />
        ${statusPill(status, { extra: "absolute left-3 top-3" })}
        <button type="button" class="heart-btn absolute right-3 top-3" data-action="toggle-save" data-id="${esc(cafe.id)}"
          aria-pressed="${saved}" aria-label="${saved ? "Remove" : "Save"} ${esc(cafe.name)} ${saved ? "from" : "to"} favorites">
          <svg class="w-5 h-5" aria-hidden="true"><use href="#i-heart"/></svg>
        </button>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-lg font-bold leading-snug">
            <a href="#/cafe/${esc(cafe.id)}" class="hover:text-accent">${esc(cafe.name)}</a>
          </h3>
          <span class="inline-flex items-center gap-1 text-sm font-bold shrink-0">
            <svg class="w-4 h-4 text-amber-500" aria-hidden="true"><use href="#i-star"/></svg>${starsText(cafe.rating)}
            <span class="text-xs font-medium text-muted">(${reviewCount})</span>
          </span>
        </div>
        <p class="text-sm text-muted mt-0.5">${esc(cafe.address)}</p>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted">
          <span class="inline-flex items-center gap-1"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-clock"/></svg>${esc(formatHours(cafe))}</span>
          <span class="inline-flex items-center gap-1 font-semibold text-accent" data-distance-for="${esc(cafe.id)}">${dist != null ? `<svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-pin"/></svg>${formatDistance(dist)}` : ""}</span>
          ${cafe.phone ? `<a href="tel:${esc(cafe.phone.replace(/[^\d+]/g, ""))}" class="hover:text-accent">${esc(cafe.phone)}</a>` : ""}
        </div>
        <div class="flex flex-wrap gap-1.5 mt-3">
          ${(cafe.tags || []).map((t) => `<span class="tag-chip">#${esc(t.replace(/\s/g, ""))}</span>`).join("")}
        </div>
        <div class="mt-auto pt-3 border-t border-line flex justify-between items-center">
          <label class="visit-toggle">
            <input type="checkbox" data-action="toggle-visit" data-id="${esc(cafe.id)}" ${visited ? "checked" : ""} />
            <span class="visit-box"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-check"/></svg></span>
            <span class="visit-label">${visited ? "Visited" : "Mark visited"}</span>
          </label>
          <div class="flex items-center gap-1.5">
            ${socialLinks(cafe)}
            <a href="#/cafe/${esc(cafe.id)}" class="text-sm font-bold text-accent hover:underline ml-1">Details →</a>
          </div>
        </div>
      </div>
    </article>`;
}

function emptyState(text, actionHtml = "") {
    return `<div class="col-span-full text-center py-14 px-4 bg-surface border border-dashed border-line rounded-2xl">
      <span class="feature-icon mx-auto"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-cup"/></svg></span>
      <p class="text-sm text-muted mt-3">${text}</p>${actionHtml}</div>`;
}

function filteredCafes() {
    const q = state.search.trim().toLowerCase();
    let list = getCafes().filter((c) => {
        const haystack = [c.name, c.address, c.neighborhood, ...(c.menu || []).map((m) => m.name)].join(" ").toLowerCase();
        const matchesQ = !q || haystack.includes(q);
        const matchesTags = [...state.tags].every((t) => (c.tags || []).includes(t));
        const matchesArea = !state.area || c.neighborhood === state.area;
        return matchesQ && matchesTags && matchesArea;
    });

    const byRating = (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name);
    const sorters = {
        rating: byRating,
        name: (a, b) => a.name.localeCompare(b.name),
        // open first, then unknown hours, then closed; alphabetical within each group
        open: (a, b) => {
            const rank = (c) => ({ true: 0, null: 1, false: 2 })[String(getOpenStatus(c).isOpen)];
            return rank(a) - rank(b) || a.name.localeCompare(b.name);
        },
        distance: (a, b) => (distanceTo(a) ?? Infinity) - (distanceTo(b) ?? Infinity)
    };
    return list.sort(sorters[state.sort] || byRating);
}

function renderExplore() {
    const list = filteredCafes();
    state.lastOrderKey = list.map((c) => c.id).join("|");
    const container = $("#explore-cafe-list");
    const visible = list.slice(0, state.shown);
    container.innerHTML = list.length
        ? visible.map((c, i) => cafeCard(c, i)).join("")
        : emptyState("No cafes match your search. Try removing a filter.",
            `<button type="button" class="btn-outline mt-4" data-action="clear-filters">Clear filters</button>`);

    const more = $("#explore-more");
    const remaining = list.length - visible.length;
    more.classList.toggle("hidden", remaining <= 0);
    more.textContent = `Show more cafes (${remaining} more)`;

    const total = getCafes().length;
    const openCount = list.filter((c) => getOpenStatus(c).isOpen).length;
    $("#explore-meta").textContent = `${list.length} of ${total} cafes match · ${openCount} open now`;
}

function appendExploreCards() {
    const list = filteredCafes();
    const start = state.shown;
    state.shown += state.pageSize;
    $("#explore-cafe-list").insertAdjacentHTML("beforeend", list.slice(start, state.shown).map((c, i) => cafeCard(c, i)).join(""));
    const remaining = list.length - Math.min(state.shown, list.length);
    $("#explore-more").classList.toggle("hidden", remaining <= 0);
    $("#explore-more").textContent = `Show more cafes (${remaining} more)`;
}

function renderAreaFilter() {
    const counts = {};
    getCafes().forEach((c) => { if (c.neighborhood) counts[c.neighborhood] = (counts[c.neighborhood] || 0) + 1; });
    const areas = Object.keys(counts).sort();
    const sel = $("#area-select");
    sel.innerHTML = `<option value="">All areas</option>` + areas.map((a) => {
        const n = counts[a];
        return `<option value="${esc(a)}" ${state.area === a ? "selected" : ""}>${esc(a)} (${n})</option>`;
    }).join("");
}

function renderTagFilters() {
    $("#tag-filters").innerHTML = ALL_TAGS.map((t) =>
        `<button type="button" class="filter-chip" data-action="filter-tag" data-tag="${esc(t)}" aria-pressed="${state.tags.has(t)}">${esc(t)}</button>`
    ).join("");
}

function renderProgress(pressId = null) {
    const cafes = getCafes();
    const ids = new Set(cafes.map((c) => c.id));
    const visited = getVisitedCafeIds().filter((id) => ids.has(id)).length;
    const pct = cafes.length ? Math.round((visited / cafes.length) * 100) : 0;
    $("#checklist-progress-text").textContent = `${visited} of ${cafes.length} visited (${pct}%)`;
    $("#checklist-progress-bar").style.width = `${pct}%`;
    $("#checklist-progressbar").setAttribute("aria-valuenow", String(pct));
    renderStampCollection(pressId);
}

/** Your collected stamps, newest first, followed by a few empty slots waiting to be filled. */
function renderStampCollection(pressId = null) {
    const row = $("#stamp-collection");
    if (!row) return;
    const stamped = getVisitedCafeIds()
        .map((id) => getCafe(id))
        .filter(Boolean)
        .sort((a, b) => (getVisitDate(b.id) || "").localeCompare(getVisitDate(a.id) || ""));
    const empties = Math.max(0, 6 - stamped.length);
    row.innerHTML =
        stamped.map((c) => `<a href="#/cafe/${esc(c.id)}" class="stamp-chip" title="${esc(c.name)}">${stampSvg(c, { pressed: c.id === pressId })}</a>`).join("") +
        Array.from({ length: empties }, () => `<span class="stamp-slot" aria-hidden="true"></span>`).join("");
    $("#stamp-collection-hint").classList.toggle("hidden", stamped.length > 0);
}

function renderSaved() {
    const ids = getSavedCafeIds();
    const saved = getCafes().filter((c) => ids.includes(c.id));
    $("#saved-cafe-list").innerHTML = saved.length
        ? saved.map((c, i) => cafeCard(c, i)).join("")
        : emptyState("No saved cafes yet. Tap the heart on any cafe to keep it here.",
            `<a href="#/explore" class="btn-primary mt-4">Browse cafes</a>`);
}

/** Home: cafes open right now (nearest first when location is on), falling back to all cafes. */
function renderHomeTop() {
    const all = getCafes();
    let picks = all.filter((c) => getOpenStatus(c).isOpen === true);
    const heading = $("#home-top-heading");
    if (!picks.length) { picks = all; heading.textContent = "Cafes to try"; }
    else heading.textContent = `Open right now (${picks.length})`;
    picks.sort(locationState.coords ? (a, b) => distanceTo(a) - distanceTo(b) : (a, b) => (b.menu?.length || 0) - (a.menu?.length || 0) || a.name.localeCompare(b.name));
    $("#home-top-list").innerHTML = picks.slice(0, 6).map((c, i) => cafeCard(c, i)).join("");
}

function renderAll({ announce = false } = {}) {
    renderHeader();
    renderAreaFilter();
    renderProgress();
    refreshProgress({ announce });
    renderHomeTop();
    renderExplore();
    renderSaved();
    updateMapMarkers();
    renderNearbyList();
    if (state.route === "admin") renderAdmin();
    if (state.route === "cafe") renderCafeDetail();
}

/** Keep every card for the same cafe in sync without re-rendering (preserves animations). */
function syncCafeControls(id, { press = false } = {}) {
    const saved = getSavedCafeIds().includes(id);
    const visited = getVisitedCafeIds().includes(id);
    const cafe = getCafe(id);
    $$(`.cafe-card[data-cafe="${CSS.escape(id)}"]`).forEach((card) => {
        const existing = card.querySelector(".card-stamp");
        if (visited && !existing && cafe) {
            card.insertAdjacentHTML("afterbegin", `<div class="card-stamp">${stampSvg(cafe, { pressed: press })}</div>`);
            if (press) { card.classList.remove("stamp-jolt"); void card.offsetWidth; card.classList.add("stamp-jolt"); }
        } else if (!visited && existing) {
            existing.classList.add("card-stamp--lifting");
            setTimeout(() => existing.remove(), 220);
        }
    });
    const name = getCafe(id)?.name || "cafe";
    $$(`[data-action="toggle-save"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
        b.setAttribute("aria-pressed", String(saved));
        b.setAttribute("aria-label", `${saved ? "Remove" : "Save"} ${name} ${saved ? "from" : "to"} favorites`);
    });
    $$(`[data-action="toggle-visit"][data-id="${CSS.escape(id)}"]`).forEach((c) => {
        c.checked = visited;
        const label = c.closest(".visit-toggle")?.querySelector(".visit-label");
        if (label) label.textContent = visited ? "Visited" : "Mark visited";
    });
}

/* ============================================================
 * CAFE PAGE — split screen at #/cafe/<id>
 * ------------------------------------------------------------
 *  ┌──────── left (sticky on desktop) ────────┬──────── right (scrolls) ────────┐
 *  │ ← Back                                   │ Open now · name · address · ★   │
 *  │ [ interactive map: café, you, route ]    │ Save · Visited · Directions     │
 *  │ Distance from you   2.4 km  (live)       │ About                           │
 *  │ Photos (real photos only)                │ Menu · Opening hours · Reviews  │
 *  └──────────────────────────────────────────┴─────────────────────────────────┘
 * Phones: one column, map + distance + photos first.
 * ============================================================ */
const detail = {
    map: null, tiles: null, others: null, cafeMarker: null, userMarker: null, accuracy: null, line: null,
    route: null,          // { cafeId, from, distance (m), duration (s), coords }
    routeState: "idle",   // idle | loading | ok | failed
    routeTriedFrom: null, // where we last asked for a road route (avoid re-asking every GPS tick)
    fittedWithUser: false,
    photos: [], photoIndex: 0
};
const ROUTE_RECHECK_M = 250;      // ask for a new road route after moving this far
const ROUTE_MAX_KM = 80;          // further than this, only straight-line distance is shown

function openCafeDetail(id) {
    const changed = state.detailId !== id;
    state.detailId = id;
    showView("cafe");
    renderCafeDetail({ full: changed || !detail.map });
    if (changed) trackEvent("cafe_view", { id });
}

/** Back: return to the list/map the user came from; on a shared link, go to Explore. */
function closeCafeDetail() {
    if (state.cafeEntry === "app" && history.length > 1) history.back();
    else navigate(state.baseView === "home" ? "explore" : state.baseView);
}

function renderCafeDetail({ full = false } = {}) {
    const cafe = getCafe(state.detailId);
    if (!cafe) return;
    document.title = `${cafe.name} · CafeSpot Tagum`;
    $("#split-crumb").textContent = `${cafe.neighborhood || "Tagum City"} · Tagum City`;
    renderCafeInfo(cafe);
    renderDistanceCard(cafe);
    if (full) {
        detail.route = null;
        detail.routeState = "idle";
        detail.routeTriedFrom = null;
        detail.fittedWithUser = false;
        renderPhotos(cafe);
        setupDetailMap(cafe);
        maybeFetchRoute(cafe);
    }
}

/* ---------------- RIGHT: description, menu, hours, reviews ---------------- */
function renderCafeInfo(cafe) {
    const user = getCurrentUser();
    const status = getOpenStatus(cafe);
    const saved = getSavedCafeIds().includes(cafe.id);
    const visited = getVisitedCafeIds().includes(cafe.id);
    const alreadyReviewed = user && cafe.reviews.some((r) => r.userId === user.id);
    const draft = $("#review-text")?.value || ""; // keep a half-written review across re-renders

    const menuByCat = (cafe.menu || []).reduce((acc, item) => {
        (acc[item.category || "Menu"] = acc[item.category || "Menu"] || []).push(item);
        return acc;
    }, {});
    const chips = [...(cafe.tags || []).map((t) => `#${t.replace(/\s/g, "")}`), ...(cafe.amenities || [])];

    $("#cafe-info").innerHTML = `
      <header class="info-head">
        <div class="flex flex-wrap items-center gap-2">
          ${statusPill(status, { long: true })}
          ${cafe.coordsApprox ? `<span class="text-xs text-muted">Map pin is approximate</span>` : ""}
        </div>
        <div class="detail-stamp-slot">${visited ? `<div class="detail-stamp">${stampSvg(cafe)}</div>` : ""}</div>
        <h1 id="detail-title" class="info-title">${esc(cafe.name)}</h1>
        <p class="text-muted mt-1">${esc(cafe.address)}</p>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
          <span class="inline-flex items-center gap-1 font-bold"><svg class="w-4 h-4 text-amber-500" aria-hidden="true"><use href="#i-star"/></svg>${starsText(cafe.rating)}
            <span class="font-normal text-muted">(${plural(cafe.reviews.length, "review")})</span></span>
          ${cafe.externalRating ? `<span class="text-muted">${cafe.externalRating.value} ★ on ${esc(cafe.externalRating.source)} (${cafe.externalRating.count.toLocaleString()} ratings)</span>` : ""}
          ${cafe.phone ? `<a class="text-muted hover:text-accent" href="tel:${esc(cafe.phone.replace(/[^\d+]/g, ""))}">${esc(cafe.phone)}</a>` : ""}
        </div>
        <div class="info-actions">
          <button type="button" class="btn-outline save-toggle" data-action="toggle-save" data-id="${esc(cafe.id)}" aria-pressed="${saved}"
            aria-label="${saved ? "Remove" : "Save"} ${esc(cafe.name)} ${saved ? "from" : "to"} favorites">
            <svg class="w-4 h-4" aria-hidden="true"><use href="#i-heart"/></svg><span class="when-off">Save</span><span class="when-on">Saved</span>
          </button>
          <label class="visit-toggle btn-outline">
            <input type="checkbox" data-action="toggle-visit" data-id="${esc(cafe.id)}" ${visited ? "checked" : ""} />
            <span class="visit-box"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-check"/></svg></span>
            <span class="visit-label">${visited ? "Visited" : "Mark visited"}</span>
          </label>
          ${socialLinks(cafe, "lg")}
        </div>
      </header>

      <section class="info-section" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        <p class="info-lead">${esc(cafe.note || `${cafe.name} is a café in ${cafe.neighborhood || "Tagum City"}.`)}</p>
        ${chips.length ? `<ul class="flex flex-wrap gap-1.5 mt-4" aria-label="Features">${chips.map((c) => `<li class="tag-chip">${esc(c)}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="info-section" aria-labelledby="menu-title">
        <h2 id="menu-title">Menu <span class="text-xs font-semibold text-muted">₱ · prices may change</span></h2>
        ${Object.keys(menuByCat).length ? Object.entries(menuByCat).map(([cat, items]) => `
          <h3 class="menu-cat">${esc(cat)}</h3>
          <ul class="menu-list">
            ${items.map((m) => `<li><span class="menu-name">${esc(m.name)}</span><span class="menu-dots" aria-hidden="true"></span><span class="menu-price">${priceText(m)}</span></li>`).join("")}
          </ul>`).join("")
        : `<div class="photo-empty"><p class="text-sm">${esc(cafe.name)} hasn't published a menu we could check yet.
             <a class="text-accent font-bold underline" href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer">${cafe.social?.facebook ? "See their Facebook page" : "Find them on Facebook"}</a> for today's menu.</p></div>`}
      </section>

      <section class="info-section" aria-labelledby="hours-title">
        <h2 id="hours-title">Opening hours</h2>
        ${hoursTable(cafe)}
      </section>

      <section class="info-section" aria-labelledby="reviews-title">
        <h2 id="reviews-title">Reviews</h2>
        ${reviewFormHtml(cafe, user, alreadyReviewed)}
        <ul class="mt-4 space-y-3">
          ${cafe.reviews.length ? cafe.reviews.map((r) => `
            <li class="border border-line rounded-xl p-3">
              <div class="flex justify-between text-sm">
                <span class="font-bold">${esc(r.user)}</span>
                <span class="text-amber-600 dark:text-amber-400" aria-label="${r.rating} out of 5 stars">${"★".repeat(r.rating)}<span class="text-muted">${"★".repeat(5 - r.rating)}</span></span>
              </div>
              <p class="text-sm mt-1">${esc(r.text)}</p>
              <p class="text-xs text-muted mt-1">${esc(r.date)}</p>
            </li>`).join("") : `<li class="text-sm text-muted">No CafeSpot reviews yet. Be the first!</li>`}
        </ul>
      </section>

      ${cafe.sources?.length ? `<section class="text-xs text-muted pt-5">
        <p class="font-bold uppercase tracking-wider mb-1">Listing sources</p>
        <ul class="space-y-0.5">${cafe.sources.map((u) => `<li><a class="underline hover:text-accent break-all" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(new URL(u).hostname.replace(/^www\./, ""))}</a></li>`).join("")}</ul>
        <p class="mt-1">Hours and prices can change. Confirm with the café before you go.</p>
      </section>` : ""}`;

    const form = $("#review-form");
    if (form) {
        if (draft) form.text.value = draft;
        setupLiveValidation(form);
        form.addEventListener("submit", onReviewSubmit);
    }
}

function reviewFormHtml(cafe, user, alreadyReviewed) {
    if (!user) {
        return `<div class="bg-soft rounded-xl p-4 text-sm flex flex-wrap items-center justify-between gap-3">
             <span>Log in to share your experience.</span>
             <button type="button" class="btn-primary" data-action="open-login">Log in to review</button>
           </div>`;
    }
    if (alreadyReviewed) return `<p class="text-sm text-muted bg-soft rounded-xl p-4">Thanks, you've already reviewed this café.</p>`;
    return `<form id="review-form" class="space-y-3 bg-soft rounded-xl p-4" novalidate data-opened-at="${Date.now()}">
         <fieldset>
           <legend class="text-xs font-bold text-muted mb-1">Your rating</legend>
           <div class="star-rating">
             ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="rate-${n}" name="rating" value="${n}" /><label for="rate-${n}" title="${plural(n, "star")}"><span class="sr-only">${plural(n, "star")}</span><span aria-hidden="true">★</span></label>`).join("")}
           </div>
           <p class="field-error" id="review-rating-error"></p>
         </fieldset>
         <div class="field">
           <label for="review-text">Your review</label>
           <textarea id="review-text" name="text" rows="3" maxlength="500" data-validate="review" class="input" placeholder="What did you order? How was the vibe, Wi-Fi, seating?"></textarea>
           <p class="field-error" id="review-text-error"></p>
         </div>
         <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true" />
         <p class="form-error" role="alert"></p>
         <button type="submit" class="btn-primary">Submit review</button>
       </form>`;
}

/** Monday-first weekly table, today highlighted (Philippine time). */
function hoursTable(cafe) {
    const sched = getSchedule(cafe);
    if (!sched) {
        return `<p class="text-sm text-muted">Hours aren't published. <a class="text-accent font-bold underline" href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer">Check their page</a> before you go.</p>`;
    }
    const today = new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `<table class="hours-table"><tbody>${[1, 2, 3, 4, 5, 6, 0].map((d) => `
        <tr class="${d === today ? "is-today" : ""}">
          <th scope="row">${names[d]}${d === today ? " (today)" : ""}</th>
          <td>${sched[d] ? (sched[d][0] === "00:00" && sched[d][1] === "24:00" ? "Open 24 hours" : `${formatTime(sched[d][0])} – ${formatTime(sched[d][1])}`) : "Closed"}</td>
        </tr>`).join("")}</tbody></table>`;
}

/** Stamp the open café page in place (no re-render, so a half-written review survives). */
function syncDetailStamp(id, { press = false } = {}) {
    if (state.route !== "cafe" || state.detailId !== id) return;
    const slot = $(".detail-stamp-slot");
    const cafe = getCafe(id);
    if (!slot || !cafe) return;
    slot.innerHTML = getVisitedCafeIds().includes(id) ? `<div class="detail-stamp">${stampSvg(cafe, { pressed: press })}</div>` : "";
}

/* ---------------- LEFT: distance in km ---------------- */
function directionsFrom(cafe, origin) {
    const dest = cafe.coordsApprox ? `${cafe.name}, ${cafe.address}` : `${cafe.lat},${cafe.lng}`;
    const o = origin ? `&origin=${origin.lat},${origin.lng}` : "";
    return `https://www.google.com/maps/dir/?api=1${o}&destination=${encodeURIComponent(dest)}`;
}

function renderDistanceCard(cafe) {
    const el = $("#cafe-distance");
    const c = locationState.coords;
    const s = locationState.status;

    if (c) {
        const straight = distanceMeters(c, cafe);
        const r = detail.route && detail.route.cafeId === cafe.id ? detail.route : null;
        const shown = r ? r.distance : straight;
        const [num, unit] = formatKm(shown).split(" ");
        const mins = r ? Math.max(1, Math.round(r.duration / 60)) : null;
        const sub = r
            ? `by road · about ${mins} min by car · ${formatKm(straight)} in a straight line`
            : `in a straight line${detail.routeState === "loading" ? " · checking the road distance…" : ""}`;
        el.innerHTML = `
          <div class="min-w-0">
            <p class="distance-label">Distance from you</p>
            <p class="distance-value"><span>${num}</span> ${unit}</p>
            <p class="distance-sub">${esc(sub)}</p>
            ${straight > 30_000 ? `<p class="distance-sub mt-1">You seem to be outside Tagum City.</p>` : ""}
          </div>
          <div class="distance-side">
            <span class="live-pill" title="Updates as you move"><span class="live-dot"></span>Live · ±${Math.round(c.accuracy)} m</span>
            <a class="btn-primary" href="${esc(directionsFrom(cafe, c))}" target="_blank" rel="noopener noreferrer">
              <svg class="w-4 h-4" aria-hidden="true"><use href="#i-map"/></svg>Directions</a>
          </div>`;
        return;
    }

    const messages = {
        watching: { title: "Finding your location…", text: "Allow location access if your browser asks.", btn: null },
        denied: { title: "Location is blocked", text: "Allow location for this site (tap the lock icon next to the address), then try again.", btn: "Try again" },
        unavailable: { title: "Couldn't get your location", text: "Turn on location services on your device, then try again.", btn: "Try again" },
        unsupported: { title: "Distance isn't available", text: "This browser can't share your location.", btn: null },
        insecure: { title: "Distance needs a secure page", text: "Open the site with https:// to see how far this café is.", btn: null }
    };
    const m = !window.isSecureContext ? messages.insecure : messages[s] || {
        title: "How far is it from you?",
        text: "Share your location to see the distance in km. It stays on this device.",
        btn: "Use my location"
    };
    el.innerHTML = `
      <div class="min-w-0">
        <p class="distance-label">Distance from you</p>
        <p class="font-bold mt-1">${esc(m.title)}</p>
        <p class="distance-sub">${esc(m.text)}</p>
      </div>
      <div class="distance-side">
        ${m.btn ? `<button type="button" class="btn-primary" data-action="locate-detail"><svg class="w-4 h-4" aria-hidden="true"><use href="#i-locate"/></svg>${esc(m.btn)}</button>` : ""}
        <a class="btn-outline" href="${esc(directionsFrom(cafe, null))}" target="_blank" rel="noopener noreferrer">Directions</a>
      </div>`;
}

/**
 * Road distance from the free OSRM demo server (OpenStreetMap data, no API key).
 * Asked once per café, then again only after you move ROUTE_RECHECK_M metres.
 * If it fails or is slow, the straight-line distance stays on screen.
 * For heavy traffic, host your own OSRM or use a paid routing API.
 */
async function maybeFetchRoute(cafe) {
    const c = locationState.coords;
    if (!c || !cafe || typeof fetch !== "function") return;
    if (distanceMeters(c, cafe) > ROUTE_MAX_KM * 1000) return;
    if (detail.routeState === "loading") return;
    if (detail.routeTriedFrom && distanceMeters(detail.routeTriedFrom, c) < ROUTE_RECHECK_M) return;

    const cafeId = cafe.id;
    const from = { lat: c.lat, lng: c.lng };
    detail.routeTriedFrom = from;
    detail.routeState = "loading";
    renderDistanceCard(cafe);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${cafe.lng},${cafe.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`OSRM ${res.status}`);
        const data = await res.json();
        const r = data.routes && data.routes[0];
        if (!r) throw new Error("No route");
        if (state.detailId !== cafeId) return;
        detail.route = { cafeId, from, distance: r.distance, duration: r.duration, coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]) };
        detail.routeState = "ok";
    } catch {
        if (state.detailId === cafeId) { detail.route = null; detail.routeState = "failed"; }
    } finally {
        clearTimeout(timer);
    }
    if (state.detailId === cafeId && state.route === "cafe") {
        drawDetailRoute();
        renderDistanceCard(getCafe(cafeId));
    }
}

/* ---------------- LEFT: interactive map ---------------- */
function setupDetailMap(cafe) {
    const el = $("#cafe-map");
    if (typeof window.L === "undefined") {
        el.innerHTML = `<div class="h-full grid place-items-center text-sm text-muted p-6 text-center">The map couldn't load. Check your connection and refresh.</div>`;
        return;
    }
    if (!detail.map) {
        // Scroll-wheel zoom stays off until the map is clicked, so scrolling the page never gets trapped.
        detail.map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([cafe.lat, cafe.lng], 16);
        detail.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        }).addTo(detail.map);
        detail.others = L.layerGroup().addTo(detail.map);
        detail.map.on("click", () => detail.map.scrollWheelZoom.enable());
        el.addEventListener("mouseleave", () => detail.map.scrollWheelZoom.disable());
    }

    // Other cafés as small dots: tap one to jump to its page.
    detail.others.clearLayers();
    getCafes().filter((c) => c.id !== cafe.id).forEach((c) => {
        L.circleMarker([c.lat, c.lng], { radius: 6, weight: 2, color: "#ffffff", fillColor: "#057d3c", fillOpacity: 0.55 })
            .bindTooltip(c.name, { direction: "top", offset: [0, -6] })
            .on("click", () => location.replace(`#/cafe/${c.id}`)) // replace, so "Back" still returns to the list
            .addTo(detail.others);
    });

    // This café: the big pin, with its name always visible.
    if (detail.cafeMarker) detail.map.removeLayer(detail.cafeMarker);
    detail.cafeMarker = L.marker([cafe.lat, cafe.lng], {
        icon: L.divIcon({
            className: "cafe-pin is-current",
            html: `<div class="cafe-pin-inner"><svg aria-hidden="true"><use href="#i-cup"/></svg></div>`,
            iconSize: [48, 48], iconAnchor: [24, 58]
        }),
        title: cafe.name, alt: `${cafe.name} location`, zIndexOffset: 900, keyboard: false
    }).addTo(detail.map).bindTooltip(esc(cafe.name), { permanent: true, direction: "top", offset: [0, -56], className: "pin-label" });

    updateDetailUser();
    drawDetailRoute();
    fitDetailMap();
    setTimeout(() => detail.map.invalidateSize(), 80);
}

function updateDetailUser() {
    if (!detail.map) return;
    const c = locationState.coords;
    if (!c) {
        [detail.userMarker, detail.accuracy].forEach((l) => l && detail.map.removeLayer(l));
        detail.userMarker = detail.accuracy = null;
        return;
    }
    const ll = [c.lat, c.lng];
    if (!detail.userMarker) {
        detail.userMarker = L.marker(ll, {
            icon: L.divIcon({ className: "user-pin", html: `<div class="user-pin-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
            zIndexOffset: 1000, title: "You are here", alt: "Your location", keyboard: false
        }).addTo(detail.map).bindTooltip("You", { direction: "bottom", offset: [0, 12] });
        detail.accuracy = L.circle(ll, { radius: c.accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(detail.map);
    } else {
        detail.userMarker.setLatLng(ll);
        detail.accuracy.setLatLng(ll).setRadius(c.accuracy);
    }
}

/** Road route when we have one; otherwise a dashed straight line between you and the café. */
function drawDetailRoute() {
    if (!detail.map) return;
    if (detail.line) { detail.map.removeLayer(detail.line); detail.line = null; }
    const cafe = getCafe(state.detailId);
    const c = locationState.coords;
    if (!cafe || !c || distanceMeters(c, cafe) > ROUTE_MAX_KM * 1000) return;
    const r = detail.route && detail.route.cafeId === cafe.id ? detail.route : null;
    detail.line = r
        ? L.polyline(r.coords, { color: "#057d3c", weight: 5, opacity: 0.85, lineCap: "round" })
        : L.polyline([[c.lat, c.lng], [cafe.lat, cafe.lng]], { color: "#057d3c", weight: 3, opacity: 0.8, dashArray: "6 8" });
    detail.line.addTo(detail.map);
}

/** Frame the café and (if close enough) you in one view. */
function fitDetailMap() {
    const cafe = getCafe(state.detailId);
    if (!detail.map || !cafe) return;
    const c = locationState.coords;
    if (c && distanceMeters(c, cafe) < ROUTE_MAX_KM * 1000) {
        const pts = [[c.lat, c.lng], [cafe.lat, cafe.lng]];
        if (detail.route && detail.route.cafeId === cafe.id) pts.push(...detail.route.coords);
        detail.map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 17 });
        detail.fittedWithUser = true;
    } else {
        detail.map.setView([cafe.lat, cafe.lng], 16);
    }
}

/** Called on every location update while a café page is open. */
function onDetailLocation() {
    if (state.route !== "cafe" || !state.detailId) return;
    const cafe = getCafe(state.detailId);
    updateDetailUser();
    drawDetailRoute();
    if (locationState.coords && !detail.fittedWithUser) fitDetailMap();  // first fix: show both points
    if (!locationState.coords) detail.fittedWithUser = false;
    renderDistanceCard(cafe);
    maybeFetchRoute(cafe);
}

/* ---------------- LEFT: real photos + viewer ---------------- */
function renderPhotos(cafe) {
    const photos = getCafePhotos(cafe);
    detail.photos = photos;
    const el = $("#cafe-photos");
    if (!photos.length) {
        el.innerHTML = `
          <div class="dash-section-head"><h2 id="photos-title">Photos</h2></div>
          <div class="photo-empty">
            <span class="feature-icon shrink-0"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-camera"/></svg></span>
            <div class="min-w-0">
              <p class="font-bold">No photos of ${esc(cafe.name)} yet</p>
              <p class="text-sm text-muted mt-0.5">We only show real photos of the café, shared with permission. Until then, their own page has the latest.</p>
              <a class="btn-outline mt-3" href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer">
                <svg class="w-4 h-4" aria-hidden="true"><use href="#i-fb"/></svg>${cafe.social?.facebook ? "See photos on Facebook" : "Find them on Facebook"}</a>
            </div>
          </div>`;
        return;
    }
    const shown = photos.slice(0, 5);
    const extra = photos.length - shown.length;
    el.innerHTML = `
      <div class="dash-section-head"><h2 id="photos-title">Photos</h2><span class="count">${plural(photos.length, "photo")}</span></div>
      <div class="photo-grid count-${shown.length}">
        ${shown.map((p, i) => `
          <button type="button" class="photo-tile" data-photo-open="${i}" aria-label="Open photo ${i + 1} of ${photos.length}${p.alt ? `: ${esc(p.alt)}` : ""}">
            <img src="${esc(p.src)}" alt="${esc(p.alt || `${cafe.name} photo ${i + 1}`)}" loading="${i === 0 ? "eager" : "lazy"}" decoding="async" />
            ${i === shown.length - 1 && extra > 0 ? `<span class="photo-more">+${extra}</span>` : ""}
          </button>`).join("")}
      </div>
      ${photos[0].credit ? `<p class="text-xs text-muted mt-2">${esc(photos[0].credit)}</p>` : ""}`;
}

function showPhoto(i) {
    const n = detail.photos.length;
    if (!n) return;
    detail.photoIndex = (i + n) % n;
    const p = detail.photos[detail.photoIndex];
    const img = $("#photo-viewer-img");
    img.src = p.src;
    img.alt = p.alt || "";
    $("#photo-viewer-caption").textContent = [p.alt, p.credit, `${detail.photoIndex + 1} / ${n}`].filter(Boolean).join(" · ");
    $$("[data-photo-step]").forEach((b) => (b.hidden = n < 2));
}

function setupPhotoViewer() {
    const dialog = $("#photo-modal");
    dialog.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") showPhoto(detail.photoIndex + 1);
        if (e.key === "ArrowLeft") showPhoto(detail.photoIndex - 1);
    });
    let startX = null; // swipe left/right on phones
    dialog.addEventListener("pointerdown", (e) => { startX = e.clientX; });
    dialog.addEventListener("pointerup", (e) => {
        if (startX !== null && Math.abs(e.clientX - startX) > 50) showPhoto(detail.photoIndex + (e.clientX < startX ? 1 : -1));
        startX = null;
    });
    document.addEventListener("click", (e) => {
        const open = e.target.closest("[data-photo-open]");
        if (open) { showPhoto(Number(open.dataset.photoOpen)); openDialog(dialog); return; }
        const step = e.target.closest("[data-photo-step]");
        if (step) showPhoto(detail.photoIndex + Number(step.dataset.photoStep));
    });
}

/* Review form on the café page */
function onReviewSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const errorEl = $(".form-error", form);
    errorEl.textContent = "";

    if (looksLikeSpam(form)) { errorEl.textContent = "Submission blocked. Please try again."; return; }

    const rating = form.rating.value;
    const text = form.text.value;
    let ok = validateForm(form);
    const ratingCheck = validate("rating", rating);
    $("#review-rating-error").textContent = ratingCheck === true ? "" : ratingCheck;
    if (ratingCheck !== true) ok = false;
    if (!ok) return;

    if (/(https?:\/\/|www\.)/i.test(text)) { errorEl.textContent = "Links aren't allowed in reviews."; return; }

    const limit = checkRateLimit("review");
    if (!limit.ok) { errorEl.textContent = `Too many reviews. Try again in ${limit.retryIn}s.`; return; }

    try {
        addReviewToCafe(state.detailId, text, rating);
        trackEvent("review_submit", { id: state.detailId, rating: Number(rating) });
        showToast("Review submitted!");
        renderCafeDetail();
        renderAll({ announce: true });
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

/* ============================================================
 * FORM VALIDATION (real-time)
 * ============================================================ */
function fieldCheck(input) {
    const rule = input.dataset.validate;
    if (!rule) return true;
    if (rule === "confirm") {
        const pw = $(input.dataset.match || "#reg-password").value;
        return (input.value && input.value === pw) || "Passwords don't match.";
    }
    return validate(rule, input.value);
}

function showFieldResult(input, result) {
    const errEl = document.getElementById(`${input.id}-error`);
    const valid = result === true;
    input.setAttribute("aria-invalid", String(!valid));
    input.classList.toggle("is-valid", valid && input.value !== "");
    if (errEl) {
        errEl.textContent = valid ? "" : result;
        input.setAttribute("aria-describedby", errEl.id);
    }
    return valid;
}

function setupLiveValidation(form) {
    $$("[data-validate]", form).forEach((input) => {
        // Leaving an empty field untouched isn't an error yet (submit catches it). Flagging it on blur
        // would grow the bottom sheet mid-tap on phones and swallow taps on tabs/links.
        input.addEventListener("blur", () => {
            if (!input.value && !input.dataset.touched) return;
            input.dataset.touched = "1";
            showFieldResult(input, fieldCheck(input));
        });
        input.addEventListener("input", () => { if (input.dataset.touched) showFieldResult(input, fieldCheck(input)); });
    });
}

function validateForm(form) {
    let firstInvalid = null;
    $$("[data-validate]:not(:disabled)", form).forEach((input) => {
        input.dataset.touched = "1";
        if (!showFieldResult(input, fieldCheck(input)) && !firstInvalid) firstInvalid = input;
    });
    firstInvalid?.focus();
    return !firstInvalid;
}

function resetForm(form) {
    form.reset();
    $$("[data-validate]", form).forEach((i) => {
        delete i.dataset.touched;
        i.removeAttribute("aria-invalid");
        i.classList.remove("is-valid");
    });
    $$(".field-error, .form-error", form).forEach((e) => (e.textContent = ""));
}

async function withBusy(button, label, fn) {
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = label;
    try { return await fn(); }
    finally { button.disabled = false; button.innerHTML = original; }
}

/* ============================================================
 * DASHBOARD — the home page once you're logged in
 * ------------------------------------------------------------
 *  ┌ Hello card: greeting, headline, 4 stats, progress ring ┐
 *  ├ Up next: 2–4 cards picked from what you've done so far  ┤
 *  ├ Stamp collection (3/5 width) │ Badges (2/5)              ┤
 *  └ Activity history (3/5)       │ Account & security (2/5)  ┘
 * Logged out, the landing hero stays and a guest strip invites
 * people to sign up (with a peek at stamps collected as a guest).
 * ============================================================ */
const dash = { showAllStamps: false, activityLimit: 8, rendered: false, hadCoords: false };
const newBadgeIds = new Set();

const fmtDate = (iso, opts = { month: "short", day: "numeric" }) =>
    new Date(iso).toLocaleDateString("en-PH", { ...opts, timeZone: "Asia/Manila" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const manilaDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD

function dayLabel(iso) {
    const day = manilaDay(iso);
    if (day === manilaDay(Date.now())) return "Today";
    if (day === manilaDay(Date.now() - 864e5)) return "Yesterday";
    return fmtDate(iso, { weekday: "short", month: "short", day: "numeric" });
}

function greeting() {
    const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(new Date())) % 24;
    return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function initials(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const TAG_WORDS = { StudySpot: "study spots", "24/7": "24/7 cafés", FreeWiFi: "cafés with Wi-Fi", PetFriendly: "pet-friendly cafés", OutdoorSeating: "outdoor seating" };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * Recompute progress (and record newly earned badges).
 * announce = true after a user action, so a new badge gets a toast and a pop.
 */
function refreshProgress({ announce = false } = {}) {
    const p = getProgress();
    if (announce) {
        p.newlyEarned.forEach((b, i) => {
            newBadgeIds.add(b.id);
            setTimeout(() => showToast(`Badge earned: ${b.name}`), 350 + i * 400);
            trackEvent("badge_earned", { id: b.id });
        });
    }
    renderDashboard(p);
    return p;
}

/** The milestone the visit count is heading for next (First Stamp → Regular → Café Hopper → Halfway → Full Card). */
function nextVisitMilestone(p) {
    return p.badges.filter((b) => ["first-stamp", "regular", "hopper", "halfway", "full-card"].includes(b.id) && !b.earned)
        .sort((a, b) => a.goal - b.goal)[0] || null;
}

/** "Up next" cards: what to do next, based on what's done and what's left. */
function nextSteps(p) {
    const steps = [];
    const stamped = new Set(p.stamps.map((s) => s.cafe.id));
    const cafes = getCafes();
    const unstamped = cafes.filter((c) => !stamped.has(c.id));
    const isAdminUser = p.user.role === "admin";

    // 1. Account safety first: no saved recovery key = no way back in.
    if (!isAdminUser && !p.user.recoveryAcknowledged) {
        steps.push({
            tone: "warn", icon: "i-key", kicker: "Account safety", title: "Save a recovery key",
            text: "It's the only way back in if you forget your password.",
            action: `data-action="new-recovery-key"`, go: "Create a key"
        });
    }

    // 2. The closest café you haven't stamped (or turn on location to find it).
    if (unstamped.length) {
        const openNow = unstamped.filter((c) => getOpenStatus(c).isOpen === true);
        if (locationState.coords) {
            const pool = (openNow.length ? openNow : unstamped).slice().sort((a, b) => distanceTo(a) - distanceTo(b));
            const c = pool[0];
            steps.push({
                tone: "primary", icon: "i-pin", kicker: p.visitedCount ? "Closest new stamp" : "Your first stamp",
                title: c.name, text: `${formatDistance(distanceTo(c))} · ${getOpenStatus(c).label}`,
                href: `#/cafe/${c.id}`, go: "See details"
            });
        } else {
            steps.push({
                tone: "primary", icon: "i-locate", kicker: p.visitedCount ? "Find your next stamp" : "Get your first stamp",
                title: "Show cafés near me",
                text: `${plural(openNow.length, "café")} you haven't stamped ${openNow.length === 1 ? "is" : "are"} open right now.`,
                action: `data-action="locate-nearest"`, go: "Use my location"
            });
        }
    }

    // 3. Saved but never visited.
    const savedNotVisited = p.savedIds.filter((id) => !stamped.has(id)).map((id) => getCafe(id)).filter(Boolean);
    if (savedNotVisited.length) {
        const c = savedNotVisited[savedNotVisited.length - 1];
        steps.push({
            icon: "i-heart", kicker: "From your saved spots", title: c.name,
            text: savedNotVisited.length > 1 ? `Saved, not stamped yet, along with ${plural(savedNotVisited.length - 1, "other")}.` : "You saved it. Go and collect the stamp.",
            href: `#/cafe/${c.id}`, go: "Open café"
        });
    }

    // 4. Most recent visit without a review.
    const reviewed = new Set(p.reviews.map((r) => r.cafeId));
    const toReview = p.stamps.find((s) => !reviewed.has(s.cafe.id));
    if (toReview && !isAdminUser) {
        steps.push({
            icon: "i-pen", kicker: "Share your take", title: `How was ${toReview.cafe.name}?`,
            text: `${toReview.at ? `Stamped ${fmtDate(toReview.at)}. ` : ""}A short review helps other Tagum café-goers.`,
            href: `#/cafe/${toReview.cafe.id}`, go: "Write a review"
        });
    }

    // 5. The badge closest to done.
    const nextBadge = p.badges.filter((b) => !b.earned).sort((a, b) => (a.goal - a.current) - (b.goal - b.current) || b.current / b.goal - a.current / a.goal)[0];
    if (nextBadge) {
        const left = nextBadge.goal - nextBadge.current;
        steps.push({
            icon: nextBadge.icon, kicker: "Next badge", title: nextBadge.name,
            text: `${nextBadge.hint}. ${left} to go.`,
            ...(nextBadge.tag
                ? { action: `data-action="explore-tag" data-tag="${esc(nextBadge.tag)}"`, go: `Show ${TAG_WORDS[nextBadge.tag] || nextBadge.tag}` }
                : { href: "#/explore", go: "Explore cafés" })
        });
    }
    return steps.slice(0, 4);
}

function nextCard(s, i) {
    const inner = `
      <span class="next-card__top"><span class="next-card__icon"><svg class="w-4 h-4" aria-hidden="true"><use href="#${s.icon}"/></svg></span>
        <span class="next-card__kicker">${esc(s.kicker)}</span></span>
      <span class="next-card__title">${esc(s.title)}</span>
      <span class="next-card__text">${esc(s.text)}</span>
      <span class="next-card__go">${esc(s.go)}<svg class="w-4 h-4" aria-hidden="true"><use href="#i-arrow"/></svg></span>`;
    const cls = `next-card${s.tone ? ` next-card--${s.tone}` : ""}`;
    return s.href
        ? `<a class="${cls}" style="--i:${i}" href="${esc(s.href)}">${inner}</a>`
        : `<button type="button" class="${cls}" style="--i:${i}" ${s.action}>${inner}</button>`;
}

function stampsSection(p) {
    const milestone = nextVisitMilestone(p);
    const shown = dash.showAllStamps ? p.stamps : p.stamps.slice(0, 11);
    // Numbered empty slots ("4", "5", …) count up to the next milestone, 12 tiles at most.
    const target = milestone ? Math.max(milestone.goal, 5) : p.visitedCount;
    const room = Math.max(0, 12 - shown.length);
    const slotCount = dash.showAllStamps || p.stamps.length > 11 ? 0 : Math.min(Math.max(0, target - p.visitedCount), room);
    const slots = Array.from({ length: slotCount }, (_, k) => p.visitedCount + k + 1);

    const tiles = shown.map(({ cafe, at }) => `
        <a href="#/cafe/${esc(cafe.id)}" class="stamp-tile" title="${esc(cafe.name)}${at ? ` · ${fmtDate(at)}` : ""}">
          <span class="stamp-tile__ink">${stampSvg(cafe)}</span>
          <span class="stamp-tile__name">${esc(cafe.name)}</span>
        </a>`).join("")
        + slots.map((n) => `<div class="stamp-tile stamp-tile--empty" aria-hidden="true"><span class="stamp-tile__ink">${n}</span></div>`).join("");

    const more = p.stamps.length > 11
        ? `<button type="button" class="btn-outline mt-4" data-action="dash-all-stamps">${dash.showAllStamps ? "Show fewer" : `Show all ${p.stamps.length} stamps`}</button>` : "";

    return `
    <section class="feature-card lg:col-span-3" aria-labelledby="dash-stamps-title">
      <div class="dash-section-head">
        <h2 id="dash-stamps-title">Stamp collection</h2>
        <span class="count">${p.visitedCount} of ${p.total} cafés</span>
      </div>
      <div class="w-full bg-soft h-2.5 rounded-full overflow-hidden mb-5" role="progressbar" aria-label="Cafés stamped" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}">
        <div class="h-full progress-fill" style="width:${p.pct}%"></div>
      </div>
      ${p.stamps.length ? "" : `<p class="text-sm text-muted mb-4">No stamps yet. On any café, tick <strong>Mark visited</strong> and its stamp lands here with the date.</p>`}
      <div class="stamp-grid">${tiles}</div>
      ${more}
    </section>`;
}

function badgesSection(p) {
    const earned = p.badges.filter((b) => b.earned).length;
    const items = p.badges.map((b) => {
        const pct = Math.round((b.current / b.goal) * 100);
        const meta = b.earned
            ? `Earned ${b.earnedAt ? fmtDate(b.earnedAt) : ""}`
            : `${b.current} / ${b.goal}`;
        return `<li class="badge ${b.earned ? "is-earned" : "is-locked"} ${newBadgeIds.has(b.id) ? "is-new" : ""}" title="${esc(b.hint)}">
            <span class="badge__medal"><svg aria-hidden="true"><use href="#${b.icon}"/></svg></span>
            <span class="badge__name">${esc(b.name)}</span>
            <span class="badge__meta">${b.earned ? esc(meta) : `<span class="sr-only">${esc(b.hint)}: </span>${esc(meta)}`}</span>
            ${b.earned ? "" : `<span class="badge__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`}
          </li>`;
    }).join("");
    newBadgeIds.clear();
    return `
    <section class="feature-card lg:col-span-2" aria-labelledby="dash-badges-title">
      <div class="dash-section-head">
        <h2 id="dash-badges-title">Badges</h2>
        <span class="count">${earned} of ${p.badges.length} earned</span>
      </div>
      <ul class="badge-grid">${items}</ul>
    </section>`;
}

const ACTIVITY_VIEW = {
    visit: { icon: "i-check", text: (e) => `Stamped ${cafeLink(e)}` },
    save: { icon: "i-heart", text: (e) => `Saved ${cafeLink(e)}` },
    review: { icon: "i-pen", text: (e) => `Reviewed ${cafeLink(e)}${e.rating ? ` · ${"★".repeat(e.rating)}` : ""}` },
    badge: { icon: "i-medal", dot: "badge", text: (e) => `Earned the <strong>${esc(e.badgeName || "")}</strong> badge` },
    signup: { icon: "i-user", text: () => "Created your CafeSpot account" },
    login: { icon: "i-user", dot: "quiet", text: (e) => `Logged in${e.device ? ` on ${esc(e.device.toLowerCase())}` : ""}` },
    password_reset: { icon: "i-key", text: () => "Reset your password with your recovery key" },
    recovery_key: { icon: "i-key", text: () => "Created a new recovery key" }
};
function cafeLink(e) {
    const exists = e.cafeId && getCafe(e.cafeId);
    const name = esc(exists?.name || e.cafeName || "a café");
    return exists ? `<a href="#/cafe/${esc(e.cafeId)}">${name}</a>` : `<strong>${name}</strong>`;
}

function activitySection() {
    const all = getActivity().filter((e) => ACTIVITY_VIEW[e.type]);
    const list = all.slice(0, dash.activityLimit);
    let lastDay = "";
    const rows = list.map((e) => {
        const view = ACTIVITY_VIEW[e.type];
        const day = dayLabel(e.at);
        const head = day !== lastDay ? `<li class="timeline__day">${esc(day)}</li>` : "";
        lastDay = day;
        return `${head}<li class="timeline__item">
            <span class="timeline__dot ${view.dot ? `timeline__dot--${view.dot}` : ""}"><svg class="w-4 h-4" aria-hidden="true"><use href="#${view.icon}"/></svg></span>
            <p class="timeline__text">${view.text(e)}<time datetime="${esc(e.at)}">${esc(fmtTime(e.at))}</time></p>
          </li>`;
    }).join("");
    return `
    <section class="feature-card lg:col-span-3" aria-labelledby="dash-activity-title">
      <div class="dash-section-head">
        <h2 id="dash-activity-title">Activity</h2>
        <span class="count">${plural(all.length, "event")}</span>
      </div>
      ${rows ? `<ul class="timeline">${rows}</ul>` : `<p class="text-sm text-muted">Your stamps, saves, reviews and badges will show up here.</p>`}
      ${all.length > list.length ? `<button type="button" class="btn-outline mt-4" data-action="dash-more-activity">Show older activity</button>` : ""}
    </section>`;
}

function accountSection(p) {
    const u = p.user;
    const s = getSessionInfo();
    const device = !s ? "" : !s.remember ? "Logged in until you close this browser"
        : s.expiresAt ? `Stays logged in until ${fmtDate(s.expiresAt, { month: "short", day: "numeric", year: "numeric" })}`
            : "Stays logged in on this device until you log out";
    const isAdminUser = u.role === "admin";
    const usesKeys = AUTH_MODE.recovery === "recovery-key" && !isAdminUser;
    return `
    <section class="feature-card lg:col-span-2" aria-labelledby="dash-account-title">
      <div class="dash-section-head"><h2 id="dash-account-title">Account</h2></div>
      <div class="flex items-center gap-3">
        <span class="avatar w-11 h-11 text-base">${esc(initials(u.name))}</span>
        <span class="min-w-0"><span class="block font-bold truncate">${esc(u.name)}</span><span class="block text-sm text-muted truncate">${esc(u.handle)}</span></span>
      </div>
      <dl class="account-list mt-4">
        <div><dt>Email</dt><dd>${esc(u.email)}</dd></div>
        ${u.createdAt ? `<div><dt>Member since</dt><dd>${esc(fmtDate(u.createdAt, { month: "long", year: "numeric" }))}</dd></div>` : ""}
        <div><dt>This device</dt><dd>${esc(device)}</dd></div>
        ${!usesKeys ? "" : `<div><dt>Recovery key</dt><dd>${u.recoveryAcknowledged
        ? `<span class="text-accent">Saved</span>`
        : `<span class="text-amber-700 dark:text-amber-300">Not saved yet</span>`}</dd></div>`}
      </dl>
      <div class="flex flex-wrap gap-2 mt-5">
        ${isAdminUser ? `<a href="#/admin" class="btn-outline">Admin dashboard</a>` : !usesKeys ? "" : `<button type="button" class="btn-outline" data-action="new-recovery-key"><svg class="w-4 h-4" aria-hidden="true"><use href="#i-key"/></svg>New recovery key</button>`}
        <button type="button" class="btn-outline" data-action="logout">Log out</button>
      </div>
    </section>`;
}

function helloSection(p) {
    const first = p.user.name.split(/\s+/)[0];
    const milestone = nextVisitMilestone(p);
    const earned = p.badges.filter((b) => b.earned).length;
    const headline = p.visitedCount === 0
        ? "Your stamp card is ready."
        : p.visitedCount >= p.total ? "Every café in Tagum, stamped." : `${p.visitedCount} of ${p.total} Tagum cafés stamped.`;
    const sub = p.visitedCount === 0
        ? "Visit a café, tick “Mark visited”, and its stamp lands here."
        : milestone ? `${plural(milestone.goal - milestone.current, "more café", "more cafés")} to earn <strong>${esc(milestone.name)}</strong>.` : "You've earned every stamp milestone.";
    return `
    <section class="hero dash-hello relative overflow-hidden rounded-3xl text-white" aria-labelledby="dash-title">
      <div class="relative z-10 flex flex-col-reverse sm:flex-row sm:items-center gap-5 sm:gap-8">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold uppercase tracking-widest text-emerald-100">${esc(greeting())}, ${esc(first)}</p>
          <h1 id="dash-title" class="mt-2 text-2xl md:text-4xl font-extrabold leading-tight tracking-tight">${esc(headline)}</h1>
          <p class="mt-2 text-emerald-50">${sub}</p>
          <dl class="dash-stats">
            <div class="dash-stat"><dt>Stamps</dt><dd>${p.visitedCount}</dd></div>
            <div class="dash-stat"><dt>Badges</dt><dd>${earned}<span class="text-sm font-semibold text-emerald-100">/${p.badges.length}</span></dd></div>
            <div class="dash-stat"><dt>Saved</dt><dd>${p.savedIds.length}</dd></div>
            <div class="dash-stat"><dt>Reviews</dt><dd>${p.reviews.length}</dd></div>
          </dl>
        </div>
        <div class="progress-ring" role="img" aria-label="${p.pct}% of Tagum cafés stamped">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="progress-ring__track" cx="60" cy="60" r="52"/>
            <circle class="progress-ring__fill ${p.pct === 0 ? "is-zero" : ""}" cx="60" cy="60" r="52" pathLength="100" style="--pct:${p.pct}"/>
          </svg>
          <div class="progress-ring__label"><span class="progress-ring__num">${p.pct}%</span><span class="progress-ring__sub">${p.visitedCount} / ${p.total}</span></div>
        </div>
      </div>
      <div class="hero-blob hero-blob-1" aria-hidden="true"></div>
      <div class="hero-blob hero-blob-2" aria-hidden="true"></div>
    </section>`;
}

function renderDashboard(p = getProgress()) {
    const dashEl = $("#home-dashboard");
    const guestEl = $("#home-guest");
    if (!dashEl) return;
    const signedIn = !!p.user;
    dashEl.classList.toggle("hidden", !signedIn);
    guestEl.classList.toggle("hidden", signedIn);
    if (!signedIn) {
        dashEl.innerHTML = "";
        dash.rendered = false;
        renderGuestProgress(p);
        return;
    }
    const steps = nextSteps(p);
    dashEl.classList.toggle("dash-static", dash.rendered); // entrance animations only on first paint
    dashEl.innerHTML = `
      ${helloSection(p)}
      ${steps.length ? `<section class="dash-section" aria-labelledby="dash-next-title">
        <div class="dash-section-head"><h2 id="dash-next-title">Up next</h2>
          <a href="#/explore" class="text-sm font-bold text-accent hover:underline">All cafés →</a></div>
        <div class="next-grid">${steps.map(nextCard).join("")}</div>
      </section>` : ""}
      <div class="grid lg:grid-cols-5 gap-5 mt-8">${stampsSection(p)}${badgesSection(p)}</div>
      <div class="grid lg:grid-cols-5 gap-5 mt-5">${activitySection()}${accountSection(p)}</div>`;
    dash.rendered = true;
}

/** Logged out: a strip under the hero that sells the dashboard (and shows guest stamps if any). */
function renderGuestProgress(p) {
    const el = $("#home-guest-progress");
    if (!el) return;
    const n = p.visitedCount;
    const peek = p.stamps.slice(0, 3).map(({ cafe }) => `<span>${stampSvg(cafe)}</span>`).join("");
    el.innerHTML = `
      <div class="feature-card guest-strip">
        ${n ? `<div class="guest-strip__stamps" aria-hidden="true">${peek}</div>`
        : `<span class="feature-icon"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-medal"/></svg></span>`}
        <div class="flex-1 min-w-[14rem]">
          <h2 class="font-bold">${n ? `You've collected ${plural(n, "stamp")} as a guest` : "Collect stamps, earn badges"}</h2>
          <p class="text-sm text-muted mt-1">${n
        ? "Create an account to keep them under your name, unlock badges and see your café history."
        : "A free account gives you a dashboard: every café you've stamped, 10 badges to earn and what to try next."}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" data-action="open-auth" data-tab="register">Create free account</button>
          <button type="button" class="btn-outline" data-action="open-auth" data-tab="login">Log in</button>
        </div>
      </div>`;
}

/* ============================================================
 * AUTH UI — one dialog, five panels
 *   login     email/handle + password, "Keep me logged in", Continue-as chips
 *   register  name, email, handle, password (+ strength), confirm, terms
 *   forgot    step 1 who are you → step 2 recovery key + new password
 *             (or "send reset link" when AUTH_MODE.recovery = "email-link")
 *   key       shows a recovery key once: copy / download / "I've saved it"
 *   rekey     signed-in users make a replacement key (password required)
 * Every async call goes through db.js, so switching to Firebase or your own
 * API only changes db.js / auth-firebase.js, never this UI.
 * ============================================================ */
const AUTH_PANELS = { login: "#login-form", register: "#register-form", forgot: "#forgot-form", key: "#key-panel", rekey: "#rekey-form" };
const AUTH_COPY = {
    login: ["Welcome back", "Log in to see your stamps, badges and history."],
    register: ["Create your account", "Free. Keeps your stamps, badges and café history together."],
    forgot: ["Reset your password", AUTH_MODE.recovery === "email-link"
        ? "Enter your account's email and we'll send you a link to choose a new password."
        : "Use the recovery key you saved when you created your account."],
    key: ["Save your recovery key", "You'll need it if you ever forget your password. It won't be shown again."],
    rekey: ["New recovery key", "Confirm it's you to make a replacement key."]
};
let authPanel = "login";
let pendingKey = null; // recovery key currently on screen (never stored anywhere)
let lastUserId = null;

function showAuthPanel(panel, copy = AUTH_COPY[panel]) {
    authPanel = panel;
    Object.entries(AUTH_PANELS).forEach(([name, sel]) => $(sel).classList.toggle("hidden", name !== panel));
    const isTab = panel === "login" || panel === "register";
    $("#auth-tabs").classList.toggle("hidden", !isTab);
    $$("[data-auth-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.authTab === panel)));
    $("#auth-back").classList.toggle("hidden", panel !== "forgot");
    $("#auth-title").textContent = copy[0];
    $("#auth-subtitle").textContent = copy[1];
    const form = $(AUTH_PANELS[panel]);
    if (form.tagName === "FORM") form.dataset.openedAt = String(Date.now());
    if (panel === "login") renderKnownAccounts();
    if (panel === "forgot") setForgotStep("identify");
    const focusMap = { login: getKnownAccounts().length ? null : "#login-identifier", register: "#reg-name", forgot: "#forgot-identifier", rekey: "#rekey-password", key: "#key-ack" };
    setTimeout(() => { const f = focusMap[panel] && $(focusMap[panel]); f?.focus(); }, 60);
}

function openAuth(panel = "login") {
    showAuthPanel(panel);
    openDialog($("#auth-modal"));
}

/* ---- "Continue as …" (accounts that ticked "Keep me logged in" on this device) ---- */
function renderKnownAccounts() {
    const list = getKnownAccounts();
    const box = $("#known-accounts");
    box.innerHTML = list.length ? `
      <p class="text-xs font-bold uppercase tracking-wider text-muted">Accounts on this device</p>
      ${list.map((a) => `
        <div class="known-account">
          <button type="button" class="known-account__use" data-known-use="${esc(a.email)}">
            <span class="avatar">${esc(initials(a.name))}</span>
            <span class="min-w-0"><span class="block font-bold truncate">${esc(a.name)}</span>
              <span class="block text-xs text-muted truncate">${esc(a.handle)} · ${esc(maskEmail(a.email))}</span></span>
          </button>
          <button type="button" class="known-account__forget" data-known-forget="${esc(a.id)}" aria-label="Remove ${esc(a.name)} from this device" title="Remove from this device">
            <svg class="w-4 h-4" aria-hidden="true"><use href="#i-x"/></svg>
          </button>
        </div>`).join("")}
      <p class="or-divider">or use another account</p>` : "";
}

/* ---- Forgot-password steps ---- */
function setForgotStep(step) {
    const form = $("#forgot-form");
    form.dataset.step = step;
    $$("[data-step-panel]", form).forEach((p) => {
        const hidden = p.dataset.stepPanel !== step;
        p.classList.toggle("hidden", hidden);
        $$("input", p).forEach((i) => (i.disabled = hidden)); // hidden steps skip validation
    });
    const order = ["identify", "verify", "done"];
    const cur = step === "sent" ? 2 : order.indexOf(step);
    $$("[data-step-dot]", form).forEach((li) => {
        const i = order.indexOf(li.dataset.stepDot);
        if (i === cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
        li.classList.toggle("is-done", i < cur);
    });
    const emailLink = AUTH_MODE.recovery === "email-link";
    $("#forgot-submit").textContent = step === "identify" ? (emailLink ? "Send reset link" : "Continue")
        : step === "verify" ? "Reset password" : "Back to log in";
    $(".form-error", form).textContent = "";
}

/* ---- Recovery key panel ---- */
function showRecoveryKey(key, copy) {
    pendingKey = key;
    $("#key-value").textContent = key;
    $("#key-ack").checked = false;
    $("#key-done").disabled = true;
    showAuthPanel("key", copy || AUTH_COPY.key);
}

function downloadRecoveryKey() {
    const u = getCurrentUser();
    const text = [
        "CafeSpot Tagum: account recovery key",
        "",
        `Account:  ${u ? `${u.name} (${u.handle}, ${u.email})` : ""}`,
        `Key:      ${pendingKey}`,
        `Created:  ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        "",
        "Forgot your password? Log In → Forgot password? → enter this key.",
        "Each key works once. Keep this file private."
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "cafespot-recovery-key.txt" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyRecoveryKey(btn) {
    try {
        await navigator.clipboard.writeText(pendingKey);
    } catch {
        // Older browsers / insecure context: select the text so the user can copy it.
        const range = document.createRange();
        range.selectNodeContents($("#key-value"));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        showToast("Key selected. Press Ctrl+C (or long-press → Copy).", "info", 4000);
        return;
    }
    const label = btn.lastChild;
    const before = label.textContent;
    label.textContent = "Copied";
    setTimeout(() => (label.textContent = before), 1600);
}

function updatePasswordMeter(input) {
    const bar = $(input.dataset.meter);
    if (!bar) return;
    const v = input.value;
    const score = [v.length >= 8, /[A-Z]/.test(v), /[a-z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v) || v.length >= 12].filter(Boolean).length;
    const colors = ["#dc2626", "#dc2626", "#f59e0b", "#f59e0b", "#16a34a", "#057d3c"];
    bar.style.width = `${(score / 5) * 100}%`;
    bar.style.backgroundColor = colors[score];
}

function welcomeToast(user, merged, verb) {
    const first = user.name.split(/\s+/)[0];
    const extra = merged?.stamps ? ` ${plural(merged.stamps, "guest stamp")} moved into your account.` : "";
    showToast(`${verb}, ${first}!${extra}`, "success", extra ? 4200 : 2800);
}

function setupAuthUI() {
    const loginForm = $("#login-form");
    const registerForm = $("#register-form");
    const forgotForm = $("#forgot-form");
    const rekeyForm = $("#rekey-form");
    [loginForm, registerForm, forgotForm, rekeyForm].forEach(setupLiveValidation);

    // Hide whichever recovery copy doesn't apply to this backend.
    $$("[data-recovery]").forEach((el) => (el.hidden = el.dataset.recovery !== AUTH_MODE.recovery));
    if (AUTH_MODE.recovery === "email-link") {
        // Email-based backends sign in and reset by email address only.
        $('[data-step-dot="verify"]').textContent = "Check email";
        $('label[for="login-identifier"]').textContent = "Email";
        $('label[for="forgot-identifier"]').textContent = "Email on your account";
        ["#login-identifier", "#forgot-identifier"].forEach((sel) => {
            const input = $(sel);
            input.dataset.validate = "email"; input.type = "email"; input.autocomplete = "email"; input.placeholder = "you@email.com";
        });
    }

    $("#auth-login-btn").addEventListener("click", () => openAuth("login"));
    $$("[data-auth-tab]").forEach((b) => b.addEventListener("click", () => showAuthPanel(b.dataset.authTab)));
    $("#auth-back").addEventListener("click", () => showAuthPanel("login"));

    const modal = $("#auth-modal");
    modal.addEventListener("click", (e) => {
        const go = e.target.closest("[data-auth-go]");
        if (go) {
            const typed = $("#login-identifier").value.trim();
            showAuthPanel(go.dataset.authGo);
            if (go.dataset.authGo === "forgot" && typed) $("#forgot-identifier").value = typed;
            return;
        }
        const toggle = e.target.closest("[data-pw-toggle]");
        if (toggle) {
            const input = toggle.parentElement.querySelector("input");
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            toggle.setAttribute("aria-pressed", String(show));
            toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
            toggle.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
            input.focus();
            return;
        }
        const use = e.target.closest("[data-known-use]");
        if (use) {
            $("#login-identifier").value = use.dataset.knownUse;
            $$(".known-account").forEach((k) => k.classList.toggle("is-selected", k.contains(use)));
            showFieldResult($("#login-identifier"), true);
            $("#login-password").focus();
            return;
        }
        const forget = e.target.closest("[data-known-forget]");
        if (forget) {
            forgetKnownAccount(forget.dataset.knownForget);
            renderKnownAccounts();
            showToast("Removed from this device. The account itself still exists.", "info");
            return;
        }
        const keyBtn = e.target.closest("[data-key-action]");
        if (keyBtn) {
            if (keyBtn.dataset.keyAction === "copy") copyRecoveryKey(keyBtn);
            else downloadRecoveryKey();
        }
    });

    // Strength meters + keep "confirm" fields honest while typing
    $$("[data-meter]", modal).forEach((input) => input.addEventListener("input", () => {
        updatePasswordMeter(input);
        $$(`[data-match="#${input.id}"]`).forEach((c) => { if (c.dataset.touched) showFieldResult(c, fieldCheck(c)); });
    }));

    /* ---------- Log in ---------- */
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorEl = $(".form-error", loginForm);
        errorEl.textContent = "";
        if (!validateForm(loginForm)) return;
        if (looksLikeSpam(loginForm)) { errorEl.textContent = "Submission blocked. Please try again."; return; }
        const limit = checkRateLimit("login");
        if (!limit.ok) { errorEl.textContent = `Too many attempts. Try again in ${limit.retryIn}s.`; return; }

        await withBusy($('button[type="submit"]', loginForm), "Logging in…", async () => {
            try {
                const { user, merged } = await loginUser(loginForm.identifier.value, loginForm.password.value, { remember: loginForm.remember.checked });
                trackEvent("login", { role: user.role, remember: loginForm.remember.checked });
                closeDialog(modal);
                resetForm(loginForm);
                welcomeToast(user, merged, "Welcome back");
                renderAll({ announce: true });
                if (state.detailId) renderCafeDetail();
                if (user.role === "admin") navigate("admin");
            } catch (err) {
                errorEl.textContent = err.message;
                loginForm.password.select();
                trackEvent("login_failed");
            }
        });
    });

    /* ---------- Sign up ---------- */
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorEl = $(".form-error", registerForm);
        errorEl.textContent = "";
        let ok = validateForm(registerForm);
        const agree = $("#reg-agree");
        $("#reg-agree-error").textContent = agree.checked ? "" : "Please accept the Terms and Privacy Policy.";
        if (!agree.checked) ok = false;
        if (!ok) return;
        if (looksLikeSpam(registerForm)) { errorEl.textContent = "Submission blocked. Please try again."; return; }
        const limit = checkRateLimit("register");
        if (!limit.ok) { errorEl.textContent = `Too many sign-ups. Try again in ${limit.retryIn}s.`; return; }

        await withBusy($('button[type="submit"]', registerForm), "Creating account…", async () => {
            try {
                const f = registerForm;
                const { user, recoveryKey, merged } = await registerUser({
                    name: f.name.value, email: f.email.value, handle: f.handle.value, password: f.password.value, remember: f.remember.checked
                });
                trackEvent("sign_up");
                resetForm(registerForm);
                $("#pw-meter-bar").style.width = "0";
                welcomeToast(user, merged, "Account created. Welcome");
                renderAll({ announce: true });
                if (state.detailId) renderCafeDetail();
                if (recoveryKey) showRecoveryKey(recoveryKey); // local mode: dialog stays open on the key panel
                else closeDialog(modal);                       // Firebase: recovery is by email, nothing to save
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    });

    /* ---------- Forgot password ---------- */
    forgotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const step = forgotForm.dataset.step;
        const errorEl = $(".form-error", forgotForm);
        errorEl.textContent = "";
        if (step === "sent") { showAuthPanel("login"); return; }
        if (!validateForm(forgotForm)) return;
        if (looksLikeSpam(forgotForm)) { errorEl.textContent = "Submission blocked. Please try again."; return; }

        if (step === "identify") {
            if (AUTH_MODE.recovery === "email-link") {
                const limit = checkRateLimit("recover");
                if (!limit.ok) { errorEl.textContent = `Too many requests. Try again in ${limit.retryIn}s.`; return; }
                await withBusy($("#forgot-submit"), "Sending…", async () => {
                    try { await sendPasswordResetLink(forgotForm.identifier.value.trim()); } catch (err) { console.warn(err); }
                });
                setForgotStep("sent"); // same message whether or not the account exists
            } else {
                // Don't reveal whether the account exists; the key check does that safely.
                setForgotStep("verify");
                setTimeout(() => $("#forgot-key").focus(), 30);
            }
            return;
        }

        // step === "verify"
        const limit = checkRateLimit("recover");
        if (!limit.ok) { errorEl.textContent = `Too many attempts. Try again in ${limit.retryIn}s.`; return; }
        await withBusy($("#forgot-submit"), "Checking key…", async () => {
            try {
                const { user, recoveryKey } = await resetPasswordWithRecoveryKey({
                    identifier: forgotForm.identifier.value,
                    recoveryKey: forgotForm.recoveryKey.value,
                    newPassword: forgotForm.password.value,
                    remember: forgotForm.remember.checked
                });
                trackEvent("password_reset");
                resetForm(forgotForm);
                $("#forgot-meter-bar").style.width = "0";
                showToast(`Password changed. You're logged in, ${user.name.split(/\s+/)[0]}.`);
                renderAll({ announce: true });
                showRecoveryKey(recoveryKey, ["Password changed", "Your old recovery key no longer works. Save this new one in its place."]);
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    });

    /* ---------- Recovery key panel ---------- */
    $("#key-ack").addEventListener("change", (e) => ($("#key-done").disabled = !e.target.checked));
    $("#key-done").addEventListener("click", () => {
        acknowledgeRecoveryKey();
        pendingKey = null;
        closeDialog(modal);
        showToast("Recovery key saved. You're all set.");
        if (state.route !== "home") navigate("");
        renderAll();
    });

    /* ---------- New recovery key ---------- */
    rekeyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorEl = $(".form-error", rekeyForm);
        errorEl.textContent = "";
        if (!validateForm(rekeyForm)) return;
        const limit = checkRateLimit("rekey");
        if (!limit.ok) { errorEl.textContent = `Too many attempts. Try again in ${limit.retryIn}s.`; return; }
        await withBusy($('button[type="submit"]', rekeyForm), "Checking…", async () => {
            try {
                const key = await regenerateRecoveryKey(rekeyForm.password.value);
                resetForm(rekeyForm);
                renderAll();
                showRecoveryKey(key, ["Your new recovery key", "Your previous key has stopped working. Save this one."]);
            } catch (err) {
                errorEl.textContent = err.message;
            }
        });
    });

    // Closing the dialog: forget the on-screen key, nudge if it wasn't confirmed, reset the reset flow.
    modal.addEventListener("close", () => {
        if (authPanel === "key" && pendingKey) {
            showToast("Recovery key not confirmed. You can make a new one from your dashboard.", "info", 4500);
            renderAll();
        }
        pendingKey = null;
        $("#key-value").textContent = "";
        resetForm(forgotForm);
        resetForm(rekeyForm);
        setForgotStep("identify");
    });

    /* ---------- Log out ---------- */
    $("#auth-logout-btn").addEventListener("click", () => {
        trackEvent("logout");
        logoutUser();
        showToast("You've been logged out.", "info");
        if (state.route === "admin") navigate("");
        renderAll();
    });

    /* ---------- Session sync across tabs + expiry while the page is open ---------- */
    window.addEventListener("storage", (e) => {
        if (e.key && !e.key.startsWith("cafespot_")) return;
        const was = lastUserId;
        renderAll();
        if (was && !getCurrentUser()) showToast("You were logged out in another tab.", "info");
    });
    setInterval(() => {
        if (lastUserId && !getCurrentUser()) {
            showToast("Your session ended. Please log in again.", "info", 4000);
            renderAll();
        }
    }, 60_000);
}

/* ============================================================
 * ADD / EDIT CAFE
 * ============================================================ */
function openCafeForm(cafeId = null) {
    if (!getCurrentUser()) {
        showToast("Log in to add a cafe spot.", "info");
        openAuth("login");
        return;
    }
    const form = $("#cafe-form");
    resetForm(form);
    $("#cafe-form-title").textContent = cafeId ? "Edit Cafe" : "Add New Cafe Spot";
    form.id.value = cafeId || "";
    form.dataset.keepHours = "";
    $("#cafe-hours-hint").textContent = "";
    if (cafeId) {
        const c = getCafe(cafeId);
        form.name.value = c.name;
        form.address.value = c.address;
        form.neighborhood.value = c.neighborhood || "";
        // Per-day schedules prefill with the first open day; they're kept unless the times are changed.
        const sched = getSchedule(c);
        const first = sched?.find(Boolean) || ["08:00", "22:00"];
        form.open.value = first[0] === "24:00" ? "00:00" : first[0];
        form.close.value = first[1] === "24:00" ? "23:59" : first[1];
        form.dataset.keepHours = c.hours?.days ? `${form.open.value}|${form.close.value}` : "";
        $("#cafe-hours-hint").textContent = c.hours?.days ? `Current schedule: ${formatHours(c)}. It's kept unless you change the times.` : "";
        form.lat.value = c.lat;
        form.lng.value = c.lng;
        form.facebook.value = c.social?.facebook || "";
        form.instagram.value = c.social?.instagram ? "@" + c.social.instagram : "";
        form.phone.value = c.phone || "";
        form.hoursUnknown.checked = !c.hours;
        $$('input[name="tags"]', form).forEach((t) => (t.checked = c.tags.includes(t.value)));
    }
    openDialog($("#cafe-form-modal"));
}

function setupCafeForm() {
    const form = $("#cafe-form");
    $("#cafe-tag-options").innerHTML = ALL_TAGS.map((t, i) =>
        `<label class="tag-option"><input type="checkbox" name="tags" value="${esc(t)}" id="cafe-tag-${i}" /><span>${esc(t)}</span></label>`
    ).join("");
    setupLiveValidation(form);

    $("#open-add-cafe-btn").addEventListener("click", () => openCafeForm());
    $("#admin-add-btn").addEventListener("click", () => openCafeForm());

    $("#cafe-use-location").addEventListener("click", () => {
        if (locationState.coords) {
            form.lat.value = locationState.coords.lat.toFixed(5);
            form.lng.value = locationState.coords.lng.toFixed(5);
            showFieldResult(form.lat, fieldCheck(form.lat));
            showFieldResult(form.lng, fieldCheck(form.lng));
        } else {
            startLocationWatch();
            showToast("Getting your location — tap again in a moment.", "info");
        }
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const errorEl = $(".form-error", form);
        errorEl.textContent = "";
        if (looksLikeSpam(form)) { errorEl.textContent = "Submission blocked. Please try again."; return; }
        if (!validateForm(form)) return;

        const tags = $$('input[name="tags"]:checked', form).map((t) => t.value);
        const is247 = tags.includes("24/7");
        if (!is247 && !form.hoursUnknown.checked && form.open.value === form.close.value) {
            errorEl.textContent = "Opening and closing times can't be the same (tick 24/7 for round-the-clock cafes).";
            return;
        }
        const editingId = form.id.value;
        const duplicate = getCafes().some((c) => c.name.trim().toLowerCase() === form.name.value.trim().toLowerCase() && c.id !== editingId);
        if (duplicate) { errorEl.textContent = "A cafe with this name is already listed."; return; }

        const limit = checkRateLimit(editingId ? "cafe_edit" : "cafe_submit");
        if (!limit.ok) { errorEl.textContent = `Slow down! Try again in ${limit.retryIn}s.`; return; }

        const data = {
            name: form.name.value, address: form.address.value, neighborhood: form.neighborhood.value,
            open: form.open.value, close: form.close.value === "23:59" ? "24:00" : form.close.value,
            lat: form.lat.value, lng: form.lng.value, tags,
            hoursUnknown: form.hoursUnknown.checked,
            keepHours: !!form.dataset.keepHours && !form.hoursUnknown.checked && !is247 &&
                form.dataset.keepHours === `${form.open.value}|${form.close.value}`,
            facebook: form.facebook.value, instagram: form.instagram.value, phone: form.phone.value
        };
        try {
            if (editingId) {
                updateCafe(editingId, data);
                trackEvent("cafe_edit", { id: editingId });
                showToast("Cafe updated!");
            } else {
                const c = addCafe(data);
                trackEvent("cafe_add", { id: c.id });
                showToast("Cafe added to the directory!");
            }
            closeDialog($("#cafe-form-modal"));
            renderAll();
        } catch (err) {
            errorEl.textContent = err.message;
        }
    });
}

/* ============================================================
 * ADMIN DASHBOARD
 * ============================================================ */
function renderAdmin() {
    const allowed = isAdmin();
    $("#admin-locked").classList.toggle("hidden", allowed);
    $("#admin-content").classList.toggle("hidden", !allowed);
    if (!allowed) return;

    const cafes = getCafes();
    const users = getUsers();
    const events = getAnalyticsEvents();
    const reviews = cafes.reduce((n, c) => n + (c.reviews?.length || 0), 0);
    const stats = [["Cafes listed", cafes.length], ["Registered users", users.length], ["Total reviews", reviews], ["Logins recorded", getLoginLog().length]];
    $("#admin-stats").innerHTML = stats.map(([label, n]) =>
        `<div class="stat-card"><p class="text-xs font-bold uppercase tracking-wider text-muted">${label}</p><p class="text-3xl font-extrabold text-accent mt-1">${n}</p></div>`
    ).join("");

    $("#admin-cafe-rows").innerHTML = cafes.map((c) => `
      <tr>
        <td><span class="font-semibold">${esc(c.name)}</span>${c.social?.facebook ? ` <a href="${esc(c.social.facebook)}" target="_blank" rel="noopener noreferrer" class="text-xs text-accent underline">FB</a>` : ""}${c.addedBy ? ` <span class="text-xs italic text-muted">by ${esc(maskHandle(c.addedBy))}</span>` : ""}</td>
        <td class="text-muted">${esc(c.neighborhood || "—")}</td>
        <td class="text-muted whitespace-nowrap">${esc(formatHours(c))}</td>
        <td>${starsText(c.rating)}</td>
        <td class="text-right whitespace-nowrap">
          <button type="button" class="mini-btn" data-action="edit-cafe" data-id="${esc(c.id)}">Edit</button>
          <button type="button" class="mini-btn danger" data-action="delete-cafe" data-id="${esc(c.id)}">Delete</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="5" class="text-center text-muted py-6">Directory is empty.</td></tr>`;

    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
    $("#admin-user-rows").innerHTML = users.map((u) => `
      <tr>
        <td class="font-semibold">${esc(maskName(u.name))}</td>
        <td class="font-mono text-xs">${esc(maskEmail(u.email))}</td>
        <td class="font-mono text-xs">${esc(maskHandle(u.handle))}</td>
        <td class="text-muted">${fmtDate(u.createdAt)}</td>
        <td class="text-muted">${fmtDate(u.lastLoginAt)}</td>
        <td class="text-right"><button type="button" class="mini-btn danger" data-action="delete-user" data-id="${esc(u.id)}">Remove</button></td>
      </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted py-6">No registered users yet.</td></tr>`;

    const logins = getLoginLog();
    const fmtTime = (iso) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    $("#admin-login-rows").innerHTML = logins.slice(0, 50).map((l) => `
      <tr>
        <td class="whitespace-nowrap text-muted">${esc(fmtTime(l.at))}</td>
        <td class="font-semibold">${esc(maskName(l.name))}</td>
        <td class="font-mono text-xs">${esc(maskHandle(l.handle))}</td>
        <td class="font-mono text-xs">${esc(maskEmail(l.email))}</td>
        <td><span class="tag-chip">${esc(l.role)}</span></td>
        <td class="text-muted">${esc(l.method)} · ${esc(l.device || "—")}</td>
      </tr>`).join("") || `<tr><td colspan="6" class="text-center text-muted py-6">No logins recorded yet.</td></tr>`;
    $("#admin-login-count").textContent = `${logins.length} total`;

    $("#admin-events").innerHTML = events.slice(-15).reverse().map((ev) =>
        `<li><span class="text-accent">${esc(ev.at.slice(11, 19))}</span> ${esc(ev.name)} <span class="opacity-70">${esc(JSON.stringify(ev.props))}</span></li>`
    ).join("") || `<li>No events yet. Events are only recorded when analytics cookies are accepted.</li>`;
}

/* ============================================================
 * MAP + LIVE GEOLOCATION
 * ============================================================ */
let map = null;
let cafeLayer = null;
let userMarker = null;
let accuracyCircle = null;
let hasCenteredOnUser = false;

function ensureMap() {
    if (map) { setTimeout(() => map.invalidateSize(), 120); return; }
    const el = $("#map-container");
    if (typeof window.L === "undefined") {
        el.innerHTML = `<div class="h-full grid place-items-center text-sm text-muted p-6 text-center">The map couldn't load. Check your connection and refresh.</div>`;
        return;
    }
    map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView(CONFIG.TAGUM_CENTER, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    cafeLayer = L.layerGroup().addTo(map);
    updateMapMarkers();
    updateUserMarker();
    setTimeout(() => map.invalidateSize(), 120);
}

function cafeIcon(isOpen) {
    return L.divIcon({
        className: `cafe-pin${isOpen === true ? "" : isOpen === null ? " unknown" : " closed"}`,
        html: `<div class="cafe-pin-inner"><svg aria-hidden="true"><use href="#i-cup"/></svg></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 46],
        popupAnchor: [0, -42]
    });
}

function popupHtml(cafe) {
    const status = getOpenStatus(cafe);
    const dist = distanceTo(cafe);
    return `<div class="p-3.5">
      <p class="font-bold text-base leading-tight">${esc(cafe.name)}</p>
      <p class="text-xs opacity-75 mb-1">${esc(cafe.address)}</p>
      <p class="text-xs font-semibold">${status.isOpen === null ? "⚪" : status.isOpen ? "🟢" : "🔴"} ${esc(status.label)}</p>
      <p class="text-xs font-semibold">★ ${starsText(cafe.rating)}${dist != null ? ` · ${formatDistance(dist)}` : ""}</p>
      <p class="mt-2 flex gap-3 text-xs font-bold">
        <a href="#/cafe/${esc(cafe.id)}" style="color:#057d3c">View details →</a>
        <a href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8">${cafe.social?.facebook ? "Facebook" : "Find on FB"}</a>
      </p>
    </div>`;
}

function updateMapMarkers() {
    if (!map || !cafeLayer) return;
    cafeLayer.clearLayers();
    getCafes().forEach((cafe) => {
        const m = L.marker([cafe.lat, cafe.lng], { icon: cafeIcon(getOpenStatus(cafe).isOpen), title: cafe.name, alt: `${cafe.name} map marker`, keyboard: true });
        m.bindPopup(() => popupHtml(cafe));
        m.cafeId = cafe.id;
        cafeLayer.addLayer(m);
    });
}

function updateUserMarker() {
    if (!map) return;
    const c = locationState.coords;
    if (!c) {
        if (userMarker) { map.removeLayer(userMarker); map.removeLayer(accuracyCircle); userMarker = accuracyCircle = null; }
        return;
    }
    const latlng = [c.lat, c.lng];
    if (!userMarker) {
        userMarker = L.marker(latlng, {
            icon: L.divIcon({ className: "user-pin", html: `<div class="user-pin-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
            zIndexOffset: 1000, title: "You are here", alt: "Your current location"
        }).addTo(map).bindTooltip("You are here", { direction: "top", offset: [0, -12] });
        accuracyCircle = L.circle(latlng, { radius: c.accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.08 }).addTo(map);
    } else {
        userMarker.setLatLng(latlng);
        accuracyCircle.setLatLng(latlng).setRadius(c.accuracy);
    }
    if (!hasCenteredOnUser) {
        hasCenteredOnUser = true;
        const fromTagum = distanceMeters(c, { lat: CONFIG.TAGUM_CENTER[0], lng: CONFIG.TAGUM_CENTER[1] });
        if (fromTagum < 30_000) map.flyTo(latlng, 15, { duration: 1.2 });
        else showToast("You're outside Tagum — distances are shown from your current location.", "info", 4000);
    }
}

function renderNearbyList() {
    const list = [...getCafes()];
    if (locationState.coords) list.sort((a, b) => distanceTo(a) - distanceTo(b));
    else list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    $("#map-nearby-list").innerHTML = list.map((c) => {
        const d = distanceTo(c);
        const open = getOpenStatus(c).isOpen;
        return `<li><button type="button" class="nearby-item" data-action="focus-cafe" data-id="${esc(c.id)}">
          <span class="min-w-0"><span class="block font-semibold text-sm truncate">${esc(c.name)}</span>
          <span class="block text-xs ${open ? "text-accent" : "text-muted"}">${open === null ? "Hours n/a" : open ? "Open now" : "Closed"}</span></span>
          <span class="text-xs font-bold text-accent shrink-0">${d != null ? formatDistance(d).replace(" away", "") : `★ ${starsText(c.rating)}`}</span>
        </button></li>`;
    }).join("");
}

function updateLocationUI() {
    const s = locationState.status;
    const labels = {
        idle: "Location off",
        watching: locationState.coords ? `Live · ±${Math.round(locationState.coords.accuracy)} m` : "Locating…",
        denied: "Location blocked — allow it in your browser settings",
        unavailable: "Location unavailable right now",
        unsupported: "Your browser doesn't support location"
    };
    $("#location-status").textContent = labels[s] || "";
    const active = s === "watching";
    $$("#map-locate-btn span, #explore-locate-btn span").forEach((sp) => {
        sp.textContent = active ? "Stop tracking" : sp.closest("#map-locate-btn") ? "Track my location" : "Use my location";
    });
}

let lastLocationStatus = "idle";
function onLocationUpdate() {
    updateLocationUI();
    updateUserMarker();
    renderNearbyList();
    onDetailLocation();
    if (!!locationState.coords !== dash.hadCoords) {   // only when location turns on/off, not every GPS tick
        dash.hadCoords = !!locationState.coords;
        refreshProgress();
    }

    // Update distances in place; only re-render the grid when the nearest-first order changes.
    if (state.sort === "distance") {
        const key = filteredCafes().map((c) => c.id).join("|");
        if (key !== state.lastOrderKey) renderExplore();
    }
    $$("[data-distance-for]").forEach((el) => {
        const cafe = getCafe(el.dataset.distanceFor);
        const d = cafe && distanceTo(cafe);
        el.innerHTML = d != null ? `<svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-pin"/></svg>${formatDistance(d)}` : "";
    });

    if (locationState.status !== lastLocationStatus) {
        if (locationState.status === "denied") showToast("Location permission was denied.", "error");
        if (locationState.status === "unavailable") showToast("Couldn't get your location.", "error");
        lastLocationStatus = locationState.status;
    }
}

function toggleLocation() {
    if (locationState.status === "watching") {
        stopLocationWatch();
        hasCenteredOnUser = false;
        locationState.coords = null;
        onLocationUpdate();
        showToast("Live location stopped.", "info");
        return;
    }
    if (!window.isSecureContext) {
        showToast("Live location needs HTTPS (or localhost).", "error", 4000);
        return;
    }
    trackEvent("location_start");
    startLocationWatch();
}

/* ============================================================
 * COOKIE CONSENT
 * ============================================================ */
function setupCookieBanner() {
    const banner = $("#cookie-banner");
    if (getConsent() === null) setTimeout(() => banner.classList.remove("hidden"), 700);
    $("#cookie-accept").addEventListener("click", () => {
        setConsent("accepted");
        banner.classList.add("hidden");
        trackEvent("consent_accepted");
        showToast("Thanks! Preferences saved.");
    });
    $("#cookie-decline").addEventListener("click", () => {
        setConsent("declined");
        banner.classList.add("hidden");
        showToast("Analytics turned off. Only essential storage is used.", "info");
    });
}

/* ============================================================
 * THEME
 * ============================================================ */
function setupTheme() {
    const btn = $("#theme-toggle");
    const sync = () => btn.setAttribute("aria-label", document.documentElement.classList.contains("dark") ? "Switch to light mode" : "Switch to dark mode");
    sync();
    btn.addEventListener("click", () => {
        const dark = document.documentElement.classList.toggle("dark");
        setTheme(dark ? "dark" : "light");
        sync();
        trackEvent("theme_toggle", { theme: dark ? "dark" : "light" });
    });
    // Follow the OS setting until the user picks one
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
        if (!getTheme()) { document.documentElement.classList.toggle("dark", e.matches); sync(); }
    });
}

/* ============================================================
 * GLOBAL EVENT DELEGATION
 * ============================================================ */
function setupDelegation() {
    document.addEventListener("click", async (e) => {
        const closeBtn = e.target.closest("[data-close]");
        if (closeBtn) { closeDialog(closeBtn.closest("dialog")); return; }

        const closeLink = e.target.closest("[data-close-link]");
        if (closeLink) { closeDialog(closeLink.closest("dialog")); return; } // link still navigates

        const confirmBtn = e.target.closest("[data-confirm]");
        if (confirmBtn) {
            closeDialog($("#confirm-modal"));
            confirmResolver?.(confirmBtn.dataset.confirm === "yes");
            confirmResolver = null;
            return;
        }

        const el = e.target.closest("[data-action]");
        if (!el) return;
        const { action, id } = el.dataset;

        switch (action) {
            case "toggle-save": {
                const nowSaved = toggleSavedCafe(id);
                syncCafeControls(id);
                $$(`[data-action="toggle-save"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
                    b.classList.remove("burst"); void b.offsetWidth; b.classList.add("burst");
                });
                showToast(nowSaved ? "Cafe saved!" : "Removed from saved spots.", nowSaved ? "success" : "info");
                trackEvent(nowSaved ? "save_cafe" : "unsave_cafe", { id });
                if (state.route !== "saved") renderSaved();
                else setTimeout(renderSaved, 350);
                refreshProgress({ announce: true });
                break;
            }
            case "filter-tag": {
                const tag = el.dataset.tag;
                state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag);
                el.setAttribute("aria-pressed", String(state.tags.has(tag)));
                trackEvent("filter", { tags: [...state.tags] });
                state.shown = state.pageSize;
                renderExplore();
                break;
            }
            case "clear-filters":
                state.tags.clear();
                state.search = "";
                state.area = "";
                state.shown = state.pageSize;
                $("#area-select").value = "";
                $("#search-input").value = "";
                renderTagFilters();
                renderExplore();
                break;
            case "open-login":
                openAuth("login");
                break;
            case "focus-cafe": {
                const cafe = getCafe(id);
                if (!cafe || !map) break;
                map.flyTo([cafe.lat, cafe.lng], 16, { duration: 0.8 });
                cafeLayer.eachLayer((m) => { if (m.cafeId === id) setTimeout(() => m.openPopup(), 800); });
                break;
            }
            case "edit-cafe":
                openCafeForm(id);
                break;
            case "delete-cafe": {
                const cafe = getCafe(id);
                if (await confirmAction(`Delete "${cafe?.name}" from the directory? This can't be undone.`)) {
                    deleteCafe(id);
                    trackEvent("cafe_delete", { id });
                    showToast("Cafe deleted.", "info");
                    renderAll();
                }
                break;
            }
            case "delete-user":
                if (await confirmAction("Remove this user account and its login access?", "Remove")) {
                    deleteUser(id);
                    showToast("User removed.", "info");
                    renderAdmin();
                }
                break;
            case "cookie-settings":
                $("#cookie-banner").classList.remove("hidden");
                break;
            /* ---- café page ---- */
            case "close-cafe":
                closeCafeDetail();
                break;
            case "fit-cafe-map":
                fitDetailMap();
                break;
            case "locate-detail":
                if (locationState.status !== "watching") toggleLocation();
                break;
            /* ---- dashboard + account shortcuts ---- */
            case "open-auth":
                openAuth(el.dataset.tab || "login");
                break;
            case "new-recovery-key":
                openAuth("rekey");
                break;
            case "logout":
                $("#auth-logout-btn").click();
                break;
            case "explore-tag":
                state.tags = new Set([el.dataset.tag]);
                state.search = ""; state.area = ""; state.shown = state.pageSize;
                $("#search-input").value = ""; $("#area-select").value = "";
                renderTagFilters();
                renderExplore();
                navigate("explore");
                break;
            case "locate-nearest":
                if (locationState.status !== "watching") toggleLocation();
                if (locationState.status === "watching") showToast("Finding cafés near you…", "info");
                break;
            case "dash-all-stamps":
                dash.showAllStamps = !dash.showAllStamps;
                refreshProgress();
                break;
            case "dash-more-activity":
                dash.activityLimit += 12;
                refreshProgress();
                break;
        }
    });

    document.addEventListener("change", (e) => {
        const el = e.target.closest('[data-action="toggle-visit"]');
        if (!el) return;
        const id = el.dataset.id;
        const nowVisited = toggleVisitedCafe(id);
        syncCafeControls(id, { press: nowVisited });
        syncDetailStamp(id, { press: nowVisited });
        renderProgress(nowVisited ? id : null);
        trackEvent(nowVisited ? "visit_cafe" : "unvisit_cafe", { id });
        if (nowVisited) {
            const cafes = getCafes();
            const done = getVisitedCafeIds().filter((v) => cafes.some((c) => c.id === v)).length;
            showToast(done === cafes.length ? "Every Tagum café stamped. Your card is full!" : `Stamped: ${getCafe(id)?.name || "café"}`);
        } else {
            showToast("Stamp removed.", "info");
        }
        refreshProgress({ announce: true });
    });

    // Broken image fallback (16. no broken visuals)
    document.addEventListener("error", (e) => {
        const img = e.target;
        if (img.tagName === "IMG" && !img.dataset.failed && !img.classList.contains("leaflet-tile")) {
            img.dataset.failed = "1";
            img.src = FALLBACK_IMG;
        }
    }, true);

    // Search (debounced render + debounced analytics)
    const logSearch = debounce((q) => { if (q.length >= 2) trackEvent("search", { query: q.slice(0, 60) }); }, 900);
    $("#search-input").addEventListener("input", debounce((e) => {
        state.search = e.target.value.slice(0, 60);
        state.shown = state.pageSize;
        renderExplore();
        logSearch(state.search.trim());
    }, 180));

    $("#sort-select").addEventListener("change", (e) => {
        state.sort = e.target.value;
        trackEvent("sort", { by: state.sort });
        if (state.sort === "distance" && !locationState.coords) {
            showToast("Turn on location to sort by distance.", "info");
            if (locationState.status !== "watching") toggleLocation();
        }
        renderExplore();
    });

    $("#area-select").addEventListener("change", (e) => {
        state.area = e.target.value;
        state.shown = state.pageSize;
        trackEvent("filter", { area: state.area || "all" });
        renderExplore();
    });
    $("#explore-more").addEventListener("click", appendExploreCards);

    $("#map-locate-btn").addEventListener("click", toggleLocation);
    $("#explore-locate-btn").addEventListener("click", toggleLocation);

    $("#admin-reset-btn").addEventListener("click", async () => {
        if (await confirmAction("Reset the cafe directory to the original seed data? Added cafes and reviews will be lost.", "Reset")) {
            resetCafeDirectory();
            showToast("Directory reset.", "info");
            renderAll();
        }
    });
}

/* ============================================================
 * BOOT
 * ============================================================ */
function boot() {
    initLocalDatabase();
    setupTheme();
    setupDialogs();
    setupAuthUI();
    setupCafeForm();
    setupCookieBanner();
    setupDelegation();
    setupPhotoViewer();
    renderTagFilters();
    onLocationChange(onLocationUpdate);
    onAuthChange(() => renderAll({ announce: true })); // Firebase restores sessions asynchronously
    updateLocationUI();
    renderAll();

    window.addEventListener("hashchange", () => handleRoute(false));
    handleRoute(true);

    // Refresh open/closed status every minute
    setInterval(() => {
        if ($$("dialog[open]").length) return;
        renderExplore(); renderHomeTop(); updateMapMarkers(); renderNearbyList();
    }, 60_000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();