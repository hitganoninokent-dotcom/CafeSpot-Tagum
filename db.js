/**
 * Kapehan Tagum — LocalStorage Database Engine
 * ------------------------------------------------------------
 * Handles: seed data, cafe CRUD, reviews, saved/visited lists,
 * user registration + login (PBKDF2-hashed passwords), admin auth,
 * session persistence ("remember me"), account recovery keys,
 * activity history + badges, rate limiting, analytics event log,
 * cookie consent and live-location state.
 *
 * IMPORTANT — "secrets off the frontend":
 * Everything in this file ships to the browser, so nothing here is
 * truly secret. We never store a plaintext password (only salted
 * SHA-256 hashes), but a real deployment MUST move auth, the admin
 * check and the cafe directory to a server/API (e.g. Supabase,
 * Firebase, or your own backend) and keep keys in server-side env vars.
 */

/* ============================================================
 * 1. CONFIG (public, non-secret values only)
 * ============================================================ */
export const CONFIG = Object.freeze({
    APP_NAME: "Kapehan Tagum",
    HANDLE: "@kapehan.tagum",
    TAGUM_CENTER: [7.4478, 125.8078],
    // Swap to "api" when a real backend exists; db.js keeps the same interface.
    DATA_MODE: "local-mock",
    API_BASE_URL: "", // e.g. https://api.cafespot.ph — never put API keys here
    RATE_LIMIT: { maxAttempts: 5, windowMs: 60_000 },
    MIN_FORM_FILL_MS: 1500 // bots submit instantly; humans don't
});

// Salted SHA-256 of the admin password. The plaintext is NOT in this bundle.
// Regenerate with: printf '%s' 'cafespot.tagum::admin::<password>' | sha256sum
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD_HASH = "1eb708dd3e985adb337ab48eba413c8d19d252bf46a851976b5c8daf33b7bdf2";
const ADMIN_SALT = "cafespot.tagum";

/* ============================================================
 * 2. SEED DATA — 80 Tagum City cafes (researched October 2026)
 * ------------------------------------------------------------
 * Compiled from the Kapehanap Tagum coffee-shop directory
 * (kapehanap.com/directory), foodpanda listings, Wanderlog and Booky.
 * Each cafe's `sources` array links to where its details came from.
 *   hours: null           – hours not published
 *   hours.days            – per-day schedule, keys 0=Sun … 6=Sat, null = closed that day
 *   menu[].price: null    – item confirmed, price not published
 *   menu[].from: true     – starting price (smallest size)
 *   coordsApprox: true    – pin estimated from the street address
 * Facebook / Instagram links are the pages listed for each cafe.
 * Photos are Unsplash stock images, NOT photos of the actual cafes.
 * Admins can correct any field from the dashboard.
 * ============================================================ */
const UNSPLASH = (id) => `https://images.unsplash.com/${id}?auto=format&fm=webp&fit=crop&w=640&h=400&q=70`;
const FB_SEARCH = (q) => `https://www.facebook.com/search/top?q=${encodeURIComponent(q)}`;

const INITIAL_CAFES = [
    {
        "id": "cafe-koroa-coffee-tagum",
        "name": "KOROA Coffee Tagum",
        "address": "Mabini Street, Trebajo Village, Bayanihan, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447292,
        "lng": 125.80532,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/KOROA-Coffee-Tagum-61587387604683",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Recent neighborhood café on Mabini Street, known for its \"Brewed close to Home\" tagline.",
        "sources": [
            "https://kapehanap.com/shop/koroa-coffee-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-gourmet-frappe-coffee-tea",
        "name": "Gourmet Frappé Coffee & Tea",
        "address": "Lapu-Lapu Street, J Village, Bayanihan, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.446111,
        "lng": 125.805734,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Desserts & Pastries",
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/gourmetfrappe/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Known for blended frappé drinks, plus a simple dessert and pastry lineup.",
        "sources": [
            "https://kapehanap.com/shop/gourmet-frappe-coffee-tea/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-coffee-keeper",
        "name": "Coffee Keeper",
        "address": "Apokon Road, Purok 1-E, Barabad, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.441826,
        "lng": 125.817983,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/thecoffeekeeper/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Coffee shop in Assessors Village along Apokon Road.",
        "sources": [
            "https://kapehanap.com/shop/coffee-keeper/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-129-coffee-shoppe",
        "name": "129 Coffee Shoppe",
        "address": "Big 8 Corporate Hotel, National Highway corner Macario Bermudez Street, Visayan Village, Tagum City, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.441548,
        "lng": 125.80595,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Hotel Café",
            "Desserts & Pastries",
            "Indoor Seating",
            "Quiet / Low-Key Spot"
        ],
        "phone": null,
        "social": {
            "facebook": null,
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Calm hotel café inside Big 8 Corporate Hotel, known for cakes like blueberry cheesecake.",
        "sources": [
            "https://kapehanap.com/shop/129-coffee-shoppe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-daleachious-cafe-tagum-branch",
        "name": "Daleachious Cafe – Tagum Branch",
        "address": "Davao-Agusan National Highway, Cattleya, Pioneer, Visayan Village, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Visayan Village",
        "lat": 7.431124,
        "lng": 125.796536,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Air Conditioned",
            "Breakfast Available",
            "Desserts & Pastries",
            "Indoor Seating",
            "Matcha"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/daleachiouscafe/",
            "instagram": "daleachiouscafe"
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [
            {
                "name": "Americano",
                "price": 160,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Cappuccino",
                "price": 170,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Vanilla Latte",
                "price": 190,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Dark Mocha",
                "price": 200,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Matcha Latte",
                "price": 220,
                "category": "Matcha & Tea"
            },
            {
                "name": "Carbonara",
                "price": 195,
                "category": "Meals"
            }
        ],
        "note": "Tagum branch of the Davao-based Daleachious chain, pairing coffee with pastries, all-day breakfast and pasta.",
        "sources": [
            "https://kapehanap.com/shop/daleachious-cafe-tagum-branch/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-n30-cafe-tagum",
        "name": "N30 Café – Tagum",
        "address": "Neo Hotel, Purok Narra, Briz District, Barangay Magugpo East, Tagum City, Davao del Norte, Philippines",
        "neighborhood": "Magugpo East",
        "lat": 7.449164,
        "lng": 125.813008,
        "coordsApprox": false,
        "hours": {
            "open": "00:00",
            "close": "24:00"
        },
        "tags": [
            "24/7"
        ],
        "amenities": [
            "Hotel Café"
        ],
        "phone": "09810638100",
        "social": {
            "facebook": "https://www.facebook.com/N30CafeTagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1554118811-1e0d58224f24"),
        "imageAlt": "Stock photo of a warmly lit cafe interior (not taken at this cafe)",
        "menu": [],
        "note": "Known locally for fried chicken, plus coffee and casual bites, inside Neo Hotel.",
        "sources": [
            "https://kapehanap.com/shop/n30-cafe-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-mikos-brew",
        "name": "Miko's Brew",
        "address": "Apokon Road, Purok 1-E, Barabad, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.443382,
        "lng": 125.81422,
        "coordsApprox": false,
        "hours": {
            "open": "07:30",
            "close": "22:00"
        },
        "tags": [
            "FreeWiFi",
            "OutdoorSeating"
        ],
        "amenities": [
            "Air Conditioned",
            "Budget-Friendly",
            "Desserts & Pastries",
            "Family Friendly",
            "Free WiFi",
            "Good for Groups",
            "Indoor Seating",
            "Outdoor Seating",
            "Parking Available"
        ],
        "phone": "09328430506",
        "social": {
            "facebook": "https://www.facebook.com/mikosbrew/",
            "instagram": "mikosbrew"
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Air-conditioned Apokon Road spot that grew into a full restaurant with event rooms, offering budget Filipino meals, pizza and pasta.",
        "sources": [
            "https://kapehanap.com/shop/mikos-brew/",
            "https://wanderlog.com/place/details/2815534/mikos-brew-tagum"
        ],
        "reviews": []
    },
    {
        "id": "cafe-coffee-break-tagum",
        "name": "Coffee Break Tagum",
        "address": "Arellano Street, Trebajo Village, Bayanihan, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.446771,
        "lng": 125.803151,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Budget-Friendly"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/coffeebreaktgm/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Affordable, simple coffee spot on Arellano Street.",
        "sources": [
            "https://kapehanap.com/shop/coffee-break-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-food-momma-home-cafe",
        "name": "Food Momma Home Cafe",
        "address": "Gante 1 Street, Malinawon, Magugpo West, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo West",
        "lat": 7.453848,
        "lng": 125.801785,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Quiet / Low-Key Spot"
        ],
        "phone": "09913527746",
        "social": {
            "facebook": "https://www.facebook.com/foodmommaph/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Low-key Magugpo West spot pairing comfort food with coffee drinks.",
        "sources": [
            "https://kapehanap.com/shop/food-momma-home-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-royales-coffee-tagum",
        "name": "Royale's Coffee Tagum",
        "address": "Lapu-Lapu Street, J Village, Bayanihan, Magugpo Poblacion, Tagum, Davao del Norte, Davao Region, 8100, Philippines",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.4461,
        "lng": 125.804851,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "13:00",
                    "22:00"
                ],
                "1": [
                    "10:30",
                    "21:30"
                ],
                "2": [
                    "10:30",
                    "21:30"
                ],
                "3": [
                    "10:30",
                    "21:30"
                ],
                "4": [
                    "10:30",
                    "21:30"
                ],
                "5": [
                    "10:30",
                    "21:30"
                ],
                "6": [
                    "10:30",
                    "21:30"
                ]
            }
        },
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/people/Royales-Coffee-Tagum/61559727882755/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Coffee and comfort food cafe on Lapu-Lapu Street; dine-in, pick-up and delivery; cash only.",
        "sources": [
            "https://kapehanap.com/shop/royales-coffee-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-okey-beanery-cafe",
        "name": "OKEY Beanery-Cafe",
        "address": "Bonifacio Street, Everlasting, Bayanihan, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.442877,
        "lng": 125.803641,
        "coordsApprox": false,
        "hours": {
            "open": "00:00",
            "close": "24:00"
        },
        "tags": [
            "FreeWiFi",
            "24/7"
        ],
        "amenities": [
            "Free WiFi",
            "Open 24 Hours"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/people/OKEY-beanery-cafe/61558976665271/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Known for round-the-clock hours, a rare downtown option for early or late coffee.",
        "sources": [
            "https://kapehanap.com/shop/okey-beanery-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-palm-breeze-cafe",
        "name": "Palm Breeze Café",
        "address": "Grand Palm Villas & Hotel, Davao-Agusan National Highway, Pioneer, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.434015,
        "lng": 125.798872,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Hotel Café",
            "Air Conditioned",
            "Family Friendly",
            "Good for Groups",
            "Indoor Seating"
        ],
        "phone": "09674536898",
        "social": {
            "facebook": "https://www.facebook.com/grandpalmvillastagum",
            "instagram": "grandpalmvillastagum"
        },
        "image": UNSPLASH("photo-1554118811-1e0d58224f24"),
        "imageAlt": "Stock photo of a warmly lit cafe interior (not taken at this cafe)",
        "menu": [],
        "note": "All-day Asian-Western comfort food at Grand Palm Villas & Hotel, suited to family groups.",
        "sources": [
            "https://kapehanap.com/shop/palm-breeze-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-dulce-desserts-cafe",
        "name": "Dulce Desserts Cafe",
        "address": "Acacia Street, Rabe Subdivision, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.439111,
        "lng": 125.804103,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Aesthetic / Photogenic Interior",
            "Desserts & Pastries",
            "Indoor Seating"
        ],
        "phone": "09563658478",
        "social": {
            "facebook": "https://www.facebook.com/dulcedessertsph/",
            "instagram": "dulcedessertsph"
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Industrial-chic patisserie near Tagum Doctors Hospital, known for European-style pastries, macarons and cakes.",
        "sources": [
            "https://kapehanap.com/shop/dulce-desserts-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-mono-coffee",
        "name": "Mono Coffee",
        "address": "Apokon Road (fronting Tagum Medical City), Mangga, Apokon, Tagum, Davao del Norte, 8100",
        "neighborhood": "Apokon",
        "lat": 7.430549,
        "lng": 125.823503,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Indoor Seating"
        ],
        "phone": "09853290434",
        "social": {
            "facebook": "https://www.facebook.com/people/Mono-Coffee/61577461194970/",
            "instagram": "monocoffee.tgm"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [],
        "note": "Coffee spot beside Tagum Medical City, popular with students and hospital staff.",
        "sources": [
            "https://kapehanap.com/shop/mono-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-bean-oclock",
        "name": "Bean O'Clock",
        "address": "Sobrecarey Street, Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.449231,
        "lng": 125.802925,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": "09177087556",
        "social": {
            "facebook": "https://www.facebook.com/BeanOClockPH",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Known for coffee and savory and sweet waffles; reportedly moved to a larger space on Apokon Road near the new City Hall.",
        "sources": [
            "https://kapehanap.com/shop/bean-oclock/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-aurora-coffee",
        "name": "Aurora Coffee",
        "address": "6th Floor, CMS Building, National Highway, Briz District, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447443,
        "lng": 125.810293,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": "09458608783",
        "social": {
            "facebook": "https://www.facebook.com/p/Aurora-Coffee-61584521604136/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Newer rooftop-level coffee shop on the 6th floor of the CMS Building.",
        "sources": [
            "https://kapehanap.com/shop/aurora-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cafe-angelo",
        "name": "Cafe Angelo",
        "address": "Molave Hotel, Bonifacio Street, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.444755,
        "lng": 125.80344,
        "coordsApprox": false,
        "hours": {
            "open": "09:00",
            "close": "22:00"
        },
        "tags": [],
        "amenities": [
            "Hotel Café",
            "Indoor Seating",
            "Parking Available"
        ],
        "phone": "09171572943",
        "social": {
            "facebook": "https://www.facebook.com/cafeangelotagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1554118811-1e0d58224f24"),
        "imageAlt": "Stock photo of a warmly lit cafe interior (not taken at this cafe)",
        "menu": [
            {
                "name": "Pumpkin Salad",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Beef Stew",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Squash Soup",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Shrimp with Mixed Vegetables",
                "price": null,
                "category": "Meals"
            }
        ],
        "note": "Restaurant-café at Molave Hotel known for soups, stews, salads and coffee; accepts cards and GCash.",
        "sources": [
            "https://kapehanap.com/shop/cafe-angelo/",
            "https://booky.ph/biz/cafe-angelo-magugpo-south/about/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-22-27-korean-cafe",
        "name": "22.27 Korean Cafe",
        "address": "Mabini Street (behind Aqua Beauty Salon), Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447313,
        "lng": 125.803277,
        "coordsApprox": false,
        "hours": {
            "open": "09:30",
            "close": "21:20"
        },
        "tags": [],
        "amenities": [
            "Desserts & Pastries",
            "Family Friendly",
            "Good for Groups"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/2227KoreanCafe/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [
            {
                "name": "Classic Kimbap (solo)",
                "price": 230,
                "category": "Meals"
            },
            {
                "name": "Bibimbap (solo)",
                "price": 350,
                "category": "Meals"
            },
            {
                "name": "Samyang Buldak (overload)",
                "price": 305,
                "category": "Meals"
            },
            {
                "name": "Mandu Dumplings (7 pcs)",
                "price": 275,
                "category": "Meals"
            },
            {
                "name": "Shrimp Pesto Pasta",
                "price": 375,
                "category": "Meals"
            },
            {
                "name": "Chicken Tenders with Fries (5 pcs)",
                "price": 325,
                "category": "Meals"
            }
        ],
        "note": "Korean comfort-food café with a mini Korean mart, known for build-your-own ramen.",
        "sources": [
            "https://kapehanap.com/shop/22-27-korean-cafe/",
            "https://www.foodpanda.ph/restaurant/b8oy/2227-korean-cafe-mabini"
        ],
        "reviews": []
    },
    {
        "id": "cafe-lattetude-coffee-house",
        "name": "Lattétude Coffee House",
        "address": "Beside Caltex, Pioneer Avenue, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.450574,
        "lng": 125.80454,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Indoor Seating"
        ],
        "phone": "09764554161",
        "social": {
            "facebook": "https://www.facebook.com/lattetudecoffeehouse/",
            "instagram": "lattetudecoffeehouse"
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Casual coffee stop on Pioneer Avenue, popular for meet-ups and working.",
        "sources": [
            "https://kapehanap.com/shop/lattetude-coffee-house/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-dear-coffee-tagum",
        "name": "Dear Coffee – Tagum",
        "address": "Osmeña Street, Busilak, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447672,
        "lng": 125.804642,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "13:00",
                    "24:00"
                ],
                "1": [
                    "07:00",
                    "24:00"
                ],
                "2": [
                    "07:00",
                    "24:00"
                ],
                "3": [
                    "07:00",
                    "24:00"
                ],
                "4": [
                    "07:00",
                    "24:00"
                ],
                "5": [
                    "07:00",
                    "24:00"
                ],
                "6": [
                    "07:00",
                    "24:00"
                ]
            }
        },
        "tags": [],
        "amenities": [
            "Budget-Friendly"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Dear-Coffee-Tagum-61552014115986/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [
            {
                "name": "Cafe Americano",
                "price": 53,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Cafe Latte",
                "price": 53,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Dark Mocha",
                "price": 61,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Vanilla Latte",
                "price": 110,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Seasalt Latte",
                "price": 139,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Sakura Matcha",
                "price": 89,
                "category": "Matcha & Tea",
                "from": true
            }
        ],
        "note": "Budget-friendly coffee chain branch open until midnight.",
        "sources": [
            "https://kapehanap.com/shop/dear-coffee-tagum/",
            "https://www.foodpanda.ph/restaurant/kiu7/dear-coffee-tagum"
        ],
        "reviews": []
    },
    {
        "id": "cafe-pickup-coffee-robinsons-place-tagum",
        "name": "PICKUP COFFEE – Robinsons Place Tagum",
        "address": "Robinsons Place Tagum, National Highway, Magugpo, Tagum City, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.429569,
        "lng": 125.797528,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "21:00"
        },
        "tags": [],
        "amenities": [
            "Air Conditioned",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/pickupcoffeeph/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [
            {
                "name": "Americano",
                "price": 50,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Iced Kape Kastila",
                "price": 80,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Iced Caramel Macchiato",
                "price": 95,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Iced White Mocha",
                "price": 99,
                "category": "Coffee & Drinks"
            }
        ],
        "note": "Grab-and-go kiosk of the app-based national chain, focused on cashless ordering.",
        "sources": [
            "https://kapehanap.com/shop/pickup-coffee-robinsons-place-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-pickup-coffee-gaisano-mall-of-tagum",
        "name": "PICKUP COFFEE – Gaisano Mall of Tagum",
        "address": "Gaisano Mall of Tagum, Briz District, Magugpo East, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo East",
        "lat": 7.449475,
        "lng": 125.811868,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Air Conditioned",
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/pickupcoffeeph/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [
            {
                "name": "Americano",
                "price": 50,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Iced Kape Kastila",
                "price": 80,
                "category": "Coffee & Drinks"
            }
        ],
        "note": "Second Tagum branch of the app-based PICKUP COFFEE chain, inside Gaisano Mall of Tagum.",
        "sources": [
            "https://kapehanap.com/shop/pickup-coffee-gaisano-mall-of-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-drip-coffee",
        "name": "Drip Coffee",
        "address": "4th Floor, Rizal Street building, Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.448156,
        "lng": 125.805766,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Scenic Café",
            "Outdoor Seating"
        ],
        "phone": "09662585278",
        "social": {
            "facebook": "https://www.facebook.com/drip.tgm",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [
            {
                "name": "Espresso Black",
                "price": 65,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Latte",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Spanish Latte",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Sweet Latte",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Mocha",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Dirty Matcha",
                "price": 85,
                "category": "Matcha & Tea",
                "from": true
            }
        ],
        "note": "Rooftop specialty coffee on a 4th floor downtown, known for panoramic views over Tagum.",
        "sources": [
            "https://kapehanap.com/shop/drip-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-port-cafe",
        "name": "Port Cafe",
        "address": "2nd Floor, Gaisano Mall of Tagum, Briz District, Magugpo East, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo East",
        "lat": 7.448911,
        "lng": 125.811728,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Air Conditioned",
            "Budget-Friendly",
            "Desserts & Pastries",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/pages/Port%20Cafe,%20Gaisano%20Mall%20Tagum/490171014368069/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Budget-friendly mall spot known for quick pasta and dessert breaks.",
        "sources": [
            "https://kapehanap.com/shop/port-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-fabularized-cafe",
        "name": "Fabularized Café",
        "address": "Robinsons Place Tagum alfresco strip, Davao-Agusan National Highway, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.429986,
        "lng": 125.79689,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Air Conditioned",
            "Indoor Seating",
            "Outdoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/fabularizedcafe/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Mall café on Robinsons Place Tagum's alfresco strip with a 'we brew you a smile' theme.",
        "sources": [
            "https://kapehanap.com/shop/fabularized-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-tea-barrel-osmena",
        "name": "Tea Barrel – Osmeña",
        "address": "Osmeña Street, Busilak, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447856,
        "lng": 125.804685,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Air Conditioned",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/TeaBarrelph/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Milk tea-focused chain branch that also serves coffee and light food.",
        "sources": [
            "https://kapehanap.com/shop/tea-barrel-osmena/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-bean-barrel-coffee-bar-tagum",
        "name": "Bean & Barrel Coffee Bar Tagum",
        "address": "PSYDO Building, Provincial Sports Complex, V. C. Boiser Avenue, Mankilam, Tagum, Davao del Norte, 8100",
        "neighborhood": "Mankilam",
        "lat": 7.455364,
        "lng": 125.782978,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "FreeWiFi",
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Budget-Friendly",
            "Free WiFi",
            "Good for Groups"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Bean-Barrel-Coffee-Bar-Tagum-61586845791470/",
            "instagram": "beanandbarrel.tgm"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [],
        "note": "Budget-friendly café suited to meet-ups, with free WiFi and low-priced solo meals.",
        "sources": [
            "https://kapehanap.com/shop/bean-barrel-coffee-bar-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-hola-coffee-tagum",
        "name": "Hola Coffee – Tagum",
        "address": "Fronting Apokon Elementary School, Mangga, Apokon, Tagum, Davao del Norte, 8100",
        "neighborhood": "Apokon",
        "lat": 7.433496,
        "lng": 125.82342,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Outdoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/HolaCoffeeTagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Newer outdoor-seating coffee shop across from Apokon Elementary School.",
        "sources": [
            "https://kapehanap.com/shop/hola-coffee-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-dens-cafe-tagum",
        "name": "Den's Cafe – Tagum",
        "address": "Mabini Street, Magugpo South, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo South",
        "lat": 7.447247,
        "lng": 125.795485,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "20:30"
        },
        "tags": [],
        "amenities": [
            "Desserts & Pastries",
            "Family Friendly",
            "Good for Groups",
            "Indoor Seating"
        ],
        "phone": "09207522150",
        "social": {
            "facebook": "https://www.facebook.com/denscafetagum/",
            "instagram": "dens.cafe"
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Spacious restaurant-café serving Filipino and international dishes, pizza, seafood, pasta and coffee.",
        "sources": [
            "https://kapehanap.com/shop/dens-cafe-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cafe-palace",
        "name": "Cafe Palace",
        "address": "Golden Palace Hotel, Capitol Circumferential Road, Suaybaguio, Magugpo West, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo West",
        "lat": 7.463733,
        "lng": 125.811299,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "FreeWiFi"
        ],
        "amenities": [
            "Hotel Café",
            "Breakfast Available",
            "Free WiFi",
            "Indoor Seating"
        ],
        "phone": "0846559167",
        "social": {
            "facebook": "https://www.facebook.com/CafePalace.ph/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1554118811-1e0d58224f24"),
        "imageAlt": "Stock photo of a warmly lit cafe interior (not taken at this cafe)",
        "menu": [],
        "note": "Hotel café inside Golden Palace Hotel known for coffee and a breakfast buffet.",
        "sources": [
            "https://kapehanap.com/shop/cafe-palace/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kurahi-coffee",
        "name": "Kurahi Coffee",
        "address": "Behind Angel's Pizza, Davao-Agusan National Highway, J Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.446435,
        "lng": 125.808161,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": "09166278528",
        "social": {
            "facebook": "https://www.facebook.com/kurahicoffee/",
            "instagram": "kurahicoffee"
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Straightforward coffee and a convenient stop behind Angel's Pizza on the National Highway.",
        "sources": [
            "https://kapehanap.com/shop/kurahi-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-dkai-cafe",
        "name": "D'kai Cafe",
        "address": "Kojō Hotels Tagum, Garcia Street, Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445252,
        "lng": 125.803156,
        "coordsApprox": false,
        "hours": {
            "open": "07:00",
            "close": "24:00"
        },
        "tags": [
            "FreeWiFi",
            "StudySpot"
        ],
        "amenities": [
            "Hotel Café",
            "Study & Work Café",
            "Aesthetic / Photogenic Interior",
            "Breakfast Available",
            "Desserts & Pastries",
            "Free WiFi",
            "Laptop Friendly",
            "Power Outlets"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/dkaicafe/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Chocomoist Cake (round)",
                "price": 162,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Creamy Carbonara",
                "price": 294,
                "category": "Meals"
            },
            {
                "name": "Chicken Steak",
                "price": 342,
                "category": "Matcha & Tea"
            },
            {
                "name": "Crispy Pork Kare-Kare",
                "price": 342,
                "category": "Meals"
            },
            {
                "name": "Beef Bulgogi",
                "price": 378,
                "category": "Meals"
            },
            {
                "name": "All Cheese Pizza (12\")",
                "price": 462,
                "category": "Meals"
            }
        ],
        "note": "In-house café of Kojō Hotels with power outlets at nearly every table; coffee, tea, pizza and pasta.",
        "sources": [
            "https://kapehanap.com/shop/dkai-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-the-breakfast-club-tagum-24-7",
        "name": "The Breakfast Club Tagum 24/7",
        "address": "279 Piatos Avenue, Delfina Subdivision, Tagum City, Davao del Norte",
        "neighborhood": "Magugpo North",
        "lat": 7.454006,
        "lng": 125.811952,
        "coordsApprox": false,
        "hours": {
            "open": "00:00",
            "close": "24:00"
        },
        "tags": [
            "24/7"
        ],
        "amenities": [
            "Breakfast Available",
            "Family Friendly",
            "Open 24 Hours"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/thebreakfastclubtgm/",
            "instagram": "thebreakfastclubtagum"
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [
            {
                "name": "Full Filipino Breakfast",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Full American Breakfast",
                "price": null,
                "category": "Meals"
            }
        ],
        "note": "Open around the clock, serving full Filipino and American breakfast platters with coffee.",
        "sources": [
            "https://kapehanap.com/shop/the-breakfast-club-tagum-24-7/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kofe-badi",
        "name": "Kôfe Badi",
        "address": "Opal Street, Trebajo Village, Magugpo South, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo South",
        "lat": 7.446215,
        "lng": 125.795994,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Aesthetic / Photogenic Interior",
            "Air Conditioned",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/kofebadi.tgm/",
            "instagram": "kofebadi.tgm"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [],
        "note": "Minimalist industrial-style café with several branches in the city and long opening hours.",
        "sources": [
            "https://kapehanap.com/shop/kofe-badi/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-the-turq-cafe",
        "name": "The TurQ Cafe",
        "address": "City Arcade, Apokon Road, Tagum, Davao del Norte, 8100",
        "neighborhood": "Apokon",
        "lat": 7.441938,
        "lng": 125.82596,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "10:00",
                    "22:00"
                ],
                "1": null,
                "2": [
                    "10:00",
                    "22:00"
                ],
                "3": [
                    "10:00",
                    "22:00"
                ],
                "4": [
                    "10:00",
                    "22:00"
                ],
                "5": [
                    "10:00",
                    "22:00"
                ],
                "6": [
                    "10:00",
                    "22:00"
                ]
            }
        },
        "tags": [
            "PetFriendly"
        ],
        "amenities": [
            "Indoor Seating",
            "Pet Friendly",
            "Quiet / Low-Key Spot"
        ],
        "phone": "+639367409938",
        "social": {
            "facebook": "https://www.facebook.com/p/THE-TURQ-CAFE-100095320323883/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Cozy, laid-back coffee spot known for its resident cats.",
        "sources": [
            "https://kapehanap.com/shop/the-turq-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-coffee-spot-tagum",
        "name": "Coffee Spot Tagum",
        "address": "Near Robinsons Place Tagum entrance, Pioneer, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.430661,
        "lng": 125.796971,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": "09463346744",
        "social": {
            "facebook": "https://www.facebook.com/Coffeespottagum/",
            "instagram": "coffeespottagum"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Neighborhood coffee stop near Robinsons Place offering dine-in, takeout and delivery.",
        "sources": [
            "https://kapehanap.com/shop/coffee-spot-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-caffe-ricardo",
        "name": "Caffé Ricardo",
        "address": "Inside Johnwick Carwash & Services, Crossing Timog, Capitol Road, Tagum City, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.423163,
        "lng": 125.789725,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Desserts & Pastries"
        ],
        "phone": "09455202091",
        "social": {
            "facebook": "https://www.facebook.com/caffericardo/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Small casual stop inside a carwash, known for brewed coffee and house-made cakes.",
        "sources": [
            "https://kapehanap.com/shop/caffe-ricardo/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-calia-coffee-and-desserts",
        "name": "Calia Coffee and Desserts",
        "address": "Villa Paraiso Subdivision, Pioneer, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.435055,
        "lng": 125.803365,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/Caliatagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Tiny dessert café known for Japanese-style soufflé pancakes.",
        "sources": [
            "https://kapehanap.com/shop/calia-coffee-and-desserts/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kuan-coffee",
        "name": "Kuan Coffee",
        "address": "Apokon Road (Villa Verde Subdivision area), Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.441092,
        "lng": 125.817712,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": "09672270192",
        "social": {
            "facebook": "https://www.facebook.com/kuancoffeeph/",
            "instagram": "kuancoffeeph"
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Neighborhood coffee shop with a second branch serving Assessors Village.",
        "sources": [
            "https://kapehanap.com/shop/kuan-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-blugre-coffee-tagum",
        "name": "Blugré Coffee – Tagum",
        "address": "Food Park, Davao-Agusan National Highway, J Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445146,
        "lng": 125.807544,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Desserts & Pastries",
            "Indoor Seating",
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Blugr%C3%A9-Coffee-Weekly-MarketNational-HighwayTagum-61553329827098/",
            "instagram": "blugrecoffee_official"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Known for durian-infused coffee and desserts. Another listing places a branch at Nicole's 22nd Strip, Apokon Road.",
        "sources": [
            "https://kapehanap.com/shop/blugre-coffee-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-grind-and-brew-cafe-bistro",
        "name": "Grind and Brew Café Bistro",
        "address": "Tagum-Santo Tomas Road, San Miguel, Tagum, Davao del Norte, 8100",
        "neighborhood": "San Miguel",
        "lat": 7.44331,
        "lng": 125.773437,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Indoor Seating",
            "Outdoor Seating"
        ],
        "phone": "09496438447",
        "social": {
            "facebook": "https://www.facebook.com/p/Grind-and-Brew-Caf%C3%A9-Bistro-100086204254120/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Neighborhood coffee bistro with a Western-leaning food menu and indoor and outdoor seating.",
        "sources": [
            "https://kapehanap.com/shop/grind-and-brew-cafe-bistro/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-caffeine-jitters-co",
        "name": "Caffeine Jitters & Co.",
        "address": "Bacaltos Complex, Roxas Extension, Malinawon, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.44981,
        "lng": 125.80204,
        "coordsApprox": false,
        "hours": {
            "open": "11:00",
            "close": "03:00"
        },
        "tags": [
            "FreeWiFi",
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Air Conditioned",
            "Desserts & Pastries",
            "Free WiFi",
            "Indoor Seating",
            "Laptop Friendly",
            "Matcha",
            "Quiet / Low-Key Spot"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/caffeinejittersco/",
            "instagram": "caffeinejittersco"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Matcha",
                "price": null,
                "category": "Matcha & Tea"
            },
            {
                "name": "Spanish Latte (iced)",
                "price": null,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Chocolate Frappe",
                "price": null,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Strawberry Frappe",
                "price": null,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Carrot Cake",
                "price": null,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Creamy Chicken Pasta",
                "price": null,
                "category": "Meals"
            }
        ],
        "note": "Cozy air-conditioned late-night spot with pasta, cakes and frappes, popular with students and remote workers.",
        "sources": [
            "https://kapehanap.com/shop/caffeine-jitters-co/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cove-cafe",
        "name": "Cove Café",
        "address": "Sobrecarey Street (near the New Cathedral), Everlasting, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.440848,
        "lng": 125.802577,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "22:00"
        },
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Scenic Café",
            "Aesthetic / Photogenic Interior",
            "Good for Groups",
            "Indoor Seating",
            "Laptop Friendly",
            "Quiet / Low-Key Spot"
        ],
        "phone": "09621379588",
        "social": {
            "facebook": "https://www.facebook.com/covecafe.tgm/",
            "instagram": "covecafe.tgm"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [],
        "note": "Plant-filled modern café known for hearty mains and pasta and a semi-private upper level.",
        "sources": [
            "https://kapehanap.com/shop/cove-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kafe-snowbell",
        "name": "Kafé Snowbell",
        "address": "Capitol Circumferential Road, Bulak 1, Curvada, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.444023,
        "lng": 125.824844,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "PetFriendly"
        ],
        "amenities": [
            "Indoor Seating",
            "Pet Friendly"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Kafe-Snowbell-61570715541356/",
            "instagram": "kafe.snowbell"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Cat café with about 20 resident cats; there is a minimum food-and-drink order per guest.",
        "sources": [
            "https://kapehanap.com/shop/kafe-snowbell/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-annipie-shell-tagum-northbound",
        "name": "Annipie – Shell Tagum Northbound",
        "address": "Shell station, Davao-Agusan National Highway (northbound), Magdum, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magdum",
        "lat": 7.465135,
        "lng": 125.828283,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries",
            "Outdoor Seating"
        ],
        "phone": "09451223252",
        "social": {
            "facebook": "https://www.facebook.com/annipietagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Bakery-café chain branch known for cinnamon rolls, coffee and cakes.",
        "sources": [
            "https://kapehanap.com/shop/annipie-shell-tagum-northbound/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-heisei-coffee",
        "name": "Heisei Coffee",
        "address": "Rabe Subdivision, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.43955,
        "lng": 125.80469,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Matcha"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/heiseicoffee",
            "instagram": "heiseicoffeeph"
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Newly opened coffee-and-matcha spot in a Visayan Village residential compound.",
        "sources": [
            "https://kapehanap.com/shop/heisei-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-yuyu-cafe-and-dessert-shop",
        "name": "Yuyu Cafe and Dessert Shop",
        "address": "Quirante 2 Street (Highway, across from Gaisano Mall of Tagum), Briz District, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.449013,
        "lng": 125.810435,
        "coordsApprox": false,
        "hours": {
            "open": "08:00",
            "close": "21:00"
        },
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries",
            "Family Friendly",
            "Good for Groups",
            "Indoor Seating"
        ],
        "phone": "09359011815",
        "social": {
            "facebook": "https://www.facebook.com/yuyucafe/",
            "instagram": "yuyutagum"
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [
            {
                "name": "Fresh Fruit Tart",
                "price": 85,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Purple Yam Cake",
                "price": 90,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Praline Cake",
                "price": 105,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Sweet and Salty Cake",
                "price": 125,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Three Cheese Quesadilla",
                "price": 140,
                "category": "Meals"
            },
            {
                "name": "Baby Back Ribs",
                "price": 235,
                "category": "Meals"
            }
        ],
        "note": "Family-friendly all-day spot known for chef-made cakes and desserts, plus pasta, ribs and salads.",
        "sources": [
            "https://kapehanap.com/shop/yuyu-cafe-and-dessert-shop/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-panchika",
        "name": "PanChika",
        "address": "Osmeña Street / National Highway corner, Busilak, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.441449,
        "lng": 125.804752,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries",
            "Outdoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/CynthiasCateringServices/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [
            {
                "name": "Spanish Latte",
                "price": null,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Matcha Latte",
                "price": null,
                "category": "Matcha & Tea"
            },
            {
                "name": "Cinnamon Roll",
                "price": null,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Ensaymada",
                "price": null,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Coffee Bun",
                "price": null,
                "category": "Desserts & Pastries"
            }
        ],
        "note": "Compact bakery-café known for fresh-baked cinnamon rolls, ensaymada and coffee buns.",
        "sources": [
            "https://kapehanap.com/shop/panchika/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-sip-cafe",
        "name": "SIP Cafe",
        "address": "Acacia Street, Rabe Subdivision, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.439087,
        "lng": 125.804103,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Breakfast Available"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/SIP-Cafe-61578085956971/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Breakfast-and-coffee spot in Rabe that opened in 2025 and is popular on social media.",
        "sources": [
            "https://kapehanap.com/shop/sip-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-alima-home-cafe",
        "name": "Alima Home.Cafe",
        "address": "Pamulinawin, Briz District, Magugpo West, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo West",
        "lat": 7.454813,
        "lng": 125.804789,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Breakfast Available",
            "Vegan Options"
        ],
        "phone": "09955108467",
        "social": {
            "facebook": "https://www.facebook.com/alimahomecafe/",
            "instagram": "alima.homecafe"
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Homey café serving Filipino snacks alongside vegan burgers and smoothie bowls.",
        "sources": [
            "https://kapehanap.com/shop/alima-home-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-wallside",
        "name": "Wallside",
        "address": "Garcia Street, Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445462,
        "lng": 125.803183,
        "coordsApprox": false,
        "hours": {
            "open": "11:30",
            "close": "23:00"
        },
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Aesthetic / Photogenic Interior",
            "Outdoor Seating",
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Wallside-61566317439504/",
            "instagram": "wallside.ph"
        },
        "image": UNSPLASH("photo-1445116572660-236099ec97a0"),
        "imageAlt": "Stock photo of cozy cafe seating with plants (not taken at this cafe)",
        "menu": [],
        "note": "Tiny grab-and-go specialty coffee bar, billed locally as Tagum City's first.",
        "sources": [
            "https://kapehanap.com/shop/wallside/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-rc-drip-cafe",
        "name": "RC Drip Cafè",
        "address": "Pioneer, Visayan Village, Tagum, Davao del Norte, 8100",
        "neighborhood": "Visayan Village",
        "lat": 7.425531,
        "lng": 125.80071,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/rcdripcafetagumcity/",
            "instagram": "rcdripcafe.tagumcity"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Small drip-coffee spot with a low-key neighborhood feel; promoted mostly through delivery apps.",
        "sources": [
            "https://kapehanap.com/shop/rc-drip-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-green-coffee-apokon-road-branch",
        "name": "Green Coffee – Apokon Road",
        "address": "Central Warehouse Club, Apokon Road, Barabad, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.444784,
        "lng": 125.813472,
        "coordsApprox": false,
        "hours": {
            "open": "07:00",
            "close": "02:00"
        },
        "tags": [
            "FreeWiFi",
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Desserts & Pastries",
            "Free WiFi",
            "Good for Groups",
            "Laptop Friendly",
            "Parking Available"
        ],
        "phone": "09255247336",
        "social": {
            "facebook": "https://www.facebook.com/thegreencoffee",
            "instagram": null
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Caffè Latte",
                "price": 180,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Caffè Mocha",
                "price": 195,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Caramel Macchiato",
                "price": 200,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Flat White (6 oz)",
                "price": 175,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Blueberry Cheesecake Slice",
                "price": 170,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Oatmeal Cookies",
                "price": 140,
                "category": "Desserts & Pastries"
            }
        ],
        "note": "Known for fast WiFi, free parking, and coffee, tea and pastries; popular with students and remote workers.",
        "sources": [
            "https://kapehanap.com/shop/green-coffee-apokon-road-branch/",
            "https://www.foodpanda.ph/restaurant/a9es/green-coffee-apokon"
        ],
        "reviews": []
    },
    {
        "id": "cafe-tea-barrel-abad-santos",
        "name": "Tea Barrel – Abad Santos",
        "address": "Jose Abad Santos Street, Busilak, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445491,
        "lng": 125.805425,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Tea-Barrel-Abad-Santos-100078977013004/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Downtown branch of the Tea Barrel chain, serving milk tea and coffee.",
        "sources": [
            "https://kapehanap.com/shop/tea-barrel-abad-santos/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-hoon-bakery-cafe",
        "name": "Hoon Bakery & Café",
        "address": "Arellano Street (Palm City's Food Park), Trebajo Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.446808,
        "lng": 125.80554,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "10:00",
                    "22:00"
                ],
                "1": [
                    "06:00",
                    "22:00"
                ],
                "2": [
                    "06:00",
                    "22:00"
                ],
                "3": [
                    "06:00",
                    "22:00"
                ],
                "4": [
                    "06:00",
                    "22:00"
                ],
                "5": [
                    "06:00",
                    "22:00"
                ],
                "6": [
                    "06:00",
                    "22:00"
                ]
            }
        },
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries",
            "Outdoor Seating"
        ],
        "phone": "09995250000",
        "social": {
            "facebook": "https://www.facebook.com/p/Hoon-bakery-cafe-100063569816639/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Korean-run pastry shop known for hand-baked Korean breads and pastries, plus coffee.",
        "sources": [
            "https://kapehanap.com/shop/hoon-bakery-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-rookie-cafe",
        "name": "Rookie Cafe",
        "address": "East Paramio Road (Mabini Street, beside Bridges Academy), Magugpo South, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo South",
        "lat": 7.446385,
        "lng": 125.793969,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "21:00"
        },
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Desserts & Pastries",
            "Indoor Seating",
            "Matcha",
            "Outdoor Seating",
            "Parking Available"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/rookiecafe28/",
            "instagram": "rookiecafeph"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Cafe with indoor and outdoor seating, known for frappes, waffles and pasta.",
        "sources": [
            "https://kapehanap.com/shop/rookie-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cafe-mellow",
        "name": "Café Mellow",
        "address": "Davao-Agusan National Highway, Canocotan, Tagum, Davao del Norte, 8100",
        "neighborhood": "Canocotan",
        "lat": 7.40733,
        "lng": 125.777278,
        "coordsApprox": false,
        "hours": {
            "open": "09:00",
            "close": "24:00"
        },
        "tags": [],
        "amenities": [
            "Aesthetic / Photogenic Interior",
            "Specialty Coffee"
        ],
        "phone": "09321612101",
        "social": {
            "facebook": "https://www.facebook.com/p/Caf%C3%A9-Mellow-61584672458227/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1445116572660-236099ec97a0"),
        "imageAlt": "Stock photo of cozy cafe seating with plants (not taken at this cafe)",
        "menu": [],
        "note": "Newly opened roadside café with a Thai-inspired look; offers milk substitutes for lactose-intolerant guests.",
        "sources": [
            "https://kapehanap.com/shop/cafe-mellow/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-1111-cafe",
        "name": "11:11 Café",
        "address": "Gemini Village, Apokon, Tagum, Davao del Norte",
        "neighborhood": "Apokon",
        "lat": 7.422592,
        "lng": 125.824474,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Budget-Friendly",
            "Desserts & Pastries",
            "Outdoor Seating"
        ],
        "phone": "09051815343",
        "social": {
            "facebook": "https://www.facebook.com/1111CafeTagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Small Apokon neighborhood café pairing coffee with Italian-leaning bites and cake.",
        "sources": [
            "https://kapehanap.com/shop/1111-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-high-ground",
        "name": "High Ground",
        "address": "The Wave Business Park, Pioneer Avenue (near Rotary Park), Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.450704,
        "lng": 125.806648,
        "coordsApprox": false,
        "hours": {
            "open": "07:00",
            "close": "23:00"
        },
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Air Conditioned",
            "Indoor Seating",
            "Laptop Friendly",
            "Matcha",
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": null,
            "instagram": "highground.tgm"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [],
        "note": "Minimalist café known for its stairstep seating and matcha lineup, popular with laptop workers.",
        "sources": [
            "https://kapehanap.com/shop/high-ground/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-re-start-coffee",
        "name": "Re-start Coffee",
        "address": "TODAH Building, J Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.442358,
        "lng": 125.80609,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Aesthetic / Photogenic Interior",
            "Indoor Seating",
            "Quiet / Low-Key Spot"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/re-start-coffee-61579288084954/",
            "instagram": "restartcoffee.tgm"
        },
        "image": UNSPLASH("photo-1445116572660-236099ec97a0"),
        "imageAlt": "Stock photo of cozy cafe seating with plants (not taken at this cafe)",
        "menu": [],
        "note": "Newly opened, quiet, cozy coffee spot with a laid-back vibe.",
        "sources": [
            "https://kapehanap.com/shop/re-start-coffee/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-dusk-coffee",
        "name": "DUSK Coffee",
        "address": "GSM Building, Maharlika Highway, Everlasting, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.4396,
        "lng": 125.803971,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Aesthetic / Photogenic Interior",
            "Laptop Friendly",
            "Matcha",
            "Quiet / Low-Key Spot"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/duskcoffee.co/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Matcha Latte",
                "price": null,
                "category": "Matcha & Tea"
            },
            {
                "name": "Refreshers (iced tea)",
                "price": null,
                "category": "Matcha & Tea"
            },
            {
                "name": "Cinnamon Roll",
                "price": null,
                "category": "Desserts & Pastries"
            },
            {
                "name": "Cookies",
                "price": null,
                "category": "Desserts & Pastries"
            }
        ],
        "note": "Aesthetic, work-friendly café opened in 2026; the matcha latte is the highlight.",
        "sources": [
            "https://kapehanap.com/shop/dusk-coffee/",
            "https://homes.ph/davao/news/dusk-coffee-just-opened-in-tagum-whats-your-favoritematcha-coffee-or-their-baked-snacks"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cafe-velma",
        "name": "Cafe Velma",
        "address": "Big 8 Corporate Hotel, National Highway corner Macario P. Bermudez Street, Visayan Village, Tagum City, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.4417,
        "lng": 125.8061,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Hotel Café",
            "Air Conditioned",
            "Breakfast Available",
            "Family Friendly",
            "Indoor Seating",
            "Parking Available"
        ],
        "phone": null,
        "social": {
            "facebook": null,
            "instagram": null
        },
        "image": UNSPLASH("photo-1554118811-1e0d58224f24"),
        "imageAlt": "Stock photo of a warmly lit cafe interior (not taken at this cafe)",
        "menu": [
            {
                "name": "Breakfast Buffet (walk-in)",
                "price": 350,
                "category": "Meals"
            }
        ],
        "note": "Hotel eatery known for its breakfast buffet, open to walk-in diners.",
        "sources": [
            "https://kapehanap.com/shop/cafe-velma/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-royal-low-carb-sugar-free-bakery-cafe",
        "name": "Royal Low Carb Sugar Free Bakery Cafe",
        "address": "Adela Bermudez Village, Apokon, Tagum, Davao del Norte, 8100",
        "neighborhood": "Apokon",
        "lat": 7.425943,
        "lng": 125.82449,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/royallocarb/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Sugar-free, keto and low-carb bakery café with gluten-free breads, cakes, pasta and pizza.",
        "sources": [
            "https://kapehanap.com/shop/royal-low-carb-sugar-free-bakery-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-little-baker-tagum",
        "name": "Little Baker – Tagum",
        "address": "Osmeña Street, Busilak, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445741,
        "lng": 125.804674,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Aesthetic / Photogenic Interior",
            "Desserts & Pastries"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Little-Baker-Tagum-100064191093705/",
            "instagram": "littlebakerph"
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Bakery café known for handmade brownies and cream puffs.",
        "sources": [
            "https://kapehanap.com/shop/little-baker-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-mabeani-cafe-and-restaurant",
        "name": "Mabeani Cafe and Restaurant",
        "address": "Jose Abad Santos Street, Busilak, Magugpo Poblacion, Tagum, Davao del Norte",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447518,
        "lng": 125.805932,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "21:00"
        },
        "tags": [],
        "amenities": [
            "Specialty Coffee"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/mabeani/",
            "instagram": "mabeanicafeandrestaurant"
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [],
        "note": "Comfort-food café and restaurant with a coffee-and-conversation vibe.",
        "sources": [
            "https://kapehanap.com/shop/mabeani-cafe-and-restaurant/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kanoffee-tagum-drive-thru",
        "name": "Kanoffee Tagum – Drive Thru",
        "address": "Santa Cruz Avenue (beside Petron), Ilocandia, Magugpo West, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo West",
        "lat": 7.460419,
        "lng": 125.797942,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "OutdoorSeating"
        ],
        "amenities": [
            "Outdoor Seating",
            "Parking Available"
        ],
        "phone": "09102609331",
        "social": {
            "facebook": "https://www.facebook.com/KanoffeeDriveThru/",
            "instagram": "_kanoffee"
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Specialty coffee drive-thru beside a Petron station, with a small outdoor seating area.",
        "sources": [
            "https://kapehanap.com/shop/kanoffee-tagum-drive-thru/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-suyop-kofi",
        "name": "Suyop Kofi",
        "address": "Capitol Circumferential Road, Bautista, Mankilam, Tagum, Davao del Norte, 8100",
        "neighborhood": "Mankilam",
        "lat": 7.44763,
        "lng": 125.779268,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/Suyopkofi/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Well-liked local coffee shop that has run a booth at the Tagum Coffee Festival.",
        "sources": [
            "https://kapehanap.com/shop/suyop-kofi/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-clubhaus-cafe",
        "name": "Clubhaus Cafe",
        "address": "Lapu-Lapu Street, J Village, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.445901,
        "lng": 125.806938,
        "coordsApprox": false,
        "hours": {
            "open": "09:00",
            "close": "22:00"
        },
        "tags": [],
        "amenities": [
            "Parking Available",
            "Matcha"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/people/Clubhaus-Cafe/61571599958114/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Newly opened coffee bar sharing a lot with a carwash, known for matcha and its signature latte.",
        "sources": [
            "https://kapehanap.com/shop/clubhaus-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-doze-coffee-club",
        "name": "Doze Coffee Club",
        "address": "Suaybaguio Sr. Street, Briz District, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.456092,
        "lng": 125.81315,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Aesthetic / Photogenic Interior",
            "Indoor Seating"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Doze-Coffee-Club-61576098525302/",
            "instagram": "doze.tgm"
        },
        "image": UNSPLASH("photo-1445116572660-236099ec97a0"),
        "imageAlt": "Stock photo of cozy cafe seating with plants (not taken at this cafe)",
        "menu": [],
        "note": "Design-forward coffee shop with a polished interior that draws attention on social media.",
        "sources": [
            "https://kapehanap.com/shop/doze-coffee-club/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-xie-xie-home-cafe",
        "name": "Xie Xie Home Cafe",
        "address": "Macario P. Bermudez Street, Sampaguita 1, Magugpo Poblacion, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.438999,
        "lng": 125.807514,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Breakfast Available",
            "Desserts & Pastries",
            "Specialty Coffee"
        ],
        "phone": "09678557255",
        "social": {
            "facebook": "https://www.facebook.com/xiexietagum/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Known for Vietnamese egg coffee, all-day breakfasts, comfort mains and desserts.",
        "sources": [
            "https://kapehanap.com/shop/xie-xie-home-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-sweetdreams-cafe",
        "name": "SweetDreams Café",
        "address": "Purok 23, Madaum, Tagum, Davao del Norte, 8100",
        "neighborhood": "Madaum",
        "lat": 7.385529,
        "lng": 125.807426,
        "coordsApprox": false,
        "hours": {
            "open": "09:00",
            "close": "21:00"
        },
        "tags": [],
        "amenities": [
            "Aesthetic / Photogenic Interior",
            "Indoor Seating"
        ],
        "phone": "09267261640",
        "social": {
            "facebook": "https://www.facebook.com/Sweetdreamers08/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1445116572660-236099ec97a0"),
        "imageAlt": "Stock photo of cozy cafe seating with plants (not taken at this cafe)",
        "menu": [],
        "note": "Art-decorated Filipino café known for rice meals like pinakbet, plus coffee and salads.",
        "sources": [
            "https://kapehanap.com/shop/sweetdreams-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-coffee-maybe-tagum",
        "name": "Coffee Maybe – Tagum",
        "address": "Saint Mark Street, Suaybaguio, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.459427,
        "lng": 125.815821,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "10:00",
                    "21:00"
                ],
                "1": null,
                "2": [
                    "10:00",
                    "20:00"
                ],
                "3": [
                    "10:00",
                    "20:00"
                ],
                "4": [
                    "10:00",
                    "20:00"
                ],
                "5": [
                    "10:00",
                    "20:00"
                ],
                "6": [
                    "10:00",
                    "21:00"
                ]
            }
        },
        "tags": [
            "StudySpot"
        ],
        "amenities": [
            "Study & Work Café",
            "Desserts & Pastries",
            "Laptop Friendly",
            "Quiet / Low-Key Spot",
            "Specialty Coffee"
        ],
        "phone": "09073702240",
        "social": {
            "facebook": "https://www.facebook.com/coffeemaybeph/",
            "instagram": "coffeemaybeph"
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Americano",
                "price": 130,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Cafe Latte",
                "price": 140,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Hazelnut Latte",
                "price": 160,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Vanilla Latte",
                "price": 160,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Caramel Macchiato",
                "price": 170,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Spanish Latte",
                "price": 175,
                "category": "Coffee & Drinks"
            }
        ],
        "note": "Small, homey nook in a Magugpo North subdivision known for specialty lattes, einspänners and baked treats.",
        "sources": [
            "https://kapehanap.com/shop/coffee-maybe-tagum/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-cafe-patricia",
        "name": "Cafe Patricia",
        "address": "Tagum-Panabo Circumferential Road, Pagkakaisa, Mankilam, Tagum, Davao del Norte, 8100",
        "neighborhood": "Mankilam",
        "lat": 7.468283,
        "lng": 125.76744,
        "coordsApprox": false,
        "hours": null,
        "tags": [],
        "amenities": [
            "Bakery Café",
            "Desserts & Pastries"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Cafe-Patricia-100090066649081/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1488477181946-6428a0291777"),
        "imageAlt": "Stock photo of a slice of layered cake (not taken at this cafe)",
        "menu": [],
        "note": "Home-based bake shop known for pre-order baked goods rather than sit-down coffee.",
        "sources": [
            "https://kapehanap.com/shop/cafe-patricia/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-ryokou-8100",
        "name": "Ryokou 8100",
        "address": "Suaybaguio, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.4578,
        "lng": 125.812501,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "15:30",
                    "24:00"
                ],
                "1": [
                    "15:30",
                    "24:00"
                ],
                "2": null,
                "3": [
                    "15:30",
                    "24:00"
                ],
                "4": [
                    "15:30",
                    "24:00"
                ],
                "5": [
                    "15:30",
                    "24:00"
                ],
                "6": [
                    "15:30",
                    "24:00"
                ]
            }
        },
        "tags": [
            "FreeWiFi",
            "PetFriendly",
            "OutdoorSeating"
        ],
        "amenities": [
            "Scenic Café",
            "Free WiFi",
            "Outdoor Seating",
            "Pet Friendly"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/ryokou8100",
            "instagram": "ryokou8100"
        },
        "image": UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        "imageAlt": "Stock photo of black coffee on a wooden table (not taken at this cafe)",
        "menu": [],
        "note": "Café run from a parked SUV, serving coffee and light bites in the evening.",
        "sources": [
            "https://kapehanap.com/shop/ryokou-8100/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-mama-jeans-matcha-bar",
        "name": "Mama Jeans Matcha Bar",
        "address": "Near Divine Mercy School, Capitol Circumferential Road, Curvada, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.462579,
        "lng": 125.816143,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": null,
                "1": [
                    "13:00",
                    "21:00"
                ],
                "2": [
                    "13:00",
                    "21:00"
                ],
                "3": [
                    "13:00",
                    "21:00"
                ],
                "4": [
                    "13:00",
                    "21:00"
                ],
                "5": [
                    "13:00",
                    "21:00"
                ],
                "6": [
                    "13:00",
                    "21:00"
                ]
            }
        },
        "tags": [],
        "amenities": [
            "Indoor Seating",
            "Matcha"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/mamajeansmatcha/",
            "instagram": "mamajeansmatcha"
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [],
        "note": "Matcha-focused drink bar in Magugpo North.",
        "sources": [
            "https://kapehanap.com/shop/mama-jeans-matcha-bar/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-matcha-fam-slow-bar",
        "name": "Matcha Fam | Slow Bar",
        "address": "Mingote Store, 438 Mirafuentes Avenue, Briz District, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.456489,
        "lng": 125.812519,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "15:00",
                    "22:00"
                ],
                "1": [
                    "15:00",
                    "22:00"
                ],
                "2": [
                    "18:00",
                    "22:00"
                ],
                "3": [
                    "15:00",
                    "22:00"
                ],
                "4": [
                    "15:00",
                    "22:00"
                ],
                "5": [
                    "15:00",
                    "22:00"
                ],
                "6": [
                    "15:30",
                    "22:00"
                ]
            }
        },
        "tags": [],
        "amenities": [
            "Matcha"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/p/Matcha-Fam-Slow-Bar-61575805632171/",
            "instagram": "matchafam.ph"
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [],
        "note": "Matcha-only slow bar, open in the afternoons and evenings.",
        "sources": [
            "https://kapehanap.com/shop/matcha-fam-slow-bar/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-paayo-cafe",
        "name": "Paayo Cafe",
        "address": "Esmeralda Homes, National Highway (near Timog crossing), Pioneer, Visayan Village, Tagum, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.423089,
        "lng": 125.790402,
        "coordsApprox": false,
        "hours": {
            "days": {
                "0": [
                    "16:00",
                    "24:00"
                ],
                "1": [
                    "10:00",
                    "24:00"
                ],
                "2": [
                    "10:00",
                    "24:00"
                ],
                "3": [
                    "10:00",
                    "24:00"
                ],
                "4": [
                    "10:00",
                    "24:00"
                ],
                "5": [
                    "10:00",
                    "24:00"
                ],
                "6": [
                    "10:00",
                    "24:00"
                ]
            }
        },
        "tags": [],
        "amenities": [
            "Breakfast Available"
        ],
        "phone": null,
        "social": {
            "facebook": "https://www.facebook.com/paayocafetgm/",
            "instagram": null
        },
        "image": UNSPLASH("photo-1509042239860-f550ce710b93"),
        "imageAlt": "Stock photo of a latte with leaf art (not taken at this cafe)",
        "menu": [
            {
                "name": "Spamsilog",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Porksilog",
                "price": null,
                "category": "Meals"
            },
            {
                "name": "Adobosilog",
                "price": null,
                "category": "Meals"
            }
        ],
        "note": "Highway café serving coffee and Filipino silog plates, next to an auto-service shop.",
        "sources": [
            "https://kapehanap.com/shop/paayo-cafe/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-marthas-coffee-house",
        "name": "Martha's Coffee House",
        "address": "Purok Kalamboan, Suaybaguio, Magugpo North, Tagum, Davao del Norte, 8100",
        "neighborhood": "Magugpo North",
        "lat": 7.467539,
        "lng": 125.818021,
        "coordsApprox": false,
        "hours": null,
        "tags": [
            "FreeWiFi",
            "StudySpot"
        ],
        "amenities": [
            "Free WiFi",
            "Laptop Friendly",
            "Power Outlets",
            "Good for Groups",
            "Quiet / Low-Key Spot",
            "Aesthetic / Photogenic Interior",
            "Specialty Coffee",
            "Matcha"
        ],
        "phone": "09510908284",
        "social": {
            "facebook": "https://www.facebook.com/profile.php?id=61584338833510",
            "instagram": null
        },
        "image": UNSPLASH("photo-1442512595331-e89e73853f31"),
        "imageAlt": "Stock photo of coffee beside a laptop (not taken at this cafe)",
        "menu": [
            {
                "name": "Spanish Latte",
                "price": null,
                "category": "Coffee & Drinks"
            },
            {
                "name": "Matcha",
                "price": null,
                "category": "Matcha & Tea"
            }
        ],
        "note": "Hidden-gem coffee house with cozy corners and a sunset view; accepts GCash and bank transfer.",
        "sources": [
            "https://kapehanap.com/shop/marthas-coffee-house/"
        ],
        "reviews": []
    },
    {
        "id": "cafe-kapekol-osmena-street",
        "name": "Kapekol – Osmeña Street",
        "address": "SKL Building, Osmeña Street, Magugpo Poblacion, Tagum, Davao del Norte",
        "neighborhood": "Magugpo Poblacion",
        "lat": 7.447188,
        "lng": 125.804688,
        "coordsApprox": false,
        "hours": {
            "open": "10:00",
            "close": "21:00"
        },
        "tags": [],
        "amenities": [
            "Budget-Friendly"
        ],
        "phone": null,
        "social": {
            "facebook": null,
            "instagram": null
        },
        "image": UNSPLASH("photo-1501339847302-ac426a4a7cbb"),
        "imageAlt": "Stock photo of a cafe counter with pendant lights (not taken at this cafe)",
        "menu": [
            {
                "name": "Sweet Black",
                "price": 55,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Spanish Latte",
                "price": 70,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Strawberry",
                "price": 70,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Chocolate",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Matcha",
                "price": 85,
                "category": "Matcha & Tea",
                "from": true
            },
            {
                "name": "Salted Caramel",
                "price": 85,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Dark Chocolate",
                "price": 95,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Nachos",
                "price": 115,
                "category": "Meals",
                "from": true
            }
        ],
        "note": "Tagum branch of Kapekol, the Mindanao budget coffee chain. Sweet black coffee starts at ₱55 and the Spanish latte at ₱70.",
        "sources": [
            "https://www.foodpanda.ph/restaurant/yht3/kapekol-osmena-street"
        ],
        "reviews": []
    },
    {
        "id": "cafe-starbucks-maharlika-highway-tagum",
        "name": "Starbucks – Maharlika Highway Tagum",
        "address": "Maharlika Highway corner Macario P. Bermudez Street, Visayan Village, Tagum, Davao del Norte",
        "neighborhood": "Visayan Village",
        "lat": 7.4411,
        "lng": 125.8064,
        "coordsApprox": true,
        "hours": {
            "open": "07:00",
            "close": "24:00"
        },
        "tags": [],
        "amenities": [
            "Air Conditioned"
        ],
        "phone": null,
        "social": {
            "facebook": null,
            "instagram": null
        },
        "image": UNSPLASH("photo-1497935586351-b67a49e012bf"),
        "imageAlt": "Stock photo of a coffee drink (not taken at this cafe)",
        "menu": [
            {
                "name": "Caffe Americano",
                "price": 180,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Pure Matcha Latte",
                "price": 195,
                "category": "Matcha & Tea",
                "from": true
            },
            {
                "name": "Caramel Macchiato",
                "price": 215,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "White Mocha",
                "price": 215,
                "category": "Coffee & Drinks",
                "from": true
            },
            {
                "name": "Java Chip Frappuccino",
                "price": 220,
                "category": "Coffee & Drinks",
                "from": true
            }
        ],
        "note": "Starbucks branch on the highway. Prices are from its delivery listing.",
        "sources": [
            "https://www.foodpanda.ph/restaurant/r95e/starbucks-maharlika-highway-tagum"
        ],
        "reviews": []
    }
].map(withRating);

export const ALL_TAGS = ["FreeWiFi", "StudySpot", "24/7", "PetFriendly", "OutdoorSeating"];

/* ------------------------------------------------------------
 * REAL CAFÉ PHOTOS (shown on the café page gallery)
 * ------------------------------------------------------------
 * Card thumbnails above are stock images. The café page only shows
 * REAL photos of the café, listed here. To add some:
 *   1. Get the café's permission (or take the photos yourself).
 *   2. Save them as  assets/cafes/<cafe id>/1.jpg, 2.jpg …  (≈1600 px wide, < 300 KB each)
 *   3. List them below. `credit` is shown under each photo.
 * Don't hot-link Facebook image URLs (scontent…fbcdn.net): they expire.
 * Cafés with no photos show a "See photos on Facebook" card instead.
 *
 * Examples (a local file, then a photo hosted online):
 *   "cafe-kapekol-osmena-street": [
 *     { src: "assets/cafes/cafe-kapekol-osmena-street/1.jpg", alt: "Front counter with the Kapekol menu board", credit: "Photo: Kapekol Tagum" },
 *     { src: "https://i.imgur.com/AbCd123.jpg", alt: "Iced Spanish latte on the counter", credit: "Photo: Maria C." }
 *   ],
 * Each café's id is the end of its page address: #/cafe/<id>.
 * ------------------------------------------------------------ */
export const CAFE_PHOTOS = {
    // "cafe-id": [ { src, alt, credit } ],
};

/** Real photos for a café: the list above, plus any added from the admin form (cafe.photos). */
export function getCafePhotos(cafe) {
    const list = [...(CAFE_PHOTOS[cafe.id] || []), ...(Array.isArray(cafe.photos) ? cafe.photos : [])];
    return list.filter((p) => p && typeof p.src === "string" && p.src.trim());
}

/** Facebook link to show for a cafe: its page if known, otherwise a Facebook search (never a broken link). */
export function facebookLink(cafe) {
    return cafe.social?.facebook || FB_SEARCH(`${cafe.name} Tagum`);
}

/* ============================================================
 * 3. STORAGE HELPERS (safe against quota / private mode errors)
 * ============================================================ */
const KEYS = {
    VERSION: "cafespot_db_version",
    CAFES: "cafespot_cafes",
    USERS: "cafespot_users",
    SESSION: "cafespot_session",
    SAVED: "cafespot_saved_cafes",
    VISITED: "cafespot_visited_cafes",
    CONSENT: "cafespot_cookie_consent",
    EVENTS: "cafespot_analytics",
    RATE: "cafespot_rate_limits",
    THEME: "cafespot_theme",
    LOGINS: "cafespot_login_log"
};
const DB_VERSION = 4; // bump to re-seed browsers that have older data
const memoryFallback = new Map();

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return memoryFallback.has(key) ? memoryFallback.get(key) : fallback;
    }
}
function write(key, value, { fromProvider = false } = {}) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { memoryFallback.set(key, value); }
    // Per-user data (keys ending in __<userId>) is offered to the backend for syncing.
    if (!fromProvider && provider?.onLocalWrite && key.includes("__")) provider.onLocalWrite(key, value);
}
function remove(key) {
    try { localStorage.removeItem(key); } catch { memoryFallback.delete(key); }
}

export function initLocalDatabase() {
    // Re-seed when the schema changes (v1 stored hours as a string).
    if (read(KEYS.VERSION, 0) !== DB_VERSION) {
        write(KEYS.CAFES, INITIAL_CAFES);
        write(KEYS.VERSION, DB_VERSION);
    }
    if (!read(KEYS.CAFES, null)) write(KEYS.CAFES, INITIAL_CAFES);
    if (!read(KEYS.USERS, null)) write(KEYS.USERS, []);
    if (!read(KEYS.SAVED, null)) write(KEYS.SAVED, []);
    if (!read(KEYS.VISITED, null)) write(KEYS.VISITED, []);
    if (!read(KEYS.LOGINS, null)) write(KEYS.LOGINS, []);
}

/* ============================================================
 * 4. UTILITIES
 * ============================================================ */
export function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function uid(prefix) {
    const rand = (crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.random() * 1e9).toString(36);
    return `${prefix}-${Date.now().toString(36)}${rand}`;
}

function withRating(cafe) {
    const reviews = cafe.reviews || [];
    const rating = reviews.length
        ? parseFloat((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1))
        : null;
    return { ...cafe, rating };
}

/** SHA-256 → hex. Uses WebCrypto when available (HTTPS/localhost), pure-JS fallback otherwise. */
export async function sha256(message) {
    const data = new TextEncoder().encode(message);
    if (globalThis.crypto?.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", data);
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return sha256Fallback(data);
}

function sha256Fallback(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, len * 8);
    view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < padded.length; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4);
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(W[t-15], 7) ^ rotr(W[t-15], 18) ^ (W[t-15] >>> 3);
            const s1 = rotr(W[t-2], 17) ^ rotr(W[t-2], 19) ^ (W[t-2] >>> 10);
            W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/* ============================================================
 * 5. VALIDATION
 * ============================================================ */
export const VALIDATORS = {
    name: (v) => /^[\p{L}][\p{L} .'-]{1,49}$/u.test(v.trim()) || "Use 2–50 letters (spaces, . ' - allowed).",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.length <= 120 || "Enter a valid email address.",
    handle: (v) => /^@?[a-zA-Z0-9._]{3,24}$/.test(v.trim()) || "3–24 letters, numbers, dots or underscores.",
    password: (v) =>
        (v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v)) ||
        "At least 8 characters with upper, lower case and a number.",
    required: (v) => v.trim().length > 0 || "This field is required.",
    recoveryKey: (v) => /^[A-HJKMNP-Z2-9]{16}$/.test(normalizeRecoveryKey(v)) || "Recovery keys are 16 letters and numbers, like ABCD-EFGH-JKMN-PQRS.",
    cafeName: (v) => (v.trim().length >= 2 && v.trim().length <= 60) || "Name must be 2–60 characters.",
    address: (v) => (v.trim().length >= 5 && v.trim().length <= 120) || "Address must be 5–120 characters.",
    time: (v) => /^([01]\d|2[0-4]):[0-5]\d$/.test(v) || "Use 24-hour HH:MM.",
    lat: (v) => (v === "" || (Number(v) >= 7.2 && Number(v) <= 7.7)) || "Latitude must be within Tagum (7.2–7.7).",
    lng: (v) => (v === "" || (Number(v) >= 125.6 && Number(v) <= 126.0)) || "Longitude must be within Tagum (125.6–126.0).",
    review: (v) => (v.trim().length >= 10 && v.trim().length <= 500) || "Review must be 10–500 characters.",
    rating: (v) => (Number(v) >= 1 && Number(v) <= 5) || "Choose a rating from 1 to 5.",
    facebook: (v) => v.trim() === "" || /^https:\/\/(www\.|m\.)?facebook\.com\/[\w.\-\/?=%,]+$/i.test(v.trim()) ||
        "Use a full Facebook link, e.g. https://www.facebook.com/yourcafe",
    instagram: (v) => v.trim() === "" || /^@?[a-zA-Z0-9._]{1,30}$/.test(v.trim()) || "Enter an Instagram handle like @yourcafe.",
    phone: (v) => v.trim() === "" || /^[+\d][\d\s()-]{6,18}$/.test(v.trim()) || "Enter a valid phone number."
};

/** Returns true or an error string. */
export function validate(rule, value) {
    const fn = VALIDATORS[rule];
    return fn ? fn(String(value ?? "")) : true;
}

/* ============================================================
 * 6. RATE LIMITING & SPAM PROTECTION (client-side mock)
 * Real protection belongs on the server (per-IP limits, CAPTCHA).
 * ============================================================ */
export function checkRateLimit(action) {
    const { maxAttempts, windowMs } = CONFIG.RATE_LIMIT;
    const all = read(KEYS.RATE, {});
    const now = Date.now();
    const recent = (all[action] || []).filter((t) => now - t < windowMs);
    if (recent.length >= maxAttempts) {
        const retryIn = Math.ceil((windowMs - (now - recent[0])) / 1000);
        return { ok: false, retryIn };
    }
    recent.push(now);
    all[action] = recent;
    write(KEYS.RATE, all);
    return { ok: true };
}

/** Honeypot field must be empty, and the form must not be submitted inhumanly fast. */
export function looksLikeSpam(form) {
    const trap = form.querySelector('[name="website"]');
    if (trap && trap.value) return true;
    const opened = Number(form.dataset.openedAt || 0);
    return opened > 0 && Date.now() - opened < CONFIG.MIN_FORM_FILL_MS;
}

/* ============================================================
 * 7. AUTH — accounts, sessions, account recovery
 * ------------------------------------------------------------
 * LOCAL MODE (what this file does): accounts live in this browser.
 *   • Passwords are never stored. Each account keeps a PBKDF2-SHA256
 *     hash (600,000 iterations, random 16-byte salt per account).
 *   • Session: "Remember me" → localStorage, 30 days, survives restarts.
 *     Unchecked → sessionStorage, ends when the browser closes (max 12 h).
 *     A session stores a password version; resetting the password bumps it,
 *     which signs out every other session of that account.
 *   • Account recovery: a one-time recovery key is shown at sign-up.
 *     Recovery key + email/handle → choose a new password → new key issued.
 *   • 5 wrong passwords lock that account for 5 minutes.
 *
 * PRODUCTION: everything here runs in the visitor's browser, so it can't
 * protect accounts from someone with access to that browser. For real
 * accounts use auth-firebase.js (same function names, email reset links)
 * or your own server with HttpOnly session cookies. See the guide.
 * ============================================================ */
export let AUTH_MODE = Object.freeze({
    provider: "local",          // "local" | "firebase"
    recovery: "recovery-key"    // "recovery-key" (local) | "email-link" (Firebase / server)
});

/* ---- Backend hook ----------------------------------------------------------
 * auth-firebase.js (or your own adapter) calls useAuthProvider({...}) once.
 * From then on registerUser / loginUser / logoutUser / getCurrentUser /
 * getSessionInfo / sendPasswordResetLink are handled by the backend, and
 * every per-user write (stamps, saves, history) is offered to it for syncing.
 * app.js keeps importing from db.js and doesn't change.
 * -------------------------------------------------------------------------- */
let provider = null;
const authListeners = new Set();
export function useAuthProvider(p) {
    provider = p;
    AUTH_MODE = Object.freeze({ ...AUTH_MODE, ...(p.mode || {}) });
}
/** Called whenever sign-in state changes (instant in local mode; async with Firebase). */
export function onAuthChange(fn) {
    authListeners.add(fn);
    return () => authListeners.delete(fn);
}
export function notifyAuthChange() {
    authListeners.forEach((fn) => fn(getCurrentUser()));
}
/** Lets an adapter write cloud data into the local cache (same keys db.js reads). */
export function cacheWrite(key, value) { write(key, value, { fromProvider: true }); }
export function cacheRead(key, fallback) { return read(key, fallback); }

const PBKDF2_ITERATIONS = 600_000;
const SESSION_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const SESSION_TAB_MS = 12 * 60 * 60 * 1000;            // 12 hours, or until the browser closes
const LOCKOUT = { maxFails: 5, ms: 5 * 60 * 1000 };
const KNOWN_ACCOUNTS = "cafespot_known_accounts";
const ACTIVITY = "cafespot_activity";
const BADGE_DATES = "cafespot_badges";

/* ---- small crypto helpers ---- */
function randomBytes(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
}
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

/** Compares two hex strings without stopping at the first difference. */
function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function pbkdf2(password, saltHex, iterations) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256);
    return toHex(new Uint8Array(bits));
}

/** Hash for a new password. WebCrypto exists on https and localhost; plain-http falls back to salted SHA-256. */
async function hashPassword(password) {
    const salt = toHex(randomBytes(16));
    if (globalThis.crypto?.subtle) {
        return { algo: `pbkdf2-sha256:${PBKDF2_ITERATIONS}`, salt, passwordHash: await pbkdf2(password, salt, PBKDF2_ITERATIONS) };
    }
    return { algo: "sha256", salt, passwordHash: await sha256(`${salt}::${password}`) };
}

async function verifyPassword(user, password) {
    const algo = user.algo || "legacy";
    let hash;
    if (algo.startsWith("pbkdf2-sha256:")) hash = await pbkdf2(password, user.salt, Number(algo.split(":")[1]));
    else if (algo === "sha256") hash = await sha256(`${user.salt}::${password}`);
    else hash = await sha256(`${user.salt}::${user.email}::${password}`); // accounts created before this update
    return safeEqual(hash, user.passwordHash);
}

/* ---- recovery keys: 16 characters, no look-alikes (0/O, 1/I/L), ~79 bits ---- */
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newRecoveryKey() {
    let out = "";
    while (out.length < 16) {
        for (const b of randomBytes(24)) {
            if (b < 248 && out.length < 16) out += KEY_ALPHABET[b % 31]; // 248 = 8 × 31, so no modulo bias
        }
    }
    return out.match(/.{4}/g).join("-");
}
export function normalizeRecoveryKey(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
async function hashRecoveryKey(key, salt) {
    // The key is random and long, so a fast salted hash is enough (unlike human-chosen passwords).
    return sha256(`${salt}::recovery::${normalizeRecoveryKey(key)}`);
}
async function issueRecoveryKey(user) {
    const key = newRecoveryKey();
    const salt = toHex(randomBytes(16));
    user.recovery = { salt, hash: await hashRecoveryKey(key, salt), createdAt: new Date().toISOString(), acknowledged: false };
    return key;
}

/* ---- storage that may be localStorage (remembered) or sessionStorage (this browser session) ---- */
function storeGet(store, key) {
    try { const raw = store.getItem(key); return raw === null ? null : JSON.parse(raw); } catch { return null; }
}
function storeSet(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function storeRemove(store, key) {
    try { store.removeItem(key); } catch { /* storage blocked */ }
}
const stores = () => {
    const list = [];
    try { list.push(sessionStorage); } catch { /* blocked */ }
    try { list.push(localStorage); } catch { /* blocked */ }
    return list;
};

function normalizeHandle(h) {
    const clean = h.trim().replace(/^@/, "");
    return "@" + clean.toLowerCase();
}

function findUser(users, identifier) {
    const id = String(identifier || "").trim().toLowerCase();
    if (!id) return null;
    return users.find((u) => u.email === id || u.handle === normalizeHandle(id)) || null;
}

export function getUsers() {
    return read(KEYS.USERS, []);
}

function saveUser(user) {
    const users = getUsers();
    const i = users.findIndex((u) => u.id === user.id);
    if (i > -1) users[i] = user; else users.push(user);
    write(KEYS.USERS, users);
}

function publicUser(u) {
    return {
        id: u.id, name: u.name, email: u.email, handle: u.handle, role: u.role,
        createdAt: u.createdAt || null,
        recoveryAcknowledged: u.role === "admin" || AUTH_MODE.recovery !== "recovery-key" ? true : !!u.recovery?.acknowledged,
        hasRecoveryKey: !!u.recovery
    };
}

/* ---------- Register ---------- */
export async function registerUser({ name, email, handle, password, remember = true }) {
    if (provider?.registerUser) return provider.registerUser({ name, email, handle, password, remember, merge: mergeGuestProgressInto });
    const users = getUsers();
    const emailKey = email.trim().toLowerCase();
    const handleKey = normalizeHandle(handle);
    if (users.some((u) => u.email === emailKey)) throw new Error("An account with this email already exists. Try logging in, or use “Forgot password?”.");
    if (users.some((u) => u.handle === handleKey)) throw new Error("That handle is taken.");
    if (handleKey === "@admin") throw new Error("That handle is reserved.");

    const now = new Date().toISOString();
    const user = {
        id: uid("usr"),
        name: name.trim(),
        email: emailKey,
        handle: handleKey,
        ...(await hashPassword(password)),
        pwdVersion: 1,
        role: "user",
        createdAt: now,
        lastLoginAt: now
    };
    const recoveryKey = await issueRecoveryKey(user);
    saveUser(user);
    startSession(user, { remember, method: "sign-up" });
    logActivity("signup", {}, user.id);
    const merged = mergeGuestProgressInto(user.id);
    return { user: publicUser(user), recoveryKey, merged };
}

/* ---------- Log in ---------- */
export async function loginUser(identifier, password, { remember = true } = {}) {
    if (provider?.loginUser && String(identifier).trim().toLowerCase() !== ADMIN_USERNAME) {
        return provider.loginUser(identifier, password, { remember, merge: mergeGuestProgressInto });
    }
    const id = String(identifier).trim().toLowerCase();

    // Admin path: compared against a salted hash, never a plaintext literal.
    if (id === ADMIN_USERNAME) {
        const hash = await sha256(`${ADMIN_SALT}::${ADMIN_USERNAME}::${password}`);
        if (!safeEqual(hash, ADMIN_PASSWORD_HASH)) throw new Error("Incorrect username or password.");
        const admin = { id: "usr-admin", name: "Administrator", email: "admin@kapehan.tagum", handle: "@admin", role: "admin" };
        startSession(admin, { remember });
        return { user: publicUser(admin), merged: { stamps: 0, saves: 0 } };
    }

    const user = findUser(getUsers(), id);
    // Same message whether or not the account exists (no account enumeration).
    if (!user) throw new Error("Incorrect email/handle or password.");

    if (user.lockedUntil && user.lockedUntil > Date.now()) {
        const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
        throw new Error(`Too many wrong passwords for this account. Try again in ${mins} min, or use “Forgot password?”.`);
    }

    if (!(await verifyPassword(user, password))) {
        user.failedLogins = (user.failedLogins || 0) + 1;
        if (user.failedLogins >= LOCKOUT.maxFails) {
            user.lockedUntil = Date.now() + LOCKOUT.ms;
            user.failedLogins = 0;
        }
        saveUser(user);
        throw new Error("Incorrect email/handle or password.");
    }

    // Older accounts get upgraded to PBKDF2 the first time they log in.
    if (!String(user.algo || "").startsWith("pbkdf2") && globalThis.crypto?.subtle) Object.assign(user, await hashPassword(password));
    user.failedLogins = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    user.pwdVersion = user.pwdVersion || 1;
    saveUser(user);
    startSession(user, { remember });
    logActivity("login", { device: deviceLabel() }, user.id);
    return { user: publicUser(user), merged: mergeGuestProgressInto(user.id) };
}

/* ---------- Account recovery ---------- */
/**
 * Local recovery: email/handle + recovery key → new password.
 * Always the same error for "no such account" and "wrong key".
 * On success: new password, every other session signed out, NEW recovery key returned.
 */
export async function resetPasswordWithRecoveryKey({ identifier, recoveryKey, newPassword, remember = true }) {
    const generic = "That account and recovery key don't match. Check both and try again.";
    const user = findUser(getUsers(), identifier);
    if (!user || !user.recovery) {
        await sha256(String(recoveryKey)); // similar timing whether or not the account exists
        throw new Error(generic);
    }
    if (user.recoveryLockedUntil && user.recoveryLockedUntil > Date.now()) {
        throw new Error(`Too many attempts. Try again in ${Math.ceil((user.recoveryLockedUntil - Date.now()) / 60000)} min.`);
    }
    const ok = safeEqual(await hashRecoveryKey(recoveryKey, user.recovery.salt), user.recovery.hash);
    if (!ok) {
        user.recoveryFails = (user.recoveryFails || 0) + 1;
        if (user.recoveryFails >= LOCKOUT.maxFails) { user.recoveryLockedUntil = Date.now() + LOCKOUT.ms; user.recoveryFails = 0; }
        saveUser(user);
        throw new Error(generic);
    }

    Object.assign(user, await hashPassword(newPassword));
    user.pwdVersion = (user.pwdVersion || 1) + 1;   // invalidates sessions on other tabs/devices
    user.failedLogins = 0; user.lockedUntil = null;
    user.recoveryFails = 0; user.recoveryLockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    const newKey = await issueRecoveryKey(user);    // the used key stops working
    saveUser(user);
    startSession(user, { remember, method: "recovery" });
    logActivity("password_reset", {}, user.id);
    return { user: publicUser(user), recoveryKey: newKey };
}

/** Email-link recovery exists only with a backend (Firebase / your server). */
export async function sendPasswordResetLink(email) {
    if (provider?.sendPasswordResetLink) return provider.sendPasswordResetLink(email);
    throw new Error("Email reset links need a backend. This site is in local mode: use your recovery key.");
}

/** Logged-in users can replace a lost or exposed recovery key (password required). */
export async function regenerateRecoveryKey(password) {
    const me = getCurrentUser();
    if (!me || me.role === "admin") throw new Error("Log in to manage your recovery key.");
    const user = getUsers().find((u) => u.id === me.id);
    if (!(await verifyPassword(user, password))) throw new Error("That password isn't right.");
    const key = await issueRecoveryKey(user);
    saveUser(user);
    logActivity("recovery_key", {}, user.id);
    return key;
}

export function acknowledgeRecoveryKey() {
    const me = getCurrentUser();
    if (!me || me.role === "admin") return;
    const user = getUsers().find((u) => u.id === me.id);
    if (user?.recovery) { user.recovery.acknowledged = true; saveUser(user); }
}

/* ---------- Sessions ---------- */
function deviceLabel() {
    return typeof navigator !== "undefined" && /Mobi|Android|iPhone/i.test(navigator.userAgent || "") ? "Mobile" : "Desktop";
}

function startSession(user, { remember = true, method = "login" } = {}) {
    clearSession();
    const now = Date.now();
    const session = {
        userId: user.id,
        token: toHex(randomBytes(16)),   // with a server, this is an HttpOnly cookie instead
        remember,
        pwdVersion: user.pwdVersion || 1,
        createdAt: now,
        expiresAt: now + (remember ? SESSION_REMEMBER_MS : SESSION_TAB_MS),
        user: publicUser(user)
    };
    const target = remember ? localStorage : sessionStorage;
    if (!storeSet(target, KEYS.SESSION, session)) write(KEYS.SESSION, session);
    recordLogin(user, method);
    if (remember && user.role !== "admin") rememberAccount(user);
}

function clearSession() {
    stores().forEach((s) => storeRemove(s, KEYS.SESSION));
    remove(KEYS.SESSION);
}

function getSession() {
    for (const s of stores()) {
        const session = storeGet(s, KEYS.SESSION);
        if (session) return session;
    }
    return read(KEYS.SESSION, null);
}

/** The signed-in user, or null. Ends the session if it expired, the account was removed, or the password changed. */
export function getCurrentUser() {
    const session = getSession();
    if (provider?.getCurrentUser && session?.user?.role !== "admin") return provider.getCurrentUser();
    if (!session) return null;
    if (!session.expiresAt || session.expiresAt < Date.now()) { clearSession(); return null; }
    if (session.user?.role === "admin") return session.user;
    const user = getUsers().find((u) => u.id === (session.userId || session.user?.id));
    if (!user || (user.pwdVersion || 1) !== (session.pwdVersion || 1)) { clearSession(); return null; }
    return publicUser(user);
}

/** For the account card: how long this device stays signed in. */
export function getSessionInfo() {
    if (provider?.getSessionInfo && getSession()?.user?.role !== "admin") return provider.getSessionInfo();
    const s = getSession();
    return s ? { remember: !!s.remember, createdAt: s.createdAt || null, expiresAt: s.expiresAt } : null;
}

export function isAdmin() {
    return getCurrentUser()?.role === "admin";
}

export function logoutUser() {
    clearSession();
    if (provider?.logoutUser) provider.logoutUser();
    notifyAuthChange();
}

/* ---------- "Continue as …" accounts remembered on this device ---------- */
function rememberAccount(user) {
    const list = read(KNOWN_ACCOUNTS, []).filter((a) => a.id !== user.id);
    list.unshift({ id: user.id, name: user.name, handle: user.handle, email: user.email, lastUsed: new Date().toISOString() });
    write(KNOWN_ACCOUNTS, list.slice(0, 3));
}
export function getKnownAccounts() {
    const ids = new Set(getUsers().map((u) => u.id));
    return read(KNOWN_ACCOUNTS, []).filter((a) => ids.has(a.id));
}
export function forgetKnownAccount(id) {
    write(KNOWN_ACCOUNTS, read(KNOWN_ACCOUNTS, []).filter((a) => a.id !== id));
}

/* Login audit log (shown masked in the admin dashboard; capped at 300 entries) */
function recordLogin(user, method) {
    const log = read(KEYS.LOGINS, []);
    log.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        handle: user.handle,
        role: user.role,
        method, // "login" | "sign-up" | "recovery"
        at: new Date().toISOString(),
        device: deviceLabel()
    });
    write(KEYS.LOGINS, log.slice(-300));
}

export function getLoginLog() {
    if (!isAdmin()) return [];
    return read(KEYS.LOGINS, []).slice().reverse();
}

/* Privacy masking for the admin audit table */
export function maskEmail(email) {
    const [local, domain] = String(email).split("@");
    if (!domain) return "***";
    if (local.length <= 2) return `${local[0] || ""}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskHandle(handle) {
    const h = String(handle).replace(/^@/, "");
    if (h.length <= 2) return `@${h[0] || ""}***`;
    return `@${h[0]}***${h[h.length - 1]}`;
}

export function maskName(name) {
    return String(name).trim().split(/\s+/).map((part) =>
        part.length <= 1 ? part : `${part[0]}${"*".repeat(Math.min(part.length - 1, 4))}`
    ).join(" ");
}

export function deleteUser(userId) {
    if (!isAdmin()) throw new Error("Admin access required.");
    write(KEYS.USERS, getUsers().filter((u) => u.id !== userId));
    forgetKnownAccount(userId);
}

/* ============================================================
 * 7b. ACTIVITY HISTORY, BADGES, PROGRESS (per account; guests get a device-only copy)
 * ============================================================ */
function activityKey(userId) {
    return userId ? `${ACTIVITY}__${userId}` : ACTIVITY;
}

/** Append an event: signup | login | visit | save | review | badge | password_reset | recovery_key */
export function logActivity(type, data = {}, userId = getCurrentUser()?.id) {
    const key = activityKey(userId);
    const list = read(key, []);
    list.push({ type, ...data, at: new Date().toISOString() });
    write(key, list.slice(-300));
}

function unlogActivity(type, cafeId) {
    const key = activityKey(getCurrentUser()?.id);
    const list = read(key, []);
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].type === type && list[i].cafeId === cafeId) { list.splice(i, 1); break; }
    }
    write(key, list);
}

/** Newest first. Visits made before history existed are rebuilt from their stamp dates. */
export function getActivity() {
    const list = read(activityKey(getCurrentUser()?.id), []);
    const logged = new Set(list.filter((e) => e.type === "visit").map((e) => e.cafeId));
    const dates = read(listKey(VISIT_DATES), {});
    getVisitedCafeIds().forEach((id) => {
        if (!logged.has(id)) list.push({ type: "visit", cafeId: id, cafeName: getCafe(id)?.name, at: dates[id] || null });
    });
    return list.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at));
}

/** Stamps and saves collected as a guest move into the account on sign-up / log-in. */
function mergeGuestProgressInto(userId) {
    const guestVisited = read(KEYS.VISITED, []);
    const guestSaved = read(KEYS.SAVED, []);
    if (!guestVisited.length && !guestSaved.length) return { stamps: 0, saves: 0 };
    const k = (base) => `${base}__${userId}`;

    const visited = read(k(KEYS.VISITED), []);
    const dates = read(k(VISIT_DATES), {});
    const guestDates = read(VISIT_DATES, {});
    const newStamps = guestVisited.filter((id) => !visited.includes(id));
    newStamps.forEach((id) => {
        visited.push(id);
        dates[id] = guestDates[id] || new Date().toISOString();
        logActivity("visit", { cafeId: id, cafeName: getCafe(id)?.name }, userId);
    });
    write(k(KEYS.VISITED), visited);
    write(k(VISIT_DATES), dates);

    const saved = read(k(KEYS.SAVED), []);
    const newSaves = guestSaved.filter((id) => !saved.includes(id));
    write(k(KEYS.SAVED), saved.concat(newSaves));

    write(KEYS.VISITED, []);
    write(KEYS.SAVED, []);
    write(VISIT_DATES, {});
    write(ACTIVITY, []);
    return { stamps: newStamps.length, saves: newSaves.length };
}

/**
 * Badge rules. `progress(ctx)` returns how far along the user is; `goal` is the target.
 * ctx = { visited: cafe[], saved: number, reviews: number, total: number }
 */
export const BADGES = [
    { id: "first-stamp", name: "First Stamp", icon: "i-check", hint: "Stamp your first café", goal: 1, progress: (c) => c.visited.length },
    { id: "regular", name: "Regular", icon: "i-cup", hint: "Stamp 5 cafés", goal: 5, progress: (c) => c.visited.length },
    { id: "hopper", name: "Café Hopper", icon: "i-map", hint: "Stamp 10 cafés", goal: 10, progress: (c) => c.visited.length },
    { id: "study-buddy", name: "Study Buddy", icon: "i-book", hint: "Stamp 3 study spots", goal: 3, tag: "StudySpot", progress: (c) => c.visited.filter((x) => (x.tags || []).includes("StudySpot")).length },
    { id: "night-owl", name: "Night Owl", icon: "i-moon", hint: "Stamp a 24/7 café", goal: 1, tag: "24/7", progress: (c) => c.visited.filter((x) => (x.tags || []).includes("24/7")).length },
    { id: "explorer", name: "Neighborhood Explorer", icon: "i-compass", hint: "Stamp cafés in 4 different areas", goal: 4, progress: (c) => new Set(c.visited.map((x) => x.neighborhood)).size },
    { id: "critic", name: "Critic", icon: "i-pen", hint: "Write your first review", goal: 1, progress: (c) => c.reviews },
    { id: "collector", name: "Collector", icon: "i-heart", hint: "Save 5 cafés", goal: 5, progress: (c) => c.saved },
    { id: "halfway", name: "Halfway There", icon: "i-flag", hint: "Stamp half of Tagum's cafés", goal: (c) => Math.ceil(c.total / 2), progress: (c) => c.visited.length },
    { id: "full-card", name: "Full Card", icon: "i-medal", hint: "Stamp every café on the list", goal: (c) => c.total, progress: (c) => c.visited.length }
];

/**
 * Everything the dashboard needs, computed from stored data.
 * Also records when each badge was earned and returns badges earned just now.
 */
export function getProgress() {
    const me = getCurrentUser();
    const cafes = getCafes();
    const byId = new Map(cafes.map((c) => [c.id, c]));
    const visited = getVisitedCafeIds().map((id) => byId.get(id)).filter(Boolean);
    const savedIds = getSavedCafeIds().filter((id) => byId.has(id));
    const myReviews = me ? cafes.flatMap((c) => (c.reviews || []).filter((r) => r.userId === me.id).map((r) => ({ ...r, cafeId: c.id, cafeName: c.name }))) : [];
    const ctx = { visited, saved: savedIds.length, reviews: myReviews.length, total: cafes.length };

    const dateKey = listKey(BADGE_DATES);
    const earnedDates = read(dateKey, {});
    const newlyEarned = [];
    const badges = BADGES.map((b) => {
        const goal = Math.max(1, typeof b.goal === "function" ? b.goal(ctx) : b.goal);
        const current = Math.min(b.progress(ctx), goal);
        const earned = current >= goal;
        if (earned && !earnedDates[b.id]) {
            earnedDates[b.id] = new Date().toISOString();
            if (me) { newlyEarned.push(b); logActivity("badge", { badgeId: b.id, badgeName: b.name }, me.id); }
        }
        if (!earned && earnedDates[b.id]) delete earnedDates[b.id];
        return { id: b.id, name: b.name, icon: b.icon, hint: b.hint, tag: b.tag || null, goal, current, earned, earnedAt: earnedDates[b.id] || null };
    });
    if (me) write(dateKey, earnedDates);

    const visitDates = read(listKey(VISIT_DATES), {});
    const stamps = visited
        .map((c) => ({ cafe: c, at: visitDates[c.id] || null }))
        .sort((a, b) => (b.at || "").localeCompare(a.at || ""));

    return {
        user: me,
        total: cafes.length,
        visitedCount: visited.length,
        pct: cafes.length ? Math.round((visited.length / cafes.length) * 100) : 0,
        stamps,
        savedIds,
        reviews: myReviews,
        badges,
        newlyEarned: me ? newlyEarned : []
    };
}

/* ============================================================
 * 7c. ROLES (café finder / café owner), PAGE ANALYTICS, LEADERBOARD, OWNER PHOTOS
 * ------------------------------------------------------------
 * The role is chosen after log-in and stored per account on this device
 * (works the same with the local accounts and with auth-firebase.js).
 * LOCAL MODE NOTE: analytics and the leaderboard count what happens in this
 * browser. With a backend, the same functions would read shared, server-side
 * counters so every visitor and every finder is included.
 * ============================================================ */
const PERSONA_KEY = "cafespot_persona";

/** "finder" | "owner" | null (not chosen yet). Admins are neither. */
export function getPersona(userId = getCurrentUser()?.id) {
    if (!userId) return null;
    return read(`${PERSONA_KEY}__${userId}`, null)?.persona || null;
}
/** Whether the person ticked "Remember my choice" (then the picker is skipped at log-in). */
export function personaRemembered(userId = getCurrentUser()?.id) {
    return !!(userId && read(`${PERSONA_KEY}__${userId}`, null)?.remember);
}
export function setPersona(persona, remember = true) {
    const me = getCurrentUser();
    if (!me || me.role === "admin") return;
    if (!["finder", "owner"].includes(persona)) throw new Error("Unknown role.");
    write(`${PERSONA_KEY}__${me.id}`, { persona, remember: !!remember, at: new Date().toISOString() });
}

/** Owners manage the cafés they published; admins manage everything. */
export function canManageCafe(cafeId) {
    const me = getCurrentUser();
    if (!me) return false;
    if (me.role === "admin") return true;
    const cafe = read(KEYS.CAFES, []).find((c) => c.id === cafeId);
    return !!cafe && !!cafe.ownerId && cafe.ownerId === me.id;
}
export function getOwnedCafes(userId = getCurrentUser()?.id) {
    return userId ? getCafes().filter((c) => c.ownerId === userId) : [];
}

/* ---------- Page analytics: anonymous daily counters per café (no names) ---------- */
const STATS = "cafespot_cafe_stats";
export const STAT_TYPES = ["view", "preview", "checkin", "save", "directions", "social", "wheel"];
const phDay = (t = Date.now()) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD, Philippine time

export function recordCafeEvent(cafeId, type) {
    if (!cafeId || !STAT_TYPES.includes(type)) return;
    const all = read(STATS, {});
    const cafe = (all[cafeId] = all[cafeId] || {});
    const day = phDay();
    cafe[day] = cafe[day] || {};
    cafe[day][type] = (cafe[day][type] || 0) + 1;
    const cutoff = phDay(Date.now() - 180 * 864e5);                 // keep ~6 months
    Object.keys(cafe).forEach((d) => { if (d < cutoff) delete cafe[d]; });
    write(STATS, all);
}

/** Totals + a day-by-day series for the last `days` days (oldest first). */
export function getCafeStats(cafeId, days = 14) {
    const byDay = read(STATS, {})[cafeId] || {};
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const day = phDay(Date.now() - i * 864e5);
        series.push({ day, ...Object.fromEntries(STAT_TYPES.map((t) => [t, byDay[day]?.[t] || 0])) });
    }
    const sum = (rows, t) => rows.reduce((a, r) => a + (r[t] || 0), 0);
    const allRows = Object.values(byDay);
    const prev = [];
    for (let i = 2 * days - 1; i >= days; i--) prev.push(byDay[phDay(Date.now() - i * 864e5)] || {});

    // People (accounts + guest on this device) who currently have it stamped / saved
    const users = getUsers();
    const lists = (base) => [read(base, []), ...users.map((u) => read(`${base}__${u.id}`, []))];
    const stampedBy = lists(KEYS.VISITED).filter((l) => l.includes(cafeId)).length;
    const savedBy = lists(KEYS.SAVED).filter((l) => l.includes(cafeId)).length;
    const cafe = getCafe(cafeId);
    return {
        series,
        period: Object.fromEntries(STAT_TYPES.map((t) => [t, sum(series, t)])),
        previous: Object.fromEntries(STAT_TYPES.map((t) => [t, sum(prev, t)])),
        allTime: Object.fromEntries(STAT_TYPES.map((t) => [t, sum(allRows, t)])),
        stampedBy,
        savedBy,
        reviews: cafe?.reviews?.length || 0,
        rating: cafe?.rating ?? null
    };
}

/* ---------- Leaderboard ---------- */
/** Finders ranked by cafés stamped, then badges, then reviews. */
export function getLeaderboard() {
    const cafeIds = new Set(read(KEYS.CAFES, []).map((c) => c.id));
    const me = getCurrentUser();
    const reviewsBy = {};
    read(KEYS.CAFES, []).forEach((c) => (c.reviews || []).forEach((r) => { reviewsBy[r.userId] = (reviewsBy[r.userId] || 0) + 1; }));
    return getUsers()
        .filter((u) => u.role !== "admin" && getPersona(u.id) !== "owner")
        .map((u) => ({
            id: u.id, name: u.name, handle: u.handle,
            stamps: read(`${KEYS.VISITED}__${u.id}`, []).filter((id) => cafeIds.has(id)).length,
            badges: Object.keys(read(`cafespot_badges__${u.id}`, {})).length,
            reviews: reviewsBy[u.id] || 0,
            isMe: !!me && me.id === u.id
        }))
        .sort((a, b) => b.stamps - a.stamps || b.badges - a.badges || b.reviews - a.reviews || a.name.localeCompare(b.name))
        .map((row, i, arr) => ({ ...row, rank: i > 0 && arr[i - 1].stamps === row.stamps && arr[i - 1].badges === row.badges ? null : i + 1 }));
}

/** Cafés ranked by how many people have stamped them (check-ins as a tie-break). */
export function getCafeLeaderboard(limit = 10) {
    const users = getUsers();
    const lists = [read(KEYS.VISITED, []), ...users.map((u) => read(`${KEYS.VISITED}__${u.id}`, []))];
    const stats = read(STATS, {});
    return getCafes()
        .map((c) => ({
            cafe: c,
            people: lists.filter((l) => l.includes(c.id)).length,
            checkins: Object.values(stats[c.id] || {}).reduce((a, d) => a + (d.checkin || 0), 0)
        }))
        .filter((r) => r.people > 0 || r.checkins > 0)
        .sort((a, b) => b.people - a.people || b.checkins - a.checkins || a.cafe.name.localeCompare(b.cafe.name))
        .slice(0, limit);
}

/* ---------- Official photos uploaded by owners (IndexedDB: images are too big for localStorage) ---------- */
const PHOTO_DB = "cafespot-photos";
function photoDb() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in globalThis)) { reject(new Error("This browser can't store photos.")); return; }
        const req = indexedDB.open(PHOTO_DB, 1);
        req.onupgradeneeded = () => {
            const store = req.result.createObjectStore("photos", { keyPath: "id" });
            store.createIndex("cafeId", "cafeId");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function photoTx(mode, fn) {
    const db = await photoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("photos", mode);
        const result = fn(tx.objectStore("photos"));
        tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
export const OWNER_PHOTO_LIMIT = 12;

/** Official photos for a café, cover first. Each: { id, cafeId, blob, alt, credit, order, createdAt }. */
export async function listOwnerPhotos(cafeId) {
    try {
        const rows = await photoTx("readonly", (store) => store.index("cafeId").getAll(cafeId));
        return (rows || []).sort((a, b) => a.order - b.order);
    } catch {
        return [];
    }
}
export async function addOwnerPhoto(cafeId, blob, { alt = "" } = {}) {
    if (!canManageCafe(cafeId)) throw new Error("Only the café's owner can add official photos.");
    const existing = await listOwnerPhotos(cafeId);
    if (existing.length >= OWNER_PHOTO_LIMIT) throw new Error(`You can add up to ${OWNER_PHOTO_LIMIT} photos per café.`);
    const cafe = getCafe(cafeId);
    const row = {
        id: uid("photo"), cafeId, blob,
        alt: String(alt).slice(0, 140),
        credit: `Official photo · ${cafe?.name || "café"}`,
        order: existing.length ? existing[existing.length - 1].order + 1 : 1,
        createdAt: new Date().toISOString()
    };
    await photoTx("readwrite", (store) => store.put(row));
    return row;
}
export async function updateOwnerPhoto(photo, patch) {
    if (!canManageCafe(photo.cafeId)) throw new Error("Only the café's owner can edit its photos.");
    await photoTx("readwrite", (store) => store.put({ ...photo, ...patch }));
}
export async function deleteOwnerPhoto(photo) {
    if (!canManageCafe(photo.cafeId)) throw new Error("Only the café's owner can remove its photos.");
    await photoTx("readwrite", (store) => store.delete(photo.id));
}

/* ============================================================
 * 8. CAFES — CRUD, reviews, open-now status
 * ============================================================ */
export function getCafes() {
    return read(KEYS.CAFES, []).map(withRating);
}

export function getCafe(id) {
    return getCafes().find((c) => c.id === id) || null;
}

function saveCafes(cafes) {
    write(KEYS.CAFES, cafes);
}

/**
 * Menu text → items. One item per line, "Name - price"; a line starting with # starts a category.
 *   # Coffee
 *   Spanish Latte - 120
 *   Americano - 95
 */
export function parseMenuText(text) {
    let category = "Menu";
    const items = [];
    String(text || "").split(/\r?\n/).forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        if (line.startsWith("#")) { category = line.replace(/^#+/, "").trim().slice(0, 40) || "Menu"; return; }
        const m = line.match(/^(.*?)(?:\s*[-–—:]\s*(?:₱|PHP|P)?\s*(\d{1,5}(?:\.\d{1,2})?))?$/i);
        const name = (m ? m[1] : line).trim().slice(0, 60);
        if (!name) return;
        items.push({ name, price: m && m[2] ? Number(m[2]) : null, category });
    });
    return items.slice(0, 60);
}

export function menuToText(menu = []) {
    let last = null;
    return menu.map((m) => {
        const head = m.category && m.category !== last ? `# ${m.category}\n` : "";
        last = m.category;
        return `${head}${m.name}${m.price != null ? ` - ${m.price}` : ""}`;
    }).join("\n");
}

function sanitizeCafeInput(data) {
    const tags = (data.tags || []).filter((t) => ALL_TAGS.includes(t));
    const noCoords = data.lat === "" || data.lat == null || data.lng === "" || data.lng == null;
    const fb = (data.facebook || "").trim();
    const ig = (data.instagram || "").trim().replace(/^@/, "");
    let hours = data.hoursUnknown ? null : { open: data.open || "08:00", close: data.close || "22:00" };
    if (tags.includes("24/7")) hours = { open: "00:00", close: "24:00" };
    const extra = {};
    if (typeof data.note === "string") extra.note = data.note.trim().slice(0, 400);
    if (typeof data.menuText === "string") extra.menu = parseMenuText(data.menuText);
    return {
        ...extra,
        name: data.name.trim(),
        address: data.address.trim(),
        neighborhood: (data.neighborhood || "").trim() || "Tagum City",
        lat: noCoords ? CONFIG.TAGUM_CENTER[0] : Number(data.lat),
        lng: noCoords ? CONFIG.TAGUM_CENTER[1] : Number(data.lng),
        coordsApprox: noCoords ? true : !!data.coordsApprox,
        hours,
        hoursConfirmed: !!hours,
        tags,
        phone: (data.phone || "").trim() || null,
        social: {
            facebook: validate("facebook", fb) === true && fb ? fb : null,
            instagram: validate("instagram", ig) === true && ig ? ig : null
        }
    };
}

export function addCafe(data) {
    if (!getCurrentUser()) throw new Error("Please log in to add a cafe.");
    const cafes = read(KEYS.CAFES, []);
    const clean = sanitizeCafeInput(data);
    const newCafe = {
        id: uid("cafe"),
        ...clean,
        image: UNSPLASH("photo-1495474472287-4d71bcdd2085"),
        imageAlt: `Stock photo of coffee (not taken at ${clean.name})`,
        note: clean.note || "Community-submitted listing.",
        sources: [],
        addedBy: getCurrentUser()?.handle || "guest",
        // Published from the owner dashboard → this account manages the listing, photos and analytics.
        ownerId: getPersona() === "owner" ? getCurrentUser().id : null,
        publishedAt: new Date().toISOString(),
        menu: clean.menu || [],
        reviews: []
    };
    cafes.unshift(newCafe);
    saveCafes(cafes);
    return withRating(newCafe);
}

export function updateCafe(id, data) {
    if (!canManageCafe(id)) throw new Error("Only the café's owner or an admin can edit this listing.");
    const cafes = read(KEYS.CAFES, []);
    const i = cafes.findIndex((c) => c.id === id);
    if (i === -1) throw new Error("Cafe not found.");
    const clean = sanitizeCafeInput(data);
    if (data.keepHours && cafes[i].hours) { clean.hours = cafes[i].hours; clean.hoursConfirmed = true; }
    cafes[i] = { ...cafes[i], ...clean };
    saveCafes(cafes);
    return withRating(cafes[i]);
}

export function deleteCafe(id) {
    if (!canManageCafe(id)) throw new Error("Only the café's owner or an admin can remove this listing.");
    saveCafes(read(KEYS.CAFES, []).filter((c) => c.id !== id));
    write(listKey(KEYS.SAVED), getSavedCafeIds().filter((x) => x !== id));
    write(listKey(KEYS.VISITED), getVisitedCafeIds().filter((x) => x !== id));
}

export function resetCafeDirectory() {
    if (!isAdmin()) throw new Error("Admin access required.");
    saveCafes(INITIAL_CAFES);
}

export function addReviewToCafe(cafeId, text, rating) {
    const user = getCurrentUser();
    if (!user) throw new Error("Please log in to write a review.");
    const cafes = read(KEYS.CAFES, []);
    const cafe = cafes.find((c) => c.id === cafeId);
    if (!cafe) throw new Error("Cafe not found.");
    cafe.reviews = cafe.reviews || [];
    if (cafe.reviews.some((r) => r.userId === user.id)) throw new Error("You've already reviewed this cafe.");
    cafe.reviews.unshift({
        userId: user.id,
        user: user.name,
        text: text.trim(),
        rating: Number(rating),
        date: new Date().toISOString().split("T")[0]
    });
    saveCafes(cafes);
    logActivity("review", { cafeId: cafe.id, cafeName: cafe.name, rating: Number(rating) }, user.id);
    return withRating(cafe);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** Weekly schedule as 7 entries (0 = Sunday): [open, close] or null when closed. Null if hours unknown. */
export function getSchedule(cafe) {
    const h = cafe.hours;
    if (!h) return null;
    if (h.days) return DAY_NAMES.map((_, i) => h.days[i] ?? h.days[String(i)] ?? null);
    if (h.open && h.close) return DAY_NAMES.map(() => [h.open, h.close]);
    return null;
}

function is247(sched) {
    return sched && sched.every((d) => d && d[0] === "00:00" && d[1] === "24:00");
}

/** Real-time open status in Philippine time (UTC+8), regardless of the visitor's timezone. */
export function getOpenStatus(cafe, now = new Date()) {
    const sched = getSchedule(cafe);
    if (!sched) return { isOpen: null, label: "Hours not published" };
    if (is247(sched)) return { isOpen: true, label: "Open 24 hours" };

    const ph = new Date(now.getTime() + 8 * 3600 * 1000);
    const day = ph.getUTCDay();
    const mins = ph.getUTCHours() * 60 + ph.getUTCMinutes();
    const today = sched[day];
    const yesterday = sched[(day + 6) % 7];

    // Still open from yesterday's past-midnight shift?
    if (yesterday) {
        const [yo, yc] = yesterday.map(toMin);
        if (yc <= yo && mins < yc) return { isOpen: true, label: `Open · closes ${formatTime(yesterday[1])}` };
    }
    if (today) {
        const [o, c] = today.map(toMin);
        const open = c > o ? mins >= o && mins < c : mins >= o; // c <= o means it closes after midnight
        if (open) return { isOpen: true, label: `Open · closes ${formatTime(today[1])}` };
        if (mins < o) return { isOpen: false, label: `Closed · opens ${formatTime(today[0])}` };
    }
    for (let k = 1; k <= 7; k++) {
        const next = sched[(day + k) % 7];
        if (next) return { isOpen: false, label: `Closed · opens ${k === 1 ? "tomorrow" : DAY_NAMES[(day + k) % 7]} ${formatTime(next[0])}` };
    }
    return { isOpen: false, label: "Closed" };
}

export function formatTime(t) {
    let [h, m] = t.split(":").map(Number);
    if (h === 24) h = 0;
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Human-readable hours, grouping consecutive days with the same times ("Mon–Sat 7 AM – 12 AM · Sun 1 PM – 12 AM"). */
export function formatHours(cafe) {
    const sched = getSchedule(cafe);
    if (!sched) return "Hours not published";
    if (is247(sched)) return "Open 24/7";
    const label = (d) => (d ? `${formatTime(d[0])} – ${formatTime(d[1])}` : "Closed");
    const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
    const groups = [];
    order.forEach((i) => {
        const text = label(sched[i]);
        const last = groups[groups.length - 1];
        if (last && last.text === text) last.end = i; else groups.push({ start: i, end: i, text });
    });
    if (groups.length === 1) return `Daily ${groups[0].text}`;
    return groups.map((g) => `${DAY_NAMES[g.start]}${g.start !== g.end ? "–" + DAY_NAMES[g.end] : ""} ${g.text}`).join(" · ");
}

/* ============================================================
 * 9. SAVED & VISITED (per user when logged in, else guest)
 * ============================================================ */
function listKey(base) {
    const u = getCurrentUser();
    return u ? `${base}__${u.id}` : base;
}

export function getSavedCafeIds() { return read(listKey(KEYS.SAVED), []); }
export function getVisitedCafeIds() { return read(listKey(KEYS.VISITED), []); }

function toggleIn(key, id) {
    const list = read(key, []);
    const i = list.indexOf(id);
    if (i > -1) list.splice(i, 1); else list.push(id);
    write(key, list);
    return i === -1; // true = now included
}

export function toggleSavedCafe(id) {
    const nowSaved = toggleIn(listKey(KEYS.SAVED), id);
    if (nowSaved) logActivity("save", { cafeId: id, cafeName: getCafe(id)?.name });
    else unlogActivity("save", id);
    return nowSaved;
}

/* Visit dates power the rubber stamp ("Oct 19") on visited cafés. */
const VISIT_DATES = "cafespot_visit_dates";
export function getVisitDate(id) { return read(listKey(VISIT_DATES), {})[id] || null; }
export function toggleVisitedCafe(id) {
    const nowVisited = toggleIn(listKey(KEYS.VISITED), id);
    const dates = read(listKey(VISIT_DATES), {});
    if (nowVisited) dates[id] = new Date().toISOString(); else delete dates[id];
    write(listKey(VISIT_DATES), dates);
    if (nowVisited) logActivity("visit", { cafeId: id, cafeName: getCafe(id)?.name });
    else unlogActivity("visit", id);
    return nowVisited;
}

/* ============================================================
 * 10. LIVE LOCATION STATE + DISTANCE
 * ============================================================ */
export const locationState = {
    coords: null,      // { lat, lng, accuracy }
    status: "idle",    // idle | watching | denied | unavailable | unsupported
    watchId: null,
    listeners: new Set()
};

export function onLocationChange(fn) {
    locationState.listeners.add(fn);
    return () => locationState.listeners.delete(fn);
}

function emitLocation() {
    locationState.listeners.forEach((fn) => fn(locationState));
}

export function startLocationWatch() {
    if (!("geolocation" in navigator)) {
        locationState.status = "unsupported"; emitLocation(); return;
    }
    if (locationState.watchId !== null) return;
    locationState.status = "watching";
    emitLocation();
    locationState.watchId = navigator.geolocation.watchPosition(
        (pos) => {
            locationState.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            locationState.status = "watching";
            emitLocation();
        },
        (err) => {
            locationState.status = err.code === err.PERMISSION_DENIED ? "denied" : "unavailable";
            stopLocationWatch(false);
            emitLocation();
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
}

/**
 * Quick first fix: a low-accuracy position (Wi-Fi / cell, or a recent cached one) usually
 * arrives in about a second, so distances show right away; the GPS watch then sharpens it.
 * Shares the same permission prompt as startLocationWatch() (browsers show it once).
 */
export function requestQuickFix() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (locationState.coords && locationState.coords.accuracy <= pos.coords.accuracy) return; // GPS already better
            locationState.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            if (locationState.watchId !== null) locationState.status = "watching";
            emitLocation();
        },
        () => { /* the watch reports errors */ },
        { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 }
    );
}

/** "granted" | "denied" | "prompt" | "unknown" (Permissions API isn't in every browser). */
export async function getLocationPermission() {
    try {
        const p = await navigator.permissions.query({ name: "geolocation" });
        return p;
    } catch {
        return null;
    }
}

export function stopLocationWatch(emit = true) {
    if (locationState.watchId !== null) navigator.geolocation.clearWatch(locationState.watchId);
    locationState.watchId = null;
    if (emit) { locationState.status = "idle"; emitLocation(); }
}

/** Haversine distance in metres. */
export function distanceMeters(a, b) {
    const R = 6371e3, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kilometres, always: 0.35 km, 2.4 km, 12 km. */
export function formatKm(m) {
    if (m == null || !isFinite(m)) return "";
    const km = m / 1000;
    return km < 10 ? `${km.toFixed(km < 1 ? 2 : 1)} km` : `${Math.round(km)} km`;
}

export function formatDistance(m) {
    if (m == null) return "";
    return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
}

/* ============================================================
 * 11. COOKIE CONSENT + ANALYTICS MOCK
 * ============================================================ */
export function getConsent() { return read(KEYS.CONSENT, null); } // "accepted" | "declined" | null
export function setConsent(value) {
    write(KEYS.CONSENT, value);
    if (value === "declined") remove(KEYS.EVENTS);
}

/** Logs only when analytics cookies were accepted. Swap the body for GA4/Plausible later. */
export function trackEvent(name, props = {}) {
    if (getConsent() !== "accepted") return;
    const events = read(KEYS.EVENTS, []);
    const evt = { name, props, path: location.hash || "#/", at: new Date().toISOString() };
    events.push(evt);
    write(KEYS.EVENTS, events.slice(-200));
    console.debug("[analytics]", name, props);
}

export function getAnalyticsEvents() { return read(KEYS.EVENTS, []); }

/* ============================================================
 * 12. THEME
 * ============================================================ */
export function getTheme() { return read(KEYS.THEME, null); }
export function setTheme(t) { write(KEYS.THEME, t); }