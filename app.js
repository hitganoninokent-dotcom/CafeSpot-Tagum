/**
 * Kapehan Tagum — app.js
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
    getPersona, personaRemembered, setPersona, canManageCafe, getOwnedCafes, menuToText,
    recordCafeEvent, getCafeStats, getLeaderboard, getCafeLeaderboard,
    listOwnerPhotos, addOwnerPhoto, updateOwnerPhoto, deleteOwnerPhoto, OWNER_PHOTO_LIMIT,
    getCafes, getCafe, addCafe, updateCafe, deleteCafe, resetCafeDirectory, addReviewToCafe,
    getOpenStatus, formatHours, formatTime, getSchedule, facebookLink, getCafePhotos, formatKm,
    getSavedCafeIds, toggleSavedCafe, getVisitedCafeIds, toggleVisitedCafe, getVisitDate,
    locationState, onLocationChange, startLocationWatch, stopLocationWatch, distanceMeters, formatDistance,
    requestQuickFix, getLocationPermission,
    getConsent, setConsent, trackEvent, getAnalyticsEvents,
    getTheme, setTheme
} from "./db.js";

/* ============================================================
 * STATE & HELPERS
 * ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MAIN_VIEWS = ["home", "explore", "checklist", "leaderboard", "owner", "account", "map", "saved", "admin", "privacy", "terms"];
const state = {
    route: null,
    baseView: "home",
    search: "",
    tags: new Set(),
    area: "",
    sort: "open",
    visit: "all",            // checklist filter: all | todo | done
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
      <a class="${btn}" href="${esc(facebookLink(cafe))}" target="_blank" rel="noopener noreferrer" data-track="social" data-id="${esc(cafe.id)}"
         aria-label="${fb ? `${esc(cafe.name)} on Facebook` : `Search Facebook for ${esc(cafe.name)}`}" title="${fb ? "Facebook page" : "Search on Facebook"}">
        <svg class="w-4 h-4" aria-hidden="true"><use href="#i-fb"/></svg>${size === "lg" ? `<span>${fb ? "Facebook" : "Find on Facebook"}</span>` : ""}
      </a>
      ${ig ? `<a class="${btn}" href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener noreferrer" data-track="social" data-id="${esc(cafe.id)}" aria-label="${esc(cafe.name)} on Instagram (@${esc(ig)})" title="@${esc(ig)}">
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
    el.style.setProperty("--toast-ms", `${Math.max(ms - 120, 300)}ms`); // the hairline that drains while the toast is up
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

    document.title = panel.dataset.title || "Kapehan Tagum";
    $$("[data-nav]").forEach((a) => {
        if (a.dataset.nav === view) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
    });

    if (view === "notfound") {
        $("#notfound-path").textContent = path || location.hash;
        trackEvent("not_found", { path });
    }
    if (view === "map") ensureMap();
    if (view === "explore") ensureExploreMap();
    if (view === "checklist") renderChecklist();
    if (view === "account") renderAccount();
    if (view === "owner") renderOwner();
    if (view === "leaderboard") renderLeaderboard();
    requestAnimationFrame(positionNavIndicators);
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
 * MOTION — small, tactile responses outside the protected panels
 *   · the header gains a surface and a hairline once the page scrolls
 *   · buttons bloom from the exact point you press them
 * ============================================================ */
const BLOOM_TARGETS = ".btn-primary, .btn-outline, .btn-danger, .k-btn, .hdr-btn, .filter-chip, .seg-filter button, .segmented button";

function setupMotion() {
    const header = $("#site-header");
    let scrolled = null;
    const onScroll = () => {
        const now = window.scrollY > 4;
        if (now !== scrolled) { scrolled = now; header?.classList.toggle("is-scrolled", now); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    document.addEventListener("pointerdown", (e) => {
        const el = e.target.closest?.(BLOOM_TARGETS);
        if (!el || el.disabled || el.closest(".cafe-split, .x-map-col") || reducedMotion()) return;
        const r = el.getBoundingClientRect();
        el.classList.add("k-bloom");
        el.style.setProperty("--bx", `${e.clientX - r.left}px`);
        el.style.setProperty("--by", `${e.clientY - r.top}px`);
        el.classList.remove("is-blooming");
        void el.offsetWidth;                       // restart the bloom on quick repeat presses
        el.classList.add("is-blooming");
    }, { passive: true });
}

/* ============================================================
 * HEADER / AUTH STATE
 * ============================================================ */
function renderHeader() {
    const user = getCurrentUser();
    applyPersona();
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
/* ============================================================
 * NAVIGATION — side rail (tablet/desktop) + tab bar (phone)
 * The highlight pill doesn't slide; it pours. It first stretches to
 * cover both the old and the new item, then lets go of the old one,
 * like coffee running from one cup into the next. Same curves as the CSS.
 * ============================================================ */
const navPrev = new WeakMap();   // nav → { el, pos, size }
const EASE = { sip: "cubic-bezier(.33,0,.15,1)", pour: "cubic-bezier(.16,.84,.32,1)" };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function positionNavIndicators() {
    $$(".side-rail__list, .tab-bar").forEach((nav) => {
        const pill = nav.querySelector(".nav-indicator");
        const active = nav.querySelector('[aria-current="page"]');
        if (!pill) return;
        if (!active || !active.offsetParent) { pill.style.opacity = "0"; navPrev.delete(nav); return; }
        const across = nav.classList.contains("tab-bar");          // tab bar moves sideways, the rail up and down
        const host = across ? active : active.closest("li");
        const prop = across ? "width" : "height";
        const size = across ? Math.min(64, host.offsetWidth - 12) : host.offsetHeight;
        const pos = across ? host.offsetLeft + (host.offsetWidth - size) / 2 : host.offsetTop;
        const at = (p) => (across ? `translateX(${p}px)` : `translateY(${p}px)`);

        const prev = navPrev.get(nav);
        pill.style.opacity = "1";
        pill.style[prop] = `${size}px`;
        pill.style.transform = at(pos);
        navPrev.set(nav, { el: active, pos, size });

        // Only animate when the page changed (not on resize), and never for reduced motion.
        if (!prev || prev.el === active || reducedMotion() || !pill.animate) return;
        const start = Math.min(prev.pos, pos);
        const end = Math.max(prev.pos + prev.size, pos + size);
        pill.getAnimations().forEach((a) => a.cancel());
        pill.animate([
            { transform: at(prev.pos), [prop]: `${prev.size}px`, easing: EASE.sip },
            { transform: at(start), [prop]: `${end - start}px`, offset: 0.42, easing: EASE.pour },
            { transform: at(pos), [prop]: `${size}px` }
        ], { duration: 560 });
    });
}

/* ============================================================
 * CHECKLIST PAGE — every café grouped by area
 *   Tick a café: the row fills with ink, the area bar grows, the
 *   cup at the top fills, and its stamp lands everywhere else.
 * ============================================================ */
const cl = { filter: "all", q: "" };

function clItem(cafe, visited) {
    const at = visited ? getVisitDate(cafe.id) : null;
    return `<li class="cl-item${visited ? " is-done" : ""}" data-cafe="${esc(cafe.id)}">
        <label class="cl-check">
          <input type="checkbox" data-action="toggle-visit" data-id="${esc(cafe.id)}" ${visited ? "checked" : ""} />
          <span class="x-check__box" aria-hidden="true"><svg><use href="#i-check"/></svg></span>
          <span class="cl-name">${esc(cafe.name)}</span>
        </label>
        <span class="cl-date">${at ? esc(fmtDate(at)) : ""}</span>
        <a class="cl-open" href="#/cafe/${esc(cafe.id)}" aria-label="Open ${esc(cafe.name)}" title="Open café page"><svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
      </li>`;
}

function renderChecklist() {
    const box = $("#checklist-groups");
    if (!box) return;
    const visited = new Set(getVisitedCafeIds());
    const q = cl.q.trim().toLowerCase();
    const groups = {};
    getCafes().forEach((c) => (groups[c.neighborhood || "Tagum City"] = groups[c.neighborhood || "Tagum City"] || []).push(c));
    const areas = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b));

    let index = 0;
    const html = areas.map((area) => {
        const all = groups[area].sort((a, b) => a.name.localeCompare(b.name));
        const done = all.filter((c) => visited.has(c.id)).length;
        const shown = all.filter((c) => (cl.filter === "all" || (cl.filter === "done") === visited.has(c.id)) && (!q || c.name.toLowerCase().includes(q)));
        if (!shown.length) return "";
        return `<section class="cl-group" data-area="${esc(area)}" style="--i:${Math.min(index++, 10)}">
            <div class="cl-group__head">
              <h2>${esc(area)}</h2>
              <span class="cl-group__count"><b>${done}</b> of ${all.length}</span>
            </div>
            <div class="cl-group__bar" aria-hidden="true"><span style="width:${Math.round((done / all.length) * 100)}%"></span></div>
            <ul class="cl-items">${shown.map((c) => clItem(c, visited.has(c.id))).join("")}</ul>
          </section>`;
    }).join("");
    box.innerHTML = html || `<div class="col-span-full">${emptyState(
        cl.filter === "done" ? "Wala pa'y na-tick. Kape una, tick dayon!" : q ? "Wala pa'y kapehan nga ingon ana nga ngalan." : "Na-tick na nimo tanan. Legend ka, bai!",
        `<a href="#/explore" class="btn-primary mt-4">Explore cafés</a>`)}</div>`;
}

/** Update one café in place after a tick (keeps focus and scroll), then refresh its area count. */
function syncChecklistItem(id, { press = false } = {}) {
    const item = $(`.cl-item[data-cafe="${CSS.escape(id)}"]`);
    if (!item) return;
    const visited = getVisitedCafeIds().includes(id);
    item.classList.toggle("is-done", visited);
    if (press && visited) { item.classList.remove("just-done"); void item.offsetWidth; item.classList.add("just-done"); }
    const at = visited ? getVisitDate(id) : null;
    item.querySelector(".cl-date").textContent = at ? fmtDate(at) : "";
    const group = item.closest(".cl-group");
    const area = group.dataset.area;
    const all = getCafes().filter((c) => (c.neighborhood || "Tagum City") === area);
    const visitedSet = new Set(getVisitedCafeIds());
    const done = all.filter((c) => visitedSet.has(c.id)).length;
    group.querySelector(".cl-group__count b").textContent = done;
    group.querySelector(".cl-group__bar span").style.width = `${Math.round((done / all.length) * 100)}%`;
    if ((cl.filter === "todo" && visited) || (cl.filter === "done" && !visited)) {
        item.classList.add("is-leaving");
        setTimeout(renderChecklist, 600);
    }
}

function setupChecklist() {
    $("#checklist-filter").addEventListener("click", (e) => {
        const b = e.target.closest("[data-check-filter]");
        if (!b) return;
        cl.filter = b.dataset.checkFilter;
        renderProgress();
        renderChecklist();
    });
    $("#checklist-search").addEventListener("input", debounce((e) => { cl.q = e.target.value.slice(0, 60); renderChecklist(); }, 150));
}

/* ============================================================
 * ACCOUNT PAGE — profile, this device, recovery key, activity
 * ============================================================ */
function renderAccount() {
    const el = $("#account-body");
    if (!el) return;
    const p = getProgress();
    const savedCount = p.savedIds.length;
    const links = `
      <nav class="account-links" aria-label="Your lists">
        <a href="#/checklist" class="account-link"><svg aria-hidden="true"><use href="#i-list-check"/></svg><span><b>Checklist</b><small>${p.visitedCount} of ${p.total} visited</small></span></a>
        <a href="#/saved" class="account-link"><svg aria-hidden="true"><use href="#i-heart"/></svg><span><b>Saved cafés</b><small>${plural(savedCount, "café")}</small></span></a>
        <a href="#/map" class="account-link"><svg aria-hidden="true"><use href="#i-map"/></svg><span><b>Full map</b><small>Every café with live distances</small></span></a>
        ${isAdmin() ? `<a href="#/admin" class="account-link"><svg aria-hidden="true"><use href="#i-shield"/></svg><span><b>Admin dashboard</b><small>Cafés, users and log-ins</small></span></a>` : ""}
      </nav>`;

    if (!p.user) {
        el.innerHTML = `
          <section class="account-guest">
            <span class="feature-icon"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-user"/></svg></span>
            <h1 class="x-title mt-3">Your account</h1>
            <p class="text-muted mt-2 max-w-prose">Log in to keep your stamps under your name, earn badges and see your café history. ${p.visitedCount ? `The ${plural(p.visitedCount, "stamp")} you collected as a guest will move into your account.` : ""}</p>
            <div class="flex flex-wrap gap-2 mt-5">
              <button type="button" class="btn-primary" data-action="open-auth" data-tab="login">Log in</button>
              <button type="button" class="btn-outline" data-action="open-auth" data-tab="register">Create free account</button>
            </div>
          </section>
          ${links}`;
        return;
    }
    const persona = getPersona();
    const roleRow = p.user.role === "admin" ? "" : `
      <section class="role-row" aria-labelledby="role-row-h">
        <span class="role-option__icon"><svg aria-hidden="true"><use href="#${persona === "owner" ? "i-store" : "i-compass"}"/></svg></span>
        <div class="min-w-0 flex-1">
          <h2 id="role-row-h" class="font-bold">You're using Kapehan Tagum as a ${persona === "owner" ? "café owner" : "café finder"}</h2>
          <p class="text-sm text-muted">${persona === "owner" ? "You see the owner dashboard. Switch to browse and collect stamps." : "You see the directory, checklist and leaderboard. Switch to publish and manage a café."}</p>
        </div>
        <button type="button" class="btn-outline" data-action="set-persona" data-persona="${persona === "owner" ? "finder" : "owner"}">Switch to café ${persona === "owner" ? "finder" : "owner"}</button>
      </section>`;
    el.innerHTML = `
      <h1 class="x-title">Your account</h1>
      ${roleRow}
      ${links}
      <div class="grid lg:grid-cols-5 gap-5 mt-5">${accountSection(p)}${activitySection()}</div>`;
}

/* ============================================================
 * CAFE CARDS — compact: short photo, one line of meta, tight footer
 * ============================================================ */
function cafeCard(cafe, i = 0) {
    const saved = getSavedCafeIds().includes(cafe.id);
    const visited = getVisitedCafeIds().includes(cafe.id);
    const dist = distanceTo(cafe);
    const reviewCount = cafe.reviews?.length || 0;
    // Photo sits inset in the card like a cup on a saucer; status is a word, not a badge on the photo.
    return `
    <article class="cafe-card" style="--i:${Math.min(i, 11)}" data-cafe="${esc(cafe.id)}">
      ${visited ? `<div class="card-stamp">${stampSvg(cafe)}</div>` : ""}
      <a class="cafe-media" href="#/cafe/${esc(cafe.id)}" tabindex="-1" aria-hidden="true">
        <img src="${esc(cafe.image)}" alt="" loading="lazy" decoding="async" width="640" height="280" />
      </a>
      <button type="button" class="heart-btn cafe-card__heart" data-action="toggle-save" data-id="${esc(cafe.id)}"
        aria-pressed="${saved}" aria-label="${saved ? "Remove" : "Save"} ${esc(cafe.name)} ${saved ? "from" : "to"} favorites">
        <svg class="w-4 h-4" aria-hidden="true"><use href="#i-heart"/></svg>
      </button>
      <div class="cafe-card__body">
        <div class="cafe-card__top">
          <h3 class="cafe-card__title"><a href="#/cafe/${esc(cafe.id)}">${esc(cafe.name)}</a></h3>
          <span class="cafe-card__rating" aria-label="Rating ${starsText(cafe.rating)}, ${plural(reviewCount, "review")}"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-star"/></svg>${starsText(cafe.rating)}<small>(${reviewCount})</small></span>
        </div>
        <p class="cafe-card__meta">${shortStatus(cafe)}<span>${esc(cafe.neighborhood || "Tagum City")}</span><span data-distance-for="${esc(cafe.id)}">${dist != null ? formatDistance(dist) : ""}</span></p>
        <p class="cafe-card__hours"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-clock"/></svg>${esc(formatHours(cafe))}</p>
        <div class="cafe-card__foot">
          <label class="visit-toggle">
            <input type="checkbox" data-action="toggle-visit" data-id="${esc(cafe.id)}" ${visited ? "checked" : ""} />
            <span class="visit-box"><svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-check"/></svg></span>
            <span class="visit-label">${visited ? "Visited" : "Mark visited"}</span>
          </label>
          <a href="#/cafe/${esc(cafe.id)}" class="cafe-card__more">Tara Kape ta diri</a>
        </div>
      </div>
    </article>`;
}

function emptyState(text, actionHtml = "") {
    return `<div class="k-empty">
      <svg class="k-empty__cup" aria-hidden="true"><use href="#i-cup"/></svg>
      <p>${text}</p>${actionHtml}</div>`;
}

function filteredCafes() {
    const q = state.search.trim().toLowerCase();
    const visitedIds = new Set(getVisitedCafeIds());
    let list = getCafes().filter((c) => {
        const haystack = [c.name, c.address, c.neighborhood, ...(c.menu || []).map((m) => m.name)].join(" ").toLowerCase();
        const matchesQ = !q || haystack.includes(q);
        const matchesTags = [...state.tags].every((t) => (c.tags || []).includes(t));
        const matchesArea = !state.area || c.neighborhood === state.area;
        const matchesVisit = state.visit === "all" || (state.visit === "done") === visitedIds.has(c.id);
        return matchesQ && matchesTags && matchesArea && matchesVisit;
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

/** quiet = a background refresh (clock tick, GPS re-sort): rows swap in place without the fade-in. */
function renderExplore({ quiet = false } = {}) {
    const list = filteredCafes();
    state.lastOrderKey = list.map((c) => c.id).join("|");
    const visitedIds = getVisitedCafeIds();
    const savedIds = getSavedCafeIds();
    $("#explore-cafe-list").toggleAttribute("data-quiet", quiet);
    $("#explore-cafe-list").innerHTML = list.length
        ? list.map((c, i) => exploreRow(c, i, visitedIds.includes(c.id), savedIds.includes(c.id))).join("")
        : `<li>${emptyState(state.visit === "done" ? "Wala pa'y nabisitahan nga ingon ana. Kape una, tick dayon!" : "Wala pa'y kapehan nga ingon ana. Usba ang filter, basin naa ra sa kanto.",
            `<button type="button" class="btn-outline mt-4" data-action="clear-filters">Clear filters</button>`)}</li>`;

    const total = getCafes().length;
    const openCount = list.filter((c) => getOpenStatus(c).isOpen).length;
    $("#explore-meta").textContent = list.length === total
        ? `All ${total} cafés, ${openCount} open now`
        : `${list.length} of ${total} cafés, ${openCount} open now`;
    updateExploreMap(list);
}

/* ============================================================
 * EXPLORE — split screen + visit checklist
 *   Every café is one compact row (no paging, one scroll).
 *   ☐ tick = visited (stamp lands on the row, the cup fills up)
 *   Tap a name = its description + menu open in place, and the
 *   map on the left flies to its pin. Tap a pin = the row opens.
 * ============================================================ */
const xp = { map: null, layer: null, pins: new Map(), user: null, selected: null, expanded: null, fitted: false };

function shortStatus(cafe) {
    const s = getOpenStatus(cafe);
    const cls = s.isOpen === null ? "is-unknown" : s.isOpen ? "is-open" : "is-closed";
    const text = s.isOpen === null ? "Hours not listed" : s.isOpen ? "Open now" : "Closed";
    return `<span class="x-status ${cls}">${text}</span>`;
}

function exploreRow(cafe, i, visited, saved) {
    const open = xp.expanded === cafe.id;
    const d = distanceTo(cafe);
    const menu = (cafe.menu || []).slice(0, 5);
    return `
    <li class="x-row${visited ? " is-visited" : ""}${open ? " is-open" : ""}${xp.selected === cafe.id ? " is-selected" : ""}" data-cafe="${esc(cafe.id)}" style="--i:${Math.min(i, 16)}">
      <div class="x-row__line">
        <label class="x-check" title="${visited ? "Visited" : "Mark visited"}">
          <input type="checkbox" data-action="toggle-visit" data-id="${esc(cafe.id)}" ${visited ? "checked" : ""} aria-label="Visited ${esc(cafe.name)}" />
          <span class="x-check__box" aria-hidden="true"><svg><use href="#i-check"/></svg></span>
        </label>
        <button type="button" class="x-row__main" data-action="x-select" data-id="${esc(cafe.id)}" aria-expanded="${open}" aria-controls="x-more-${esc(cafe.id)}">
          <span class="x-row__name">${esc(cafe.name)}</span>
          <span class="x-row__meta">${shortStatus(cafe)}<span>${esc(cafe.neighborhood || "Tagum City")}</span>
            <span class="x-row__dist" data-distance-for="${esc(cafe.id)}">${d != null ? formatDistance(d) : ""}</span></span>
        </button>
        <span class="x-row__stamp" aria-hidden="true">${visited ? stampSvg(cafe) : ""}</span>
        <button type="button" class="x-heart" data-action="toggle-save" data-id="${esc(cafe.id)}" aria-pressed="${saved}"
          aria-label="${saved ? "Remove" : "Save"} ${esc(cafe.name)} ${saved ? "from" : "to"} favorites"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-heart"/></svg></button>
      </div>
      <div class="x-row__more" id="x-more-${esc(cafe.id)}">
        <div class="x-row__inner">
          <p class="x-row__about">${esc(cafe.note || `A café in ${cafe.neighborhood || "Tagum City"}.`)}</p>
          ${menu.length ? `<ul class="menu-list x-menu">${menu.map((m) => `<li><span class="menu-name">${esc(m.name)}</span><span class="menu-dots" aria-hidden="true"></span><span class="menu-price">${priceText(m)}</span></li>`).join("")}</ul>`
        : `<p class="text-sm text-muted">Menu not published yet.</p>`}
          <p class="text-xs text-muted mt-2">${esc(formatHours(cafe))}</p>
          <div class="flex flex-wrap gap-2 mt-3">
            <a class="btn-primary" href="#/cafe/${esc(cafe.id)}">Tara Kape ta diri</a>
            <a class="btn-outline" href="${esc(directionsUrl(cafe))}" target="_blank" rel="noopener noreferrer" data-track="directions" data-id="${esc(cafe.id)}">Directions</a>
            ${socialLinks(cafe)}
          </div>
        </div>
      </div>
    </li>`;
}

/** Visit filter + checklist cup. */
function renderProgress(pressId = null) {
    const cafes = getCafes();
    const ids = new Set(cafes.map((c) => c.id));
    const visited = getVisitedCafeIds().filter((id) => ids.has(id)).length;
    const total = cafes.length;
    const pct = total ? Math.round((visited / total) * 100) : 0;
    const line = visited === 0
        ? `I-tick ang kapehan nga naadtoan na nimo. ${total} pa ang naghulat!`
        : visited === total ? `Nalibot na nimo tanan ${total}! Legend ka, bai.` : `${visited} sa ${total} nabisitahan na, ${total - visited} pa. Padayon lang!`;
    if ($("#checklist-progress-text")) $("#checklist-progress-text").textContent = line;
    if ($("#explore-progress")) $("#explore-progress").textContent = line;
    $$("[data-checklist-badge]").forEach((b) => { b.hidden = visited === 0; b.textContent = String(visited); });
    const meter = $("#cup-meter");
    if (meter) {
        meter.setAttribute("aria-valuenow", String(pct));
        meter.setAttribute("aria-valuetext", `${visited} of ${total} cafés visited`);
        // The cup's inside runs from y=53 (empty) to y=18 (full): the coffee rises with each visit.
        $("#cup-liquid").style.transform = `translateY(${(53 - 35 * (pct / 100)).toFixed(2)}px)`;
        if (pressId) { meter.classList.remove("is-pouring"); void meter.offsetWidth; meter.classList.add("is-pouring"); }
    }
    const counts = { all: total, todo: total - visited, done: visited };
    const label = { all: "All", todo: "To visit", done: "Visited" };
    $$("[data-visit-filter]").forEach((b) => {
        const f = b.dataset.visitFilter;
        b.innerHTML = `${label[f]} <span class="seg-count">${counts[f]}</span>`;
        b.setAttribute("aria-checked", String(state.visit === f));
    });
    $$("[data-check-filter]").forEach((b) => {
        const f = b.dataset.checkFilter;
        b.innerHTML = `${label[f]} <span class="seg-count">${counts[f]}</span>`;
        b.setAttribute("aria-checked", String(cl.filter === f));
    });
    renderStampCollection(pressId);
}

/** Update one row in place after a visit/save toggle (keeps scroll position and the open row). */
function syncExploreRow(id, { press = false } = {}) {
    const row = $(`.x-row[data-cafe="${CSS.escape(id)}"]`);
    const visited = getVisitedCafeIds().includes(id);
    const cafe = getCafe(id);
    if (row && cafe) {
        row.classList.toggle("is-visited", visited);
        row.querySelector(".x-check").title = visited ? "Visited" : "Mark visited";
        row.querySelector(".x-row__stamp").innerHTML = visited ? stampSvg(cafe, { pressed: press }) : "";
        // In "To visit" / "Visited", the row no longer belongs: let it fold away.
        if ((state.visit === "todo" && visited) || (state.visit === "done" && !visited)) {
            row.classList.add("is-leaving");
            setTimeout(renderExplore, 650);
        }
    }
    const pin = xp.pins.get(id);
    if (pin && cafe) pin.setIcon(exploreIcon(cafe, xp.selected === id));
}

function exploreIcon(cafe, selected) {
    const s = getOpenStatus(cafe).isOpen;
    const visited = getVisitedCafeIds().includes(cafe.id);
    const size = selected ? 44 : 22;
    return L.divIcon({
        className: `xpin ${s === true ? "is-open" : s === false ? "is-closed" : "is-unknown"}${visited ? " is-visited" : ""}${selected ? " is-selected" : ""}`,
        html: selected
            ? `<span class="xpin__big"><svg aria-hidden="true"><use href="#i-cup"/></svg></span>`
            : `<span class="xpin__dot">${visited ? `<svg aria-hidden="true"><use href="#i-check"/></svg>` : ""}</span>`,
        iconSize: [size, size],
        iconAnchor: selected ? [22, 50] : [11, 11]
    });
}

function ensureExploreMap() {
    if (xp.map) { setTimeout(() => xp.map.invalidateSize(), 120); return; }
    const el = $("#explore-map");
    if (!el) return;
    if (typeof window.L === "undefined") {
        el.innerHTML = `<div class="h-full grid place-items-center text-sm text-muted p-6 text-center">The map couldn't load. Check your connection and refresh.</div>`;
        return;
    }
    xp.map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView(CONFIG.TAGUM_CENTER, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(xp.map);
    xp.layer = L.layerGroup().addTo(xp.map);
    xp.map.on("click", () => xp.map.scrollWheelZoom.enable());   // wheel-zoom only after you click the map
    el.addEventListener("mouseleave", () => xp.map.scrollWheelZoom.disable());
    updateExploreMap(filteredCafes());
    updateExploreUser();
    setTimeout(() => xp.map.invalidateSize(), 120);
}

function updateExploreMap(list) {
    if (!xp.map) return;
    xp.layer.clearLayers();
    xp.pins.clear();
    list.forEach((c) => {
        const selected = xp.selected === c.id;
        const m = L.marker([c.lat, c.lng], { icon: exploreIcon(c, selected), title: c.name, alt: c.name, keyboard: false, zIndexOffset: selected ? 1000 : 0 });
        m.bindTooltip(esc(c.name), { direction: "top", offset: [0, selected ? -48 : -10] });
        m.on("click", () => selectExploreCafe(c.id, { fromMap: true }));
        xp.layer.addLayer(m);
        xp.pins.set(c.id, m);
    });
    if (!xp.fitted && list.length) { fitExploreMap(list); xp.fitted = true; }
}

function fitExploreMap(list = filteredCafes()) {
    if (!xp.map || !list.length) return;
    xp.map.fitBounds(L.latLngBounds(list.map((c) => [c.lat, c.lng])), { padding: [36, 36], maxZoom: 16 });
}

function updateExploreUser() {
    if (!xp.map) return;
    const c = locationState.coords;
    if (!c) { if (xp.user) { xp.map.removeLayer(xp.user); xp.user = null; } return; }
    if (!xp.user) {
        xp.user = L.marker([c.lat, c.lng], {
            icon: L.divIcon({ className: "user-pin", html: `<div class="user-pin-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
            zIndexOffset: 1200, title: "You are here", keyboard: false
        }).addTo(xp.map).bindTooltip("You", { direction: "bottom", offset: [0, 12] });
    } else xp.user.setLatLng([c.lat, c.lng]);
}

/** Select a café: open its row (description + menu), grow its pin, fly the map there. */
function selectExploreCafe(id, { fromMap = false } = {}) {
    const cafe = getCafe(id);
    if (!cafe) return;
    const prev = xp.selected;
    xp.expanded = xp.expanded === id && !fromMap ? null : id;
    if (xp.expanded === id) recordCafeEvent(id, "preview");   // description + menu opened in Explore
    xp.selected = id;
    $$(".x-row").forEach((r) => {
        const on = r.dataset.cafe === xp.expanded;
        r.classList.toggle("is-open", on);
        r.classList.toggle("is-selected", r.dataset.cafe === id);
        r.querySelector(".x-row__main")?.setAttribute("aria-expanded", String(on));
    });
    [prev, id].forEach((cid) => {
        const pin = cid && xp.pins.get(cid);
        if (pin) { pin.setIcon(exploreIcon(getCafe(cid), cid === id)); pin.setZIndexOffset(cid === id ? 1000 : 0); }
    });
    if (xp.map) xp.map.flyTo([cafe.lat, cafe.lng], Math.max(xp.map.getZoom(), 16), { duration: 0.7 });
    if (fromMap) {
        const row = $(`.x-row[data-cafe="${CSS.escape(id)}"]`);
        row?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    }
}

function setupExplore() {
    const list = $("#explore-cafe-list");
    // Hovering a row lights up its pin (mouse only)
    list.addEventListener("mouseover", (e) => {
        const row = e.target.closest(".x-row");
        $$(".xpin.is-hover").forEach((p) => p.classList.remove("is-hover"));
        if (row) xp.pins.get(row.dataset.cafe)?.getElement()?.classList.add("is-hover");
    });
    list.addEventListener("mouseleave", () => $$(".xpin.is-hover").forEach((p) => p.classList.remove("is-hover")));
    $("#visit-filter").addEventListener("click", (e) => {
        const b = e.target.closest("[data-visit-filter]");
        if (!b) return;
        state.visit = b.dataset.visitFilter;
        trackEvent("filter", { visit: state.visit });
        renderProgress();
        renderExplore();
    });
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
        : emptyState("Wala pa kay gi-save. I-tap ang heart sa bisan unsang kapehan para dinhi nimo makita.",
            `<a href="#/explore" class="btn-primary mt-4">Browse cafes</a>`);
    settleAfterFirstPaint($("#saved-cafe-list"));
}

/** Cards fade in the first time a grid fills; later refreshes (clock ticks, sign-in) just swap in place. */
function settleAfterFirstPaint(grid) {
    if (!grid || grid.dataset.settled || grid.dataset.settling) return;
    grid.dataset.settling = "1";
    setTimeout(() => { grid.dataset.settled = "1"; }, 1400);
}

/** Home: cafes open right now (nearest first when location is on), falling back to all cafes. */
function renderHomeTop() {
    const all = getCafes();
    let picks = all.filter((c) => getOpenStatus(c).isOpen === true);
    const heading = $("#home-top-heading");
    if (!picks.length) { picks = all; heading.textContent = "Mga kapehan nga sulayan"; }
    else heading.textContent = `Abri pa karon (${picks.length})`;
    picks.sort(locationState.coords ? (a, b) => distanceTo(a) - distanceTo(b) : (a, b) => (b.menu?.length || 0) - (a.menu?.length || 0) || a.name.localeCompare(b.name));
    $("#home-top-list").innerHTML = picks.slice(0, 6).map((c, i) => cafeCard(c, i)).join("");
    settleAfterFirstPaint($("#home-top-list"));
    renderHeroSlip();
}

/* ============================================================
 * HERO SLIP — the open cafés nearest you, set like a menu board:
 *   name ............ 0.4 km
 * Without location it lists open cafés with their closing time.
 * Lines print in one after another on the first paint only;
 * later updates (GPS ticks, the minute changing) swap the text quietly.
 * ============================================================ */
const slip = { printed: false, html: "" };

function slipValue(cafe, here) {
    if (here) return formatDistance(distanceTo(cafe)).replace(" away", "");
    const label = getOpenStatus(cafe).label || "";
    if (/24 hours/i.test(label)) return "24 oras";
    const m = label.match(/closes (.+)$/);
    return m ? `hangtod ${m[1]}` : "";
}

function renderHeroSlip() {
    const el = $("#hero-slip");
    if (!el) return;
    const here = !!locationState.coords;
    const open = getCafes().filter((c) => getOpenStatus(c).isOpen === true);
    const picks = open.slice().sort(here
        ? (a, b) => distanceTo(a) - distanceTo(b)
        : (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name)).slice(0, 4);
    const time = new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
    const lines = picks.map((c, k) => `
        <li style="--n:${k + 1}"><a class="k-slip__item" href="#/cafe/${esc(c.id)}">
          <span class="k-slip__name">${esc(c.name)}</span><span class="k-slip__dots" aria-hidden="true"></span>
          <span class="k-slip__val">${esc(slipValue(c, here))}</span></a></li>`).join("");
    const html = `
      <div class="k-slip__head" style="--n:0">
        <h2 class="k-slip__title" id="slip-title">${here ? "Duol ug abri karon" : "Abri karon"}</h2>
        <time class="k-slip__time" datetime="${new Date().toISOString()}">${esc(time)}</time>
      </div>
      <p class="k-slip__sub" style="--n:0">${here ? "Pinakaduol una, gikan sa imong nahimutangan." : "I-on ang location para makita kung unsa ka duol."}</p>
      ${picks.length ? `<ol class="k-slip__list">${lines}</ol>`
        : `<p class="k-slip__empty">Sirado na tanan karon. Kape sa balay sa, ugma na lang ta.</p>`}
      <a class="k-slip__all" href="#/explore" style="--n:${picks.length + 1}">${open.length ? `See all ${open.length} open cafés` : "See every café"}</a>`;
    if (html.replace(/datetime="[^"]*"/, "") === slip.html) return;   // nothing changed: leave the DOM (and hover) alone
    slip.html = html.replace(/datetime="[^"]*"/, "");
    const first = !slip.printed && !reducedMotion();
    el.className = `k-slip${first ? " is-printing" : ""}`;
    el.setAttribute("aria-labelledby", "slip-title");
    el.setAttribute("role", "region");
    el.innerHTML = html;
    slip.printed = true;
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
    if (state.route === "checklist") renderChecklist();
    if (state.route === "account") renderAccount();
    if (state.route === "owner") renderOwner();
    if (state.route === "leaderboard") renderLeaderboard();
    requestAnimationFrame(positionNavIndicators); // admin link may have appeared/disappeared
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
    if (changed && state.fromWheel !== id) state.fromWheel = null; // the "Picked by the wheel" flag belongs to that pick only
    state.detailId = id;
    showView("cafe");
    renderCafeDetail({ full: changed || !detail.map });
    if (changed) { trackEvent("cafe_view", { id }); recordCafeEvent(id, "view"); }
}

/** Back: return to the list/map the user came from; on a shared link, go to Explore. */
function closeCafeDetail() {
    if (state.cafeEntry === "app" && history.length > 1) history.back();
    else navigate(state.baseView === "home" ? "explore" : state.baseView);
}

function renderCafeDetail({ full = false } = {}) {
    const cafe = getCafe(state.detailId);
    if (!cafe) return;
    document.title = `${cafe.name} · Kapehan Tagum`;
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
        ${cafe.ownerId ? `<p class="owner-flag"><svg class="w-4 h-4" aria-hidden="true"><use href="#i-store"/></svg>Listing managed by the café${canManageCafe(cafe.id) && getCurrentUser()?.role !== "admin" ? ` · <a href="#/owner" class="underline">Your dashboard</a>` : ""}</p>` : ""}
        ${state.fromWheel === cafe.id ? `<p class="wheel-flag"><svg class="w-4 h-4" aria-hidden="true"><use href="#i-wheel"/></svg>Picked by the wheel</p>` : ""}
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
            </li>`).join("") : `<li class="text-sm text-muted">Wala pa'y review. Ikaw na'y una, bai!</li>`}
        </ul>
      </section>

      ${cafe.sources?.length ? `<section class="text-xs text-muted pt-5">
        <p class="font-bold mb-1">Listing sources</p>
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
            <a class="btn-primary" href="${esc(directionsFrom(cafe, c))}" target="_blank" rel="noopener noreferrer" data-track="directions" data-id="${esc(cafe.id)}">
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
        <a class="btn-outline" href="${esc(directionsFrom(cafe, null))}" target="_blank" rel="noopener noreferrer" data-track="directions" data-id="${esc(cafe.id)}">Directions</a>
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
function renderPhotos(cafe, official = null) {
    if (official === null) {
        // Show the listed photos now; then add the owner's uploads (stored in IndexedDB) on top.
        listOwnerPhotos(cafe.id).then((rows) => {
            if (!rows.length || state.detailId !== cafe.id) return;
            (detail.photoUrls || []).forEach((u) => URL.revokeObjectURL(u));
            detail.photoUrls = rows.map((r) => URL.createObjectURL(r.blob));
            renderPhotos(cafe, rows.map((r, i) => ({ src: detail.photoUrls[i], alt: r.alt || `${cafe.name} photo`, credit: r.credit })));
        });
        official = [];
    }
    const photos = [...official, ...getCafePhotos(cafe)];
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

/* ============================================================
 * SPIN THE WHEEL — 3D roulette that picks a café, then opens its page
 * ------------------------------------------------------------
 *  Look      Tilted disc (CSS perspective) with shaded slices, a beveled rim
 *            with pegs, a fixed light glare, visible thickness and a floor shadow.
 *  Motion    1. wind-up (pulls back)  2. release + friction slow-down
 *            3. the pointer catches a peg and rocks the wheel back into place.
 *            You can also grab the wheel and flick it: harder flick = longer spin.
 *  Feedback  A click and a pointer bounce for every peg, a whoosh on release,
 *            motion blur at speed, a chime + confetti + glowing slice on the win.
 *  Fairness  The café is chosen first with crypto.getRandomValues (equal odds);
 *            the physics is computed to land exactly on it.
 *  Then      ~2.4 s later the split-screen café page opens by itself.
 * ============================================================ */
const WHEEL_FILTERS = [
    { id: "all", label: "All cafés", test: () => true },
    { id: "open", label: "Open now", test: (c) => getOpenStatus(c).isOpen === true },
    { id: "unvisited", label: "Not visited yet", test: (c) => !getVisitedCafeIds().includes(c.id) },
    { id: "near", label: "Within 2 km", needsLocation: true, test: (c) => distanceTo(c) != null && distanceTo(c) <= 2000 }
];
const WHEEL_AUTO_OPEN_MS = 2400;
const WHEEL_SOUND_KEY = "cafespot_wheel_sound";
const TAU = Math.PI * 2;
const mod = (x, m) => ((x % m) + m) % m;
// Slice colours: [fill, label ink]. An odd count gets a third shade so the last slice never matches the first.
const WHEEL_SHADES = [["#057d3c", "#ffffff"], ["#eef9f1", "#04532a"], ["#f2b33d", "#3b2603"]];

const wheel = {
    filter: "all",
    list: [],
    rotation: 0,           // radians, clockwise
    spinning: false,
    frame: null,
    autoTimer: null,
    pickedId: null,
    winIndex: -1,
    lastIndex: -1,
    hadCoords: false,
    flap: 0,               // pointer deflection, degrees
    drag: null
};

/* ---------------- Sound (Web Audio, synthesized: no files to download) ---------------- */
const sound = { ctx: null, on: true, lastTick: 0, noise: null };
try { sound.on = localStorage.getItem(WHEEL_SOUND_KEY) !== "off"; } catch { /* storage blocked */ }

function audioCtx() {
    if (!sound.on) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!sound.ctx) sound.ctx = new AC();
    if (sound.ctx.state === "suspended") sound.ctx.resume();
    return sound.ctx;
}

/** Peg click: a short filtered blip, a little brighter when the wheel is fast. */
function playTick(speed = 0.5) {
    const ctx = audioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - sound.lastTick < 0.03) return; // at full speed, cap at ~33 clicks/s
    sound.lastTick = now;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1500 + Math.min(1, speed) * 700 + Math.random() * 120;
    filter.type = "bandpass";
    filter.frequency.value = 2600;
    filter.Q.value = 1.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

/** Release whoosh: a band-passed noise sweep. */
function playWhoosh(power = 1) {
    const ctx = audioCtx();
    if (!ctx) return;
    if (!sound.noise) {
        const len = ctx.sampleRate * 0.8;
        sound.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = sound.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = sound.noise;
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.exponentialRampToValueAtTime(1400 + 600 * power, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * Math.min(1.2, power), now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.65);
}

/** Win chime: a bright four-note arpeggio. */
function playChime() {
    const ctx = audioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const t = now + i * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.9 : 0.35));
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1);
    });
}

function setSound(on) {
    sound.on = on;
    try { localStorage.setItem(WHEEL_SOUND_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
    const btn = $("#wheel-sound");
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
    btn.title = on ? "Sound on" : "Sound off";
    btn.querySelector("use").setAttribute("href", on ? "#i-sound" : "#i-mute");
    if (!on && sound.ctx) sound.ctx.suspend();
}

/* ---------------- Cafés on the wheel ---------------- */
function wheelCafes() {
    const f = WHEEL_FILTERS.find((x) => x.id === wheel.filter) || WHEEL_FILTERS[0];
    return getCafes().filter(f.test).sort((a, b) => a.name.localeCompare(b.name));
}

function openWheel() {
    hideWheelResult();
    openDialog($("#wheel-modal"));
    setSound(sound.on);
    refreshWheel();
    setTimeout(() => $("#wheel-spin").focus(), 60);
    trackEvent("wheel_open");
}

function refreshWheel() {
    if (wheel.spinning) return;
    wheel.list = wheelCafes();
    wheel.winIndex = -1;
    $("#wheel-filters").innerHTML = WHEEL_FILTERS.map((f) => {
        const count = f.needsLocation && !locationState.coords ? null : getCafes().filter(f.test).length;
        const on = wheel.filter === f.id;
        return `<button type="button" class="filter-chip" role="radio" aria-checked="${on}" data-wheel-filter="${f.id}">
            ${esc(f.label)}${count == null ? "" : ` <span class="opacity-70">(${count})</span>`}</button>`;
    }).join("");

    const n = wheel.list.length;
    $$("[data-wheel-spin]").forEach((b) => (b.disabled = n < 2));
    let note;
    if (wheel.filter === "near" && !locationState.coords) {
        note = locationState.status === "watching" ? "Finding your location…" : "Turn on location to use this filter.";
    } else if (n === 0) note = "No cafés match. Pick another filter.";
    else if (n === 1) note = `Only ${wheel.list[0].name} matches, so no need to spin!`;
    else note = `${plural(n, "café")} on the wheel`;
    $("#wheel-readout").textContent = note;

    // The complete list, numbered like the slices (clockwise from the top), each linking to its page.
    $("#wheel-list-summary").textContent = `See all ${plural(n, "café")} on the wheel`;
    $("#wheel-list-items").innerHTML = wheel.list.map((c, i) => {
        const [fill] = WHEEL_SHADES[n % 2 === 1 && i === n - 1 ? 2 : i % 2];
        return `<li data-slice="${i}"><span class="wheel-list__dot" style="background:${fill}"></span>
            <a href="#/cafe/${esc(c.id)}" data-close-link>${esc(c.name)}</a></li>`;
    }).join("");
    drawWheel();
}

/* ---------------- Drawing (once per filter; spinning only rotates the canvas) ---------------- */
function drawWheel(highlight = -1) {
    const canvas = $("#wheel-canvas");
    const size = canvas.clientWidth || 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const c = size / 2;
    const rimW = Math.max(10, size * 0.045);
    const r = c - rimW;                      // slice radius
    const list = wheel.list;
    const n = Math.max(list.length, 1);
    const a = TAU / n;

    // 1. Slices
    for (let i = 0; i < n; i++) {
        const [fill] = list.length ? WHEEL_SHADES[n % 2 === 1 && i === n - 1 ? 2 : i % 2] : ["#eef9f1"];
        const start = -Math.PI / 2 + i * a;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, r, start, start + a);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }
    // 2. Lighting that is the same all the way round (so it can rotate): darker toward the rim, soft centre glow
    let g = ctx.createRadialGradient(c, c, r * 0.15, c, c, r);
    g.addColorStop(0, "rgba(255,255,255,.16)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fillStyle = g; ctx.fill();

    // 3. Divider lines + labels
    for (let i = 0; i < list.length; i++) {
        const start = -Math.PI / 2 + i * a;
        if (n <= 60) {
            ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + r * Math.cos(start), c + r * Math.sin(start));
            ctx.strokeStyle = n <= 24 ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.4)"; ctx.lineWidth = 1; ctx.stroke();
        }
        if (n <= 28) {
            const [, ink] = WHEEL_SHADES[n % 2 === 1 && i === n - 1 ? 2 : i % 2];
            const fontSize = n <= 8 ? 15 : n <= 16 ? 13 : 11;
            const maxChars = n <= 8 ? 22 : n <= 16 ? 18 : 15;
            const name = list[i].name.length > maxChars ? list[i].name.slice(0, maxChars - 1).trim() + "…" : list[i].name;
            ctx.save();
            ctx.translate(c, c);
            ctx.rotate(start + a / 2);
            ctx.font = `700 ${fontSize}px "Hanken Grotesk", Inter, system-ui, sans-serif`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.shadowColor = ink === "#ffffff" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.6)";
            ctx.shadowBlur = 2;
            ctx.fillStyle = ink;
            ctx.fillText(name, r - 14, 0);
            ctx.restore();
        }
    }

    // 4. Winning slice glow
    if (highlight >= 0 && highlight < list.length) {
        const start = -Math.PI / 2 + highlight * a;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, start, start + a); ctx.closePath();
        ctx.fillStyle = "rgba(255, 214, 92, .45)"; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#ffd65c"; ctx.shadowColor = "#ffd65c"; ctx.shadowBlur = 12; ctx.stroke();
        ctx.restore();
    }

    // 5. Beveled rim (radially symmetric shading reads as a rounded metal-rimmed edge)
    g = ctx.createRadialGradient(c, c, r - 1, c, c, c);
    g.addColorStop(0, "#02301a");
    g.addColorStop(0.35, "#0d7a44");
    g.addColorStop(0.6, "#3fbf7f");
    g.addColorStop(1, "#033a1f");
    ctx.beginPath(); ctx.arc(c, c, c - 0.5, 0, TAU); ctx.arc(c, c, r, 0, TAU, true);
    ctx.fillStyle = g; ctx.fill("evenodd");

    // 6. Pegs on the rim at every slice boundary (they make the clicks)
    const pegR = Math.max(2.2, Math.min(4.2, (TAU * (r + rimW / 2)) / n / 4.5));
    for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + i * a;
        const px = c + (r + rimW / 2) * Math.cos(ang);
        const py = c + (r + rimW / 2) * Math.sin(ang);
        const pg = ctx.createRadialGradient(px - pegR * 0.35, py - pegR * 0.35, 0.3, px, py, pegR);
        pg.addColorStop(0, "#ffffff");
        pg.addColorStop(0.45, "#f5d77a");
        pg.addColorStop(1, "#9a7414");
        ctx.beginPath(); ctx.arc(px, py, pegR, 0, TAU); ctx.fillStyle = pg; ctx.fill();
    }
    setWheelRotation(wheel.rotation);
}

function setWheelRotation(rad, blurPx = 0) {
    const canvas = $("#wheel-canvas");
    canvas.style.transform = `rotate(${rad}rad)`;
    canvas.style.filter = blurPx > 0.2 ? `blur(${blurPx.toFixed(2)}px)` : "";
}

/** Slice under the pointer (top centre) for a rotation. */
function sliceAtPointer(rad, n) {
    return Math.floor(mod(-rad, TAU) / (TAU / n)) % n;
}

function secureRandom() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32; // [0, 1)
}

/**
 * Rotation that puts `within` (0–1) of slice `pick` under the pointer,
 * at least `turns` full turns away from `start` in direction `dir` (+1 clockwise, −1 counter).
 */
function wheelTarget(start, dir, turns, pick, within, n) {
    const residue = mod(-(pick + within) * (TAU / n), TAU);
    let t = start + dir * turns * TAU;
    t = t - mod(t, TAU) + residue;
    if (dir > 0 && t < start + turns * TAU) t += TAU;
    if (dir < 0 && t > start - turns * TAU) t -= TAU;
    return t;
}

/* ---------------- The spin ---------------- */
/**
 * @param {object} opts  dir: +1/−1, power: 0.4–1.5 (flick strength), windUp: pull back first
 */
function spinWheel({ dir = 1, power = 0.9 + secureRandom() * 0.2, windUp = true } = {}) {
    const n = wheel.list.length;
    if (wheel.spinning || n < 2) return;
    hideWheelResult();
    if (wheel.winIndex >= 0) { wheel.winIndex = -1; drawWheel(); }

    const a = TAU / n;
    const pick = Math.floor(secureRandom() * n);          // the fair choice, made first
    const within = 0.3 + secureRandom() * 0.4;           // land well inside the slice
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turns = reduced ? 1 : Math.round(4 + 4 * power + secureRandom() * 2);
    const start = wheel.rotation;
    const target = wheelTarget(start, dir, turns, pick, within, n);
    const overshoot = reduced ? 0 : Math.min(0.17 * a, 0.06);   // how far past the pointer it drifts before rocking back
    const wind = windUp && !reduced ? Math.min(0.2, 0.45 * a + 0.08) : 0;
    const W = wind ? 300 : 0;                                    // wind-up ms
    const M = reduced ? 900 : 4200 + 1700 * Math.min(power, 1.3) + secureRandom() * 500;  // main spin ms
    const S = overshoot ? 650 : 0;                                // settle ms
    const s1 = start - dir * wind;
    const e1 = target + dir * overshoot;
    const K = 3.1;                                                // friction curve: velocity falls like (1-u)^2.1

    const rotationAt = (ms) => {
        if (ms < W) return start - dir * wind * (1 - Math.pow(1 - ms / W, 3));          // ease back
        if (ms < W + M) return s1 + (e1 - s1) * (1 - Math.pow(1 - (ms - W) / M, K));    // release + friction
        const u = Math.min(1, (ms - W - M) / (S || 1));
        return target + dir * overshoot * Math.exp(-5.5 * u) * Math.cos(2.6 * Math.PI * u); // peg rocks it back
    };
    const total = W + M + S;
    const t0 = performance.now();
    let prevRot = start;
    let prevT = t0;
    let released = false;

    wheel.spinning = true;
    wheel.lastIndex = sliceAtPointer(start, n);
    $("#wheel-modal").classList.add("is-spinning");
    $$("[data-wheel-spin], [data-wheel-filter]").forEach((b) => (b.disabled = true));
    $("#wheel-live").textContent = "Spinning…";
    trackEvent("wheel_spin", { filter: wheel.filter, size: n, flick: !windUp });
    if (!windUp) { playWhoosh(power); released = true; }

    const step = (now) => {
        const ms = now - t0;
        const rot = ms >= total ? target : rotationAt(ms);
        const dt = Math.max(1, now - prevT);
        const speed = Math.abs(rot - prevRot) / dt;                 // rad per ms
        if (!released && ms >= W) { released = true; playWhoosh(power); }
        setWheelRotation(rot, reduced ? 0 : Math.min(2.4, Math.max(0, speed - 0.012) * 90));

        // Pegs passing the pointer: click + flapper kick + live readout
        const idx = sliceAtPointer(rot, n);
        if (idx !== wheel.lastIndex) {
            wheel.lastIndex = idx;
            $("#wheel-readout").textContent = wheel.list[idx].name;
            $$("#wheel-list-items li.is-current").forEach((li) => li.classList.remove("is-current"));
            $(`#wheel-list-items li[data-slice="${idx}"]`)?.classList.add("is-current");
            if (!reduced) {
                const strength = Math.min(1, speed * 40 + 0.35);
                wheel.flap = (rot > prevRot ? -1 : 1) * 26 * strength;   // a peg shoves the pointer against the spin
                playTick(strength);
                if (navigator.vibrate && speed < 0.01) navigator.vibrate(4);
            }
        }
        wheel.flap *= 0.8;                                           // flapper springs back
        $("#wheel-flapper").style.setProperty("--flap", `${wheel.flap.toFixed(2)}deg`);
        prevRot = rot;
        prevT = now;

        if (ms < total) { wheel.frame = requestAnimationFrame(step); return; }
        wheel.rotation = mod(target, TAU);
        setWheelRotation(wheel.rotation);
        $("#wheel-flapper").style.setProperty("--flap", "0deg");
        wheel.spinning = false;
        $("#wheel-modal").classList.remove("is-spinning");
        $$("[data-wheel-spin], [data-wheel-filter]").forEach((b) => (b.disabled = false));
        landWheel(sliceAtPointer(wheel.rotation, n));             // equals `pick`
    };
    wheel.frame = requestAnimationFrame(step);
}

function landWheel(index) {
    const cafe = wheel.list[index];
    wheel.pickedId = cafe.id;
    wheel.winIndex = index;
    drawWheel(index);                                             // glowing winning slice
    $("#wheel-modal").classList.add("is-won");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    playChime();
    if (!reduced) burstConfetti();
    if (navigator.vibrate) navigator.vibrate([18, 40, 26]);

    const status = getOpenStatus(cafe);
    const d = distanceTo(cafe);
    const box = $("#wheel-result");
    box.innerHTML = `
      <p class="text-xs font-bold text-accent">Nakapili na ang wheel! Ayaw na'g reklamo:</p>
      <p class="wheel-result__name">${esc(cafe.name)}</p>
      <p class="text-sm text-muted">${esc(cafe.neighborhood || "Tagum City")}${d != null ? ` · <strong class="text-accent">${formatKm(d)}</strong> from you` : ""}</p>
      <div class="mt-2">${statusPill(status, { long: true })}</div>
      <div class="wheel-countdown" aria-hidden="true"><span style="animation-duration:${WHEEL_AUTO_OPEN_MS}ms"></span></div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button type="button" class="btn-primary flex-1 justify-center" data-wheel-go>Tara Kape ta diri</button>
        <button type="button" class="btn-outline" data-wheel-again>Spin pag-usab</button>
      </div>`;
    box.hidden = false;
    $("#wheel-spin").hidden = true;
    $("#wheel-readout").textContent = cafe.name;
    $("#wheel-live").textContent = `The wheel picked ${cafe.name.replace(/\.$/, "")}. Opening its page.`;
    trackEvent("wheel_pick", { id: cafe.id });
    recordCafeEvent(cafe.id, "wheel");
    wheel.autoTimer = setTimeout(goToWheelPick, WHEEL_AUTO_OPEN_MS); // then the split-screen page updates by itself
}

function hideWheelResult() {
    clearTimeout(wheel.autoTimer);
    $("#wheel-modal").classList.remove("is-won");
    $("#wheel-result").hidden = true;
    $("#wheel-result").innerHTML = "";
    $("#wheel-spin").hidden = false;
}

/** Open the picked café in the split-screen page (or refresh it if it's already open). */
function goToWheelPick() {
    clearTimeout(wheel.autoTimer);
    const id = wheel.pickedId;
    if (!id) return;
    state.fromWheel = id;
    closeDialog($("#wheel-modal"));
    if (location.hash === `#/cafe/${id}`) openCafeDetail(id);
    else location.hash = `#/cafe/${id}`;
}

/* ---------------- Confetti (lightweight canvas particles) ---------------- */
function burstConfetti() {
    const canvas = $("#wheel-confetti");
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ["#057d3c", "#10b981", "#f2b33d", "#ffd65c", "#ffffff", "#e11d48"];
    const parts = Array.from({ length: 90 }, () => {
        const ang = -Math.PI / 2 + (secureRandom() - 0.5) * 2.2;
        const v = 3 + secureRandom() * 5;
        return { x: box.width / 2, y: box.height * 0.08, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, w: 5 + secureRandom() * 5, h: 3 + secureRandom() * 4,
            rot: secureRandom() * TAU, vr: (secureRandom() - 0.5) * 0.4, color: colors[Math.floor(secureRandom() * colors.length)] };
    });
    const t0 = performance.now();
    const frame = (now) => {
        const life = (now - t0) / 1700;
        ctx.clearRect(0, 0, box.width, box.height);
        if (life >= 1 || !$("#wheel-modal").open) return;
        ctx.globalAlpha = Math.min(1, (1 - life) * 2);
        parts.forEach((p) => {
            p.vy += 0.18; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
            ctx.restore();
        });
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

/* ---------------- Grab and flick ---------------- */
function setupWheelDrag() {
    const body = $("#wheel-body");
    const angleAt = (e) => {
        const r = body.getBoundingClientRect();
        // The disc is tilted back, so its vertical axis looks squashed: undo that before measuring the angle.
        return Math.atan2((e.clientY - (r.top + r.height / 2)) / Math.cos(14 * Math.PI / 180), e.clientX - (r.left + r.width / 2));
    };
    body.addEventListener("pointerdown", (e) => {
        if (wheel.spinning || wheel.list.length < 2) return;
        body.setPointerCapture(e.pointerId);
        hideWheelResult();
        if (wheel.winIndex >= 0) { wheel.winIndex = -1; drawWheel(); }
        audioCtx(); // unlock audio inside the gesture
        wheel.drag = { id: e.pointerId, last: angleAt(e), samples: [{ rot: wheel.rotation, t: performance.now() }] };
        body.classList.add("is-grabbed");
    });
    body.addEventListener("pointermove", (e) => {
        const d = wheel.drag;
        if (!d || e.pointerId !== d.id) return;
        const ang = angleAt(e);
        let delta = ang - d.last;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        d.last = ang;
        wheel.rotation += delta;
        setWheelRotation(wheel.rotation);
        const idx = sliceAtPointer(wheel.rotation, wheel.list.length);
        if (idx !== wheel.lastIndex) { wheel.lastIndex = idx; playTick(0.3); $("#wheel-readout").textContent = wheel.list[idx].name; }
        d.samples.push({ rot: wheel.rotation, t: performance.now() });
        if (d.samples.length > 6) d.samples.shift();
    });
    const release = (e) => {
        const d = wheel.drag;
        if (!d || e.pointerId !== d.id) return;
        wheel.drag = null;
        body.classList.remove("is-grabbed");
        const last = d.samples[d.samples.length - 1];
        const recent = d.samples.filter((s) => last.t - s.t <= 120);      // speed over the final ~0.1 s of the drag
        const first = recent[0] || last;
        const v = (last.rot - first.rot) / Math.max(16, last.t - first.t); // rad per ms
        if (Math.abs(v) > 0.0025 && performance.now() - last.t < 120) {  // a flick, not a slow drag-and-hold
            spinWheel({ dir: Math.sign(v), power: Math.min(1.5, Math.max(0.4, Math.abs(v) / 0.02)), windUp: false });
        }
    };
    body.addEventListener("pointerup", release);
    body.addEventListener("pointercancel", release);
}

function setupWheel() {
    const dialog = $("#wheel-modal");
    dialog.addEventListener("click", (e) => {
        if (e.target.closest("[data-wheel-spin], [data-wheel-again]")) { audioCtx(); spinWheel(); return; }
        if (e.target.closest("[data-wheel-go]")) { goToWheelPick(); return; }
        const chip = e.target.closest("[data-wheel-filter]");
        if (chip && !wheel.spinning) {
            wheel.filter = chip.dataset.wheelFilter;
            hideWheelResult();
            if (wheel.filter === "near" && !locationState.coords && locationState.status !== "watching") toggleLocation();
            refreshWheel();
        }
    });
    $("#wheel-sound").addEventListener("click", () => { setSound(!sound.on); if (sound.on) playTick(0.5); });
    setupWheelDrag();
    // Closing mid-spin or before the auto-open: stop everything, open nothing.
    dialog.addEventListener("close", () => {
        cancelAnimationFrame(wheel.frame);
        clearTimeout(wheel.autoTimer);
        if (wheel.spinning) {
            wheel.spinning = false;
            wheel.rotation = mod(wheel.rotation, TAU);
            dialog.classList.remove("is-spinning");
            $$("[data-wheel-spin], [data-wheel-filter]").forEach((b) => (b.disabled = false));
        }
    });
    window.addEventListener("resize", debounce(() => { if (dialog.open && !wheel.spinning) drawWheel(wheel.winIndex); }, 150));
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
            setTimeout(() => showToast(`Bag-ong badge: ${b.name}! Pang-laban sa tapol.`), 350 + i * 400);
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
    signup: { icon: "i-user", text: () => "Created your Kapehan Tagum account" },
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
    <section class="k-hello" aria-labelledby="dash-title">
      <div class="min-w-0">
        <p class="k-hello__greet">${esc(greeting())}, ${esc(first)}</p>
        <h1 id="dash-title" class="k-hello__title">${esc(headline)}</h1>
        <p class="k-hello__sub">${sub}</p>
        <dl class="k-hello__stats">
          <div><dt>Stamps</dt><dd>${p.visitedCount}</dd></div>
          <div><dt>Badges</dt><dd>${earned}<small>/${p.badges.length}</small></dd></div>
          <div><dt>Saved</dt><dd>${p.savedIds.length}</dd></div>
          <div><dt>Reviews</dt><dd>${p.reviews.length}</dd></div>
        </dl>
      </div>
      <div class="k-ring" role="img" aria-label="${p.pct}% of Tagum cafés stamped">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="k-ring__track" cx="60" cy="60" r="52"/>
          <circle class="k-ring__fill ${p.pct === 0 ? "is-zero" : ""}" cx="60" cy="60" r="52" pathLength="100" style="--pct:${p.pct}"/>
        </svg>
        <div class="k-ring__label"><span class="k-ring__num">${p.pct}%</span><span class="k-ring__sub">${p.visitedCount} of ${p.total} cafés</span></div>
      </div>
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
        <div class="dash-section-head"><h2 id="dash-next-title">Sunod nga kape</h2>
          <a href="#/explore" class="k-link">All cafés</a></div>
        <div class="next-grid">${steps.map(nextCard).join("")}</div>
      </section>` : ""}
      <div class="grid lg:grid-cols-5 gap-5 mt-8">${stampsSection(p)}${badgesSection(p)}</div>`;
    dash.rendered = true;
}

/** Logged out: a strip under the hero that sells the dashboard (and shows guest stamps if any). */
function renderGuestProgress(p) {
    const el = $("#home-guest-progress");
    if (!el) return;
    const n = p.visitedCount;
    // A loyalty card: six numbered slots, filled with your real stamps (in the order you collected them).
    const slots = Array.from({ length: 6 }, (_, k) => {
        const st = p.stamps[k];
        return st ? `<span class="k-loyalty__slot is-filled">${stampSvg(st.cafe)}</span>` : `<span class="k-loyalty__slot">${k + 1}</span>`;
    }).join("");
    el.innerHTML = `
      <section class="k-loyalty" aria-labelledby="loyalty-title">
        <div class="k-loyalty__slots" aria-hidden="true">${slots}</div>
        <div class="min-w-0">
          <h2 id="loyalty-title">${n ? `You've collected ${plural(n, "stamp")} as a guest` : "Kolekta og stamps, pang-laban sa tapol"}</h2>
          <p>${n
        ? "Create an account to keep them under your name, unlock badges and see your café history."
        : "A free account gives you a dashboard: every café you've stamped, 10 badges to earn and what to try next."}</p>
        </div>
        <div class="k-loyalty__actions">
          <button type="button" class="btn-primary" data-action="open-auth" data-tab="register">Create free account</button>
          <button type="button" class="btn-outline" data-action="open-auth" data-tab="login">Log in</button>
        </div>
      </section>`;
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
    login: ["Welcome back! Kape ta?", "Log in to see your stamps, badges and history."],
    register: ["Apil na, libre ra!", "Keeps your stamps, badges and café history together. Kape lang ang bayad (sa café, dili diri)."],
    forgot: ["Reset your password", AUTH_MODE.recovery === "email-link"
        ? "Enter your account's email and we'll send you a link to choose a new password."
        : "Use the recovery key you saved when you created your account."],
    key: ["Save your recovery key", "You'll need it if you ever forget your password. It won't be shown again."],
    rekey: ["New recovery key", "Confirm it's you to make a replacement key."]
};
let authPanel = "login";
let pendingKey = null; // recovery key currently on screen (never stored anywhere)
let pendingSignIn = false; // true after sign-up / password reset: the role picker comes next
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
      <p class="text-xs font-bold text-muted">Accounts on this device</p>
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
        "Kapehan Tagum: account recovery key",
        "",
        `Account:  ${u ? `${u.name} (${u.handle}, ${u.email})` : ""}`,
        `Key:      ${pendingKey}`,
        `Created:  ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        "",
        "Forgot your password? Log In → Forgot password? → enter this key.",
        "Each key works once. Keep this file private."
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "kapehan-tagum-recovery-key.txt" });
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
                afterSignIn(user);                       // role picker, or straight to the remembered role's home
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
                pendingSignIn = true;                          // the role picker follows the key panel
                if (recoveryKey) showRecoveryKey(recoveryKey); // local mode: dialog stays open on the key panel
                else { closeDialog(modal); }                   // Firebase: recovery is by email, nothing to save
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
                pendingSignIn = true;
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
        // Signed up / reset and the dialog is done: pick a role next (Firebase sign-up closes straight away).
        if (pendingSignIn && getCurrentUser()) { pendingSignIn = false; setTimeout(() => afterSignIn(getCurrentUser()), 50); }
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
function openCafeForm(cafeId = null, { publish = false } = {}) {
    if (!getCurrentUser()) {
        showToast("Log in to add a cafe spot.", "info");
        openAuth("login");
        return;
    }
    const form = $("#cafe-form");
    resetForm(form);
    const ownerMode = publish || (cafeId && getCafe(cafeId)?.ownerId === getCurrentUser().id);
    $("#cafe-form-title").textContent = cafeId ? (ownerMode ? "Edit your listing" : "Edit Cafe") : publish ? "Publish your café" : "Add New Cafe Spot";
    $('#cafe-form button[type="submit"]').textContent = cafeId ? "Save changes" : publish ? "Publish café" : "Save Cafe";
    form.id.value = cafeId || "";
    form.note.value = "";
    form.menuText.value = "";
    form.dataset.menuOriginal = "";
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
        form.note.value = c.note || "";
        form.menuText.value = menuToText(c.menu || []);
        form.dataset.menuOriginal = form.menuText.value;
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
            facebook: form.facebook.value, instagram: form.instagram.value, phone: form.phone.value,
            note: form.note.value
        };
        // Only send the menu when it was edited, so existing "from ₱" prices stay as they are.
        if (form.menuText.value !== form.dataset.menuOriginal) data.menuText = form.menuText.value;
        try {
            if (editingId) {
                updateCafe(editingId, data);
                trackEvent("cafe_edit", { id: editingId });
                showToast("Cafe updated!");
            } else {
                const c = addCafe(data);
                trackEvent("cafe_add", { id: c.id });
                if (c.ownerId) {
                    own.selected = c.id;
                    showToast("Your café is live! Add official photos next.");
                } else showToast("Cafe added to the directory!");
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
        `<div class="stat-card"><p class="text-xs font-bold text-muted">${label}</p><p class="text-3xl font-extrabold text-accent mt-1">${n}</p></div>`
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
        <a href="#/cafe/${esc(cafe.id)}" style="color:#057d3c">Tara Kape ta diri</a>
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
    updateExploreUser();
    renderHeroSlip();
    if ($("#wheel-modal").open && wheel.filter === "near" && !!locationState.coords !== wheel.hadCoords) {
        wheel.hadCoords = !!locationState.coords; // refill "Within 2 km" once a position arrives
        refreshWheel();
    }
    if (!!locationState.coords !== dash.hadCoords) {   // only when location turns on/off, not every GPS tick
        dash.hadCoords = !!locationState.coords;
        refreshProgress();
    }

    // Update distances in place; only re-render the grid when the nearest-first order changes.
    if (state.sort === "distance") {
        const key = filteredCafes().map((c) => c.id).join("|");
        if (key !== state.lastOrderKey) renderExplore({ quiet: true });
    }
    $$("[data-distance-for]").forEach((el) => {
        const cafe = getCafe(el.dataset.distanceFor);
        const d = cafe && distanceTo(cafe);
        el.innerHTML = d != null ? `<svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#i-pin"/></svg>${formatDistance(d)}` : "";
    });

    onGateLocation();
    if (locationState.status !== lastLocationStatus) {
        if (!gate.open) { // while the location screen is up, it explains errors itself
            if (locationState.status === "denied") showToast("Location permission was denied.", "error");
            if (locationState.status === "unavailable") showToast("Couldn't get your location.", "error");
        }
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
 * FIRST-VISIT LOCATION SCREEN
 * ------------------------------------------------------------
 *  First visit: the screen covers the page from the first paint
 *  (see the inline script in <head>) and asks for location at once.
 *  While the browser prompt is up, the whole site renders underneath,
 *  and the position loads in the background:
 *    1. quick fix   (Wi-Fi / cell, ~1 s)  → distances work immediately
 *    2. GPS watch   (keeps refining as you move)
 *  Allowed → "Found you" → fades out into the page, everything ready.
 *  Blocked / no signal / http:// → a clear message + "Continue".
 *  Later visits: no screen. If permission was granted before, the
 *  location starts silently so maps and distances are ready anyway.
 * ============================================================ */
const GATE_KEY = "cafespot_location_gate";
const gate = { open: false, state: "", closeTimer: null };

const GATE_COPY = {
    asking: {
        title: "Asa man ka? Pangitaon nato ang duol nga kape",
        text: "Tap <strong>Allow</strong> when your browser asks. Then the map opens where you are and every café shows how far it is."
    },
    locating: { title: "Gipangita ka pa…", text: "Getting your position. Kadali ra, mga usa o duha ka segundo." },
    ready: { title: "Nakit-an ka na!", text: "" },
    denied: {
        title: "Naka-off ang location",
        text: "You can still browse every café; distances just won't show. To turn it on later, tap the lock icon next to the web address and allow Location.",
        primary: null, skip: "Continue"
    },
    unavailable: {
        title: "Couldn't find you",
        text: "Your device didn't share a position. Check that location services (GPS) are on, then try again.",
        primary: "Try again", skip: "Continue without location"
    },
    insecure: {
        title: "Location needs a secure link",
        text: "Open the site with <strong>https://</strong> to see distances. Everything else works here.",
        primary: null, skip: "Continue"
    },
    unsupported: {
        title: "This browser can't share location",
        text: "You can still browse every café and use the map; distances won't show.",
        primary: null, skip: "Continue"
    }
};

function setGateState(state, extraText = "") {
    if (!gate.open || gate.state === state) return;
    gate.state = state;
    const el = $("#locate-gate");
    const copy = GATE_COPY[state];
    el.dataset.state = state;
    $("#gate-title").textContent = copy.title;
    $("#gate-text").innerHTML = extraText || copy.text;
    const primary = $("#gate-primary");
    primary.hidden = !copy.primary;
    if (copy.primary) primary.textContent = copy.primary;
    $("#gate-skip").textContent = copy.skip || "Continue without location";
    if (copy.primary) primary.focus(); else if (copy.skip) $("#gate-skip").focus();
}

function closeLocationGate({ delay = 0 } = {}) {
    if (!gate.open) return;
    clearTimeout(gate.closeTimer);
    gate.closeTimer = setTimeout(() => {
        gate.open = false;
        try { localStorage.setItem(GATE_KEY, "done"); } catch { /* storage blocked: the screen shows again next time */ }
        const el = $("#locate-gate");
        el.classList.add("is-leaving");
        document.body.classList.remove("gate-open");
        setTimeout(() => { el.hidden = true; document.documentElement.classList.add("gate-done"); }, 520);
        $("#main").focus({ preventScroll: true });
        trackEvent("location_gate", { result: locationState.coords ? "located" : gate.state || "skipped" });
    }, delay);
}

/** Called on every location update while the screen is open. */
function onGateLocation() {
    if (!gate.open) return;
    const s = locationState.status;
    if (locationState.coords) {
        const near = getCafes().filter((c) => distanceMeters(locationState.coords, c) <= 1000).length;
        const total = getCafes().length;
        const far = distanceMeters(locationState.coords, { lat: CONFIG.TAGUM_CENTER[0], lng: CONFIG.TAGUM_CENTER[1] }) > 30_000;
        setGateState("ready", far
            ? `You're outside Tagum City, so distances are from where you are now. Opening the ${total} cafés…`
            : near ? `${plural(near, "café")} within 1 km of you. Tara kape!` : `Medyo layo-layo ang pinakaduol nga kape, pero kaya ra. Tara!`);
        closeLocationGate({ delay: 1100 });
    } else if (s === "denied") setGateState("denied");
    else if (s === "unavailable") setGateState("unavailable");
    else if (s === "unsupported") setGateState("unsupported");
}

function askForLocation() {
    if (!window.isSecureContext) { setGateState("insecure"); return; }
    if (!("geolocation" in navigator)) { setGateState("unsupported"); return; }
    gate.state = ""; // allow re-entering "asking"/"locating"
    startLocationWatch();   // the browser prompt appears now (first time only)
    requestQuickFix();      // fast, rough position while GPS warms up
}

async function setupLocationGate() {
    const el = $("#locate-gate");
    const firstVisit = !document.documentElement.classList.contains("gate-done");
    const perm = await getLocationPermission();

    if (!firstVisit) {
        el.hidden = true;
        // Returning visitor who already allowed location: start quietly so everything is ready.
        if (perm && perm.state === "granted" && window.isSecureContext) { startLocationWatch(); requestQuickFix(); }
        return;
    }

    gate.open = true;
    document.body.classList.add("gate-open");
    $("#gate-skip").addEventListener("click", () => closeLocationGate());
    $("#gate-primary").addEventListener("click", () => {
        if (gate.state === "unavailable") { stopLocationWatch(false); setGateState("locating"); askForLocation(); }
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLocationGate(); });

    if (perm) {
        setGateState(perm.state === "granted" ? "locating" : perm.state === "denied" ? "denied" : "asking");
        perm.onchange = () => {            // the person just answered the browser prompt
            if (perm.state === "granted") setGateState("locating");
            if (perm.state === "denied") setGateState("denied");
        };
        if (perm.state === "denied") return; // don't trigger an error prompt; just explain
    } else {
        setGateState("asking");
    }
    $("#gate-skip").focus();
    askForLocation();
}

/* ============================================================
 * ROLES — café finder vs café owner
 *   After log-in the person picks a role (or it's remembered):
 *     finder → Explore (directory + map), Checklist, Leaderboard
 *     owner  → Owner dashboard (publish, official photos, analytics)
 *   The navigation shows only that role's items (body[data-persona]).
 * ============================================================ */
let roleChoice = null;

function applyPersona() {
    const me = getCurrentUser();
    const persona = me && me.role !== "admin" && getPersona() === "owner" ? "owner" : "finder";
    document.body.dataset.persona = persona;
    requestAnimationFrame(positionNavIndicators);
    return persona;
}

function goToPersonaHome(persona) {
    applyPersona();
    navigate(persona === "owner" ? "owner" : "explore");
}

/** Where to go right after logging in / signing up. */
function afterSignIn(user) {
    if (user.role === "admin") { navigate("admin"); return; }
    const persona = getPersona(user.id);
    if (persona && personaRemembered(user.id)) {
        applyPersona();
        if (state.route === "cafe") return;          // they logged in to review a café: stay there
        goToPersonaHome(persona);
        return;
    }
    openRolePicker();
}

function openRolePicker() {
    roleChoice = getPersona();
    $$("[data-persona-choice]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.personaChoice === roleChoice)));
    $("#role-continue").disabled = !roleChoice;
    $("#role-remember").checked = getPersona() ? personaRemembered() : true;
    openDialog($("#role-modal"));
    setTimeout(() => ($(`[data-persona-choice="${roleChoice || "finder"}"]`) || $("[data-persona-choice]")).focus(), 60);
}

function setupRolePicker() {
    const modal = $("#role-modal");
    modal.addEventListener("click", (e) => {
        const opt = e.target.closest("[data-persona-choice]");
        if (!opt) return;
        roleChoice = opt.dataset.personaChoice;
        $$("[data-persona-choice]").forEach((b) => b.setAttribute("aria-checked", String(b === opt)));
        $("#role-continue").disabled = false;
    });
    // Arrow keys move between the two options (radio-group behaviour)
    modal.addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) || !e.target.closest("[data-persona-choice]")) return;
        e.preventDefault();
        const opts = $$("[data-persona-choice]");
        const next = opts[(opts.indexOf(e.target.closest("[data-persona-choice]")) + 1) % opts.length];
        next.focus(); next.click();
    });
    $("#role-continue").addEventListener("click", () => {
        if (!roleChoice) return;
        setPersona(roleChoice, $("#role-remember").checked);
        trackEvent("persona", { persona: roleChoice });
        closeDialog(modal);
        renderAll();
        showToast(roleChoice === "owner" ? "You're set up as a café owner." : "You're set up as a café finder.");
        goToPersonaHome(roleChoice);
    });
    // Closed without choosing: default to finder (not remembered, so they're asked again next log-in)
    modal.addEventListener("close", () => {
        if (getCurrentUser() && !getPersona()) { setPersona("finder", false); applyPersona(); renderAll(); }
    });
}

/* ============================================================
 * LEADERBOARD (finders)
 * ============================================================ */
const lb = { tab: "people" };

function renderLeaderboard() {
    const el = $("#leaderboard-body");
    if (!el) return;
    const me = getCurrentUser();
    const people = getLeaderboard();
    const cafes = getCafeLeaderboard(10);
    const top = Math.max(1, people[0]?.stamps || 0);
    const topCafe = Math.max(1, cafes[0]?.people || 0);

    const peopleList = people.length ? `<ol class="lb-list">${people.map((r, i) => `
        <li class="lb-row${r.isMe ? " is-me" : ""}" style="--i:${Math.min(i, 12)}">
          <span class="lb-rank${r.rank && r.rank <= 3 ? ` lb-rank--${r.rank}` : ""}">${r.rank ?? "="}</span>
          <span class="avatar">${esc(initials(r.name))}</span>
          <span class="lb-who"><b>${esc(r.name)}${r.isMe ? " (you)" : ""}</b><small>${esc(r.handle)} · ${plural(r.badges, "badge")}${r.reviews ? ` · ${plural(r.reviews, "review")}` : ""}</small></span>
          <span class="lb-score"><b>${r.stamps}</b><small>${r.stamps === 1 ? "café" : "cafés"}</small></span>
          <span class="lb-bar" aria-hidden="true"><span style="width:${(r.stamps / top) * 100}%"></span></span>
        </li>`).join("")}</ol>`
        : `<div class="owner-empty"><p class="font-bold">No explorers yet</p><p class="text-sm text-muted mt-1">Log in as a café finder and tick a café you've visited to get on the board.</p></div>`;

    const cafeList = cafes.length ? `<ol class="lb-list">${cafes.map((r, i) => `
        <li class="lb-row" style="--i:${Math.min(i, 12)}">
          <span class="lb-rank${i < 3 ? ` lb-rank--${i + 1}` : ""}">${i + 1}</span>
          <span class="lb-who"><b><a href="#/cafe/${esc(r.cafe.id)}">${esc(r.cafe.name)}</a></b><small>${esc(r.cafe.neighborhood || "Tagum City")}</small></span>
          <span class="lb-score"><b>${r.people}</b><small>${r.people === 1 ? "visitor" : "visitors"}</small></span>
          <span class="lb-bar" aria-hidden="true"><span style="width:${(r.people / topCafe) * 100}%"></span></span>
        </li>`).join("")}</ol>`
        : `<div class="owner-empty"><p class="font-bold">No visits ticked yet</p><p class="text-sm text-muted mt-1">The cafés people tick off most will show up here.</p></div>`;

    el.innerHTML = `
      <header class="mb-4">
        <h1 class="x-title">Mga Hari ug Rayna sa Kape</h1>
        <p class="text-muted mt-1">Kinsa'y pinakadaghan og nabisitahan nga kapehan sa Tagum, ug asa ang pinaka-binalikan.</p>
      </header>
      ${!me ? `<div class="lb-join"><span>Log in as a café finder to join the board.</span><button type="button" class="btn-primary" data-action="open-auth" data-tab="login">Log in</button></div>` : ""}
      <div class="seg-filter mb-4" role="tablist" aria-label="Leaderboard">
        <button type="button" role="tab" aria-selected="${lb.tab === "people"}" aria-checked="${lb.tab === "people"}" data-lb-tab="people">Top explorers</button>
        <button type="button" role="tab" aria-selected="${lb.tab === "cafes"}" aria-checked="${lb.tab === "cafes"}" data-lb-tab="cafes">Most-visited cafés</button>
      </div>
      ${lb.tab === "people" ? peopleList : cafeList}
      <p class="text-xs text-muted mt-4">Counts finders using Kapehan Tagum on this device. Once the site runs on a shared backend, everyone in Tagum appears on one board.</p>`;
}

/* ============================================================
 * OWNER DASHBOARD
 *   publish/edit listings · official photos · page analytics
 * ============================================================ */
const own = { selected: null, urls: [], photos: [] };
const fmtShortDay = (iso) => new Date(`${iso}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

/** Single-series bar chart (SVG): rounded tops on a shared baseline, hover/focus tooltip, recessive grid. */
function barChart(rows, key, { title, unit }) {
    const W = 560, H = 190, padL = 30, padR = 6, padT = 12, padB = 24;
    const max = Math.max(...rows.map((r) => r[key]), 0);
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const top = steps.find((s) => s >= max) || Math.ceil(max / 1000) * 1000;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const slot = plotW / rows.length, bw = Math.max(4, slot - 4);
    const y = (v) => padT + plotH - (v / top) * plotH;
    const grid = [0, top / 2, top].map((v) => `
        <line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="chart-grid${v === 0 ? " chart-grid--base" : ""}"/>
        <text x="${padL - 6}" y="${y(v) + 4}" class="chart-axis" text-anchor="end">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`).join("");
    const bars = rows.map((r, i) => {
        const v = r[key];
        const x = padL + i * slot + (slot - bw) / 2;
        const h = Math.max(0, (v / top) * plotH);
        const rr = Math.min(4, h / 2, bw / 2);
        const yTop = padT + plotH - h;
        const d = h > 0 ? `M${x},${padT + plotH} V${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + bw - rr} Q${x + bw},${yTop} ${x + bw},${yTop + rr} V${padT + plotH} Z` : "";
        const tip = `${fmtShortDay(r.day)}: ${v} ${v === 1 ? unit : unit + "s"}`;
        const label = i % Math.ceil(rows.length / 7) === 0 || i === rows.length - 1
            ? `<text x="${x + bw / 2}" y="${H - 6}" class="chart-axis" text-anchor="middle">${fmtShortDay(r.day)}</text>` : "";
        return `<g class="chart-bar" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">
            <rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" class="chart-hit"/>
            ${d ? `<path d="${d}" class="chart-mark"/>` : ""}${label}</g>`;
    }).join("");
    return `<figure class="chart">
        <figcaption class="chart-title">${esc(title)}</figcaption>
        <div class="chart-box"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg">${grid}${bars}</svg><div class="chart-tip" hidden></div></div>
      </figure>`;
}

function kpi(label, value, sub = "") {
    return `<div class="kpi"><p class="kpi__label">${esc(label)}</p><p class="kpi__value">${value}</p>${sub ? `<p class="kpi__sub">${sub}</p>` : ""}</div>`;
}
function trend(now, before) {
    if (!before && !now) return "No activity yet";
    if (!before) return "New this fortnight";
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0 ? "Same as the 14 days before" : `${pct > 0 ? "Up" : "Down"} ${Math.abs(pct)}% on the 14 days before`;
}

async function renderOwner() {
    const el = $("#owner-body");
    if (!el) return;
    const me = getCurrentUser();
    own.urls.forEach((u) => URL.revokeObjectURL(u));
    own.urls = [];

    if (!me) {
        el.innerHTML = `<section class="account-guest"><span class="feature-icon"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-store"/></svg></span>
            <h1 class="x-title mt-3">Owner dashboard</h1>
            <p class="text-muted mt-2 max-w-prose">Run a café in Tagum? Log in, choose <strong>Café owner</strong>, and publish your listing with official photos and your menu.</p>
            <div class="flex flex-wrap gap-2 mt-5"><button type="button" class="btn-primary" data-action="open-auth" data-tab="login">Log in</button>
            <button type="button" class="btn-outline" data-action="open-auth" data-tab="register">Create free account</button></div></section>`;
        return;
    }
    if (me.role === "admin" || getPersona() !== "owner") {
        el.innerHTML = `<section class="account-guest"><span class="feature-icon"><svg class="w-5 h-5" aria-hidden="true"><use href="#i-store"/></svg></span>
            <h1 class="x-title mt-3">Owner dashboard</h1>
            <p class="text-muted mt-2 max-w-prose">${me.role === "admin" ? "Admins manage every listing from the admin dashboard." : "This page is for café owners. Switch your role to publish and manage a café."}</p>
            ${me.role === "admin" ? `<a href="#/admin" class="btn-primary mt-5">Admin dashboard</a>` : `<button type="button" class="btn-primary mt-5" data-action="set-persona" data-persona="owner">Switch to café owner</button>`}</section>`;
        return;
    }

    const cafes = getOwnedCafes();
    const head = `
      <header class="owner-head">
        <div><h1 class="x-title">Owner dashboard</h1>
        <p class="text-muted mt-1">${cafes.length ? "Your listings, official photos and how your page is doing." : "Get your café in front of Tagum's café-goers."}</p></div>
        <button type="button" class="btn-primary" data-action="owner-publish"><svg class="w-4 h-4" aria-hidden="true"><use href="#i-plus"/></svg>Publish a café</button>
      </header>`;

    if (!cafes.length) {
        el.innerHTML = `${head}
          <section class="owner-empty owner-steps">
            <ol>
              <li><b>Publish your listing</b><span>Name, address, hours, description and menu with prices.</span></li>
              <li><b>Add official photos</b><span>Up to ${OWNER_PHOTO_LIMIT} photos. They appear on your café page instead of stock images.</span></li>
              <li><b>Watch your page</b><span>Views, check-ins, saves and direction taps, day by day.</span></li>
            </ol>
            <button type="button" class="btn-primary mt-4" data-action="owner-publish">Publish your café</button>
          </section>`;
        return;
    }

    if (!cafes.some((c) => c.id === own.selected)) own.selected = cafes[0].id;
    const cafe = cafes.find((c) => c.id === own.selected);
    const st = getCafeStats(cafe.id, 14);
    const engaged = st.period.checkin + st.period.save + st.period.directions + st.period.social;
    const rate = st.period.view ? Math.round((engaged / st.period.view) * 100) : null;

    el.innerHTML = `${head}
      ${cafes.length > 1 ? `<div class="seg-filter mb-4" role="tablist" aria-label="Your cafés">${cafes.map((c) =>
        `<button type="button" role="tab" aria-selected="${c.id === cafe.id}" aria-checked="${c.id === cafe.id}" data-action="owner-select" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>` : ""}

      <section class="owner-card owner-listing" aria-labelledby="owner-cafe-name">
        <div class="min-w-0">
          <p class="owner-pill">Published ${cafe.publishedAt ? esc(fmtDate(cafe.publishedAt, { month: "short", day: "numeric", year: "numeric" })) : ""}</p>
          <h2 id="owner-cafe-name" class="owner-cafe-name">${esc(cafe.name)}</h2>
          <p class="text-sm text-muted">${esc(cafe.address)} · ${esc(formatHours(cafe))}</p>
          <p class="text-sm text-muted mt-1">${plural((cafe.menu || []).length, "menu item")} · ${(cafe.tags || []).length ? cafe.tags.map((t) => `#${esc(t)}`).join(" ") : "no amenities set"}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a class="btn-outline" href="#/cafe/${esc(cafe.id)}">View page</a>
          <button type="button" class="btn-primary" data-action="owner-edit" data-id="${esc(cafe.id)}">Edit listing</button>
          <button type="button" class="mini-btn danger" data-action="owner-delete" data-id="${esc(cafe.id)}">Remove</button>
        </div>
      </section>

      <section aria-labelledby="owner-stats-h" class="mt-6">
        <h2 id="owner-stats-h" class="owner-h2">Last 14 days</h2>
        <div class="kpi-grid">
          ${kpi("Page views", st.period.view, trend(st.period.view, st.previous.view))}
          ${kpi("Check-ins", st.period.checkin, `${plural(st.stampedBy, "person has", "people have")} it ticked off`)}
          ${kpi("Saves", st.period.save, `${plural(st.savedBy, "person has", "people have")} it saved`)}
          ${kpi("Direction taps", st.period.directions, `${plural(st.period.social, "tap")} on your social links`)}
          ${kpi("Engagement", rate == null ? "–" : `${rate}%`, "of views led to a check-in, save, directions or social tap")}
          ${kpi("Reviews", st.reviews, st.rating != null ? `${st.rating.toFixed(1)} ★ average` : "No reviews yet")}
        </div>
        <div class="owner-charts">
          ${barChart(st.series, "view", { title: "Page views per day", unit: "view" })}
          ${barChart(st.series, "checkin", { title: "Check-ins per day", unit: "check-in" })}
        </div>
        <details class="owner-table">
          <summary>Show the numbers as a table</summary>
          <div class="overflow-x-auto"><table class="admin-table">
            <thead><tr><th scope="col">Day</th><th scope="col">Views</th><th scope="col">Previews</th><th scope="col">Check-ins</th><th scope="col">Saves</th><th scope="col">Directions</th><th scope="col">Social</th><th scope="col">Wheel picks</th></tr></thead>
            <tbody>${st.series.slice().reverse().map((r) => `<tr><td>${esc(fmtShortDay(r.day))}</td><td>${r.view}</td><td>${r.preview}</td><td>${r.checkin}</td><td>${r.save}</td><td>${r.directions}</td><td>${r.social}</td><td>${r.wheel}</td></tr>`).join("")}</tbody>
          </table></div>
        </details>
        <p class="text-xs text-muted mt-2">All time: ${plural(st.allTime.view, "view")}, ${plural(st.allTime.checkin, "check-in")}, ${plural(st.allTime.wheel, "wheel pick")}. This copy of Kapehan Tagum counts activity in this browser; with a shared backend, every visitor is counted.</p>
      </section>

      <section class="owner-card mt-6" aria-labelledby="owner-photos-h">
        <div class="dash-section-head"><h2 id="owner-photos-h">Official photos</h2><span class="count" id="owner-photo-count"></span></div>
        <label class="photo-drop" id="photo-drop">
          <input type="file" id="owner-photo-input" accept="image/*" multiple class="sr-only" />
          <svg class="w-6 h-6" aria-hidden="true"><use href="#i-upload"/></svg>
          <span><b>Add photos</b> or drop them here</span>
          <small>JPG, PNG or WebP. They're resized for fast loading. The first photo is your cover.</small>
        </label>
        <div id="owner-photo-grid" class="owner-photo-grid" aria-live="polite"></div>
      </section>`;

    bindChartTips(el);
    await renderOwnerPhotos(cafe.id);
}

async function renderOwnerPhotos(cafeId) {
    const grid = $("#owner-photo-grid");
    if (!grid) return;
    own.urls.forEach((u) => URL.revokeObjectURL(u));
    own.urls = [];
    own.photos = await listOwnerPhotos(cafeId);
    $("#owner-photo-count").textContent = `${own.photos.length} of ${OWNER_PHOTO_LIMIT}`;
    grid.innerHTML = own.photos.length ? own.photos.map((p, i) => {
        const url = URL.createObjectURL(p.blob);
        own.urls.push(url);
        return `<figure class="owner-photo" data-photo-id="${esc(p.id)}" style="--i:${i}">
            <img src="${url}" alt="${esc(p.alt || `Photo ${i + 1}`)}" />
            ${i === 0 ? `<span class="owner-photo__cover">Cover</span>` : ""}
            <figcaption>
              <label class="sr-only" for="alt-${esc(p.id)}">Describe photo ${i + 1}</label>
              <input id="alt-${esc(p.id)}" class="input owner-photo__alt" maxlength="140" value="${esc(p.alt)}" placeholder="Describe it (e.g. Spanish latte)" data-photo-alt="${esc(p.id)}" />
              <span class="flex gap-1">
                ${i > 0 ? `<button type="button" class="mini-btn" data-photo-cover="${esc(p.id)}">Make cover</button>` : ""}
                <button type="button" class="mini-btn danger" data-photo-remove="${esc(p.id)}">Remove</button>
              </span>
            </figcaption>
          </figure>`;
    }).join("") : `<p class="text-sm text-muted">No official photos yet. Your café page shows a "See photos on Facebook" card until you add some.</p>`;
}

/** Downscale to max 1600 px and re-encode as JPEG (~150–300 KB) before storing. */
async function resizeImage(file, max = 1600) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`${file.name} isn't an image this browser can read.`)); i.src = url; });
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function uploadOwnerPhotos(files) {
    const cafeId = own.selected;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) { showToast("Choose image files (JPG, PNG or WebP).", "error"); return; }
    let added = 0;
    for (const f of list) {
        try {
            const blob = await resizeImage(f);
            await addOwnerPhoto(cafeId, blob, { alt: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80) });
            added++;
        } catch (err) {
            showToast(err.message, "error", 4000);
            break;
        }
    }
    if (added) showToast(`${plural(added, "photo")} added. Describe each one so everyone knows what's in it.`);
    await renderOwnerPhotos(cafeId);
}

function bindChartTips(root) {
    $$(".chart-box", root).forEach((box) => {
        const tip = $(".chart-tip", box);
        const show = (bar) => {
            const r = bar.getBoundingClientRect(), b = box.getBoundingClientRect();
            tip.textContent = bar.dataset.tip;
            tip.hidden = false;
            tip.style.left = `${Math.min(b.width - 8, Math.max(8, r.left - b.left + r.width / 2))}px`;
            $$(".chart-bar.is-active", box).forEach((x) => x.classList.remove("is-active"));
            bar.classList.add("is-active");
        };
        const hide = () => { tip.hidden = true; $$(".chart-bar.is-active", box).forEach((x) => x.classList.remove("is-active")); };
        box.addEventListener("pointerover", (e) => { const bar = e.target.closest(".chart-bar"); if (bar) show(bar); });
        box.addEventListener("pointerleave", hide);
        box.addEventListener("focusin", (e) => { const bar = e.target.closest(".chart-bar"); if (bar) show(bar); });
        box.addEventListener("focusout", hide);
    });
}

function setupOwner() {
    const body = $("#owner-body");
    body.addEventListener("change", async (e) => {
        if (e.target.id === "owner-photo-input") { await uploadOwnerPhotos(e.target.files); e.target.value = ""; return; }
        const altId = e.target.dataset.photoAlt;
        if (altId) {
            const p = own.photos.find((x) => x.id === altId);
            if (p) { await updateOwnerPhoto(p, { alt: e.target.value.trim() }); p.alt = e.target.value.trim(); showToast("Photo description saved."); }
        }
    });
    body.addEventListener("click", async (e) => {
        const cover = e.target.closest("[data-photo-cover]");
        if (cover) {
            const p = own.photos.find((x) => x.id === cover.dataset.photoCover);
            if (p) { await updateOwnerPhoto(p, { order: own.photos[0].order - 1 }); await renderOwnerPhotos(own.selected); showToast("Cover photo updated."); }
            return;
        }
        const remove = e.target.closest("[data-photo-remove]");
        if (remove) {
            const p = own.photos.find((x) => x.id === remove.dataset.photoRemove);
            if (p && await confirmAction("Remove this photo from your café page?", "Remove")) { await deleteOwnerPhoto(p); await renderOwnerPhotos(own.selected); showToast("Photo removed.", "info"); }
        }
    });
    // Drag & drop onto the upload area
    body.addEventListener("dragover", (e) => { const drop = e.target.closest("#photo-drop"); if (drop) { e.preventDefault(); drop.classList.add("is-over"); } });
    body.addEventListener("dragleave", (e) => { e.target.closest("#photo-drop")?.classList.remove("is-over"); });
    body.addEventListener("drop", (e) => {
        const drop = e.target.closest("#photo-drop");
        if (!drop) return;
        e.preventDefault();
        drop.classList.remove("is-over");
        uploadOwnerPhotos(e.dataTransfer.files);
    });
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
        const tracked = e.target.closest("[data-track]");          // directions / social taps → owner analytics
        if (tracked) recordCafeEvent(tracked.dataset.id, tracked.dataset.track);
        const lbTab = e.target.closest("[data-lb-tab]");
        if (lbTab) { lb.tab = lbTab.dataset.lbTab; renderLeaderboard(); return; }
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
                if (nowSaved) recordCafeEvent(id, "save");
                syncCafeControls(id);
                $$(`[data-action="toggle-save"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
                    b.classList.remove("burst"); void b.offsetWidth; b.classList.add("burst");
                });
                showToast(nowSaved ? "Na-save! Balikan nato ni." : "Gikuha sa imong saved spots.", nowSaved ? "success" : "info");
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

                renderExplore();
                break;
            }
            case "clear-filters":
                state.tags.clear();
                state.search = "";
                state.area = "";
                state.visit = "all";
                $("#area-select").value = "";
                $("#search-input").value = "";
                renderTagFilters();
                renderProgress();
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
            case "set-persona":
                setPersona(el.dataset.persona, personaRemembered());
                renderAll();
                showToast(el.dataset.persona === "owner" ? "Switched to café owner." : "Switched to café finder.");
                goToPersonaHome(el.dataset.persona);
                break;
            case "owner-publish":
                openCafeForm(null, { publish: true });
                break;
            case "owner-edit":
                openCafeForm(id);
                break;
            case "owner-select":
                own.selected = id;
                renderOwner();
                break;
            case "owner-delete": {
                const cafe = getCafe(id);
                if (await confirmAction(`Remove "${cafe?.name}" from Kapehan Tagum? Its page, photos and stats will no longer be shown.`, "Remove")) {
                    deleteCafe(id);
                    (await listOwnerPhotos(id)).forEach((p) => deleteOwnerPhoto(p));
                    own.selected = null;
                    showToast("Listing removed.", "info");
                    renderAll();
                }
                break;
            }
            case "x-select":
                selectExploreCafe(id);
                break;
            case "explore-fit":
                fitExploreMap();
                break;
            case "open-wheel":
                openWheel();
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
                state.search = ""; state.area = "";
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
                renderAccount();
                break;
        }
    });

    document.addEventListener("change", (e) => {
        const el = e.target.closest('[data-action="toggle-visit"]');
        if (!el) return;
        const id = el.dataset.id;
        const nowVisited = toggleVisitedCafe(id);
        if (nowVisited) recordCafeEvent(id, "checkin");
        syncCafeControls(id, { press: nowVisited });
        syncDetailStamp(id, { press: nowVisited });
        syncExploreRow(id, { press: nowVisited });
        syncChecklistItem(id, { press: nowVisited });
        renderProgress(nowVisited ? id : null);
        trackEvent(nowVisited ? "visit_cafe" : "unvisit_cafe", { id });
        if (nowVisited) {
            const cafes = getCafes();
            const done = getVisitedCafeIds().filter((v) => cafes.some((c) => c.id === v)).length;
            showToast(done === cafes.length ? "Nalibot na nimo tanang kapehan sa Tagum! Legend ka, bai." : `Na-stamp na: ${getCafe(id)?.name || "café"}. Tara kape!`);
        } else {
            showToast("Gikuha ang stamp.", "info");
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

        trackEvent("filter", { area: state.area || "all" });
        renderExplore();
    });

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
    setupExplore();
    setupChecklist();
    setupRolePicker();
    setupOwner();
    setupMotion();
    window.addEventListener("resize", debounce(positionNavIndicators, 120));
    setupWheel();
    renderTagFilters();
    onLocationChange(onLocationUpdate);
    setupLocationGate();   // first visit: ask for location before the page is shown
    onAuthChange(() => renderAll({ announce: true })); // Firebase restores sessions asynchronously
    updateLocationUI();
    renderAll();

    window.addEventListener("hashchange", () => handleRoute(false));
    handleRoute(true);

    // Refresh open/closed status every minute
    setInterval(() => {
        if ($$("dialog[open]").length) return;
        renderExplore({ quiet: true }); renderHomeTop(); updateMapMarkers(); renderNearbyList();
    }, 60_000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();