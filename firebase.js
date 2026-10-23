/**
 * CafeSpot Tagum — Firebase backend for accounts (optional: use it when you go live)
 * ------------------------------------------------------------------------------
 * In local mode (db.js alone) accounts live in one browser. Plug this file in
 * and accounts become real:
 *   • Firebase Authentication stores the accounts (Google hashes the passwords,
 *     nothing sensitive sits in localStorage).
 *   • "Keep me logged in" → browserLocalPersistence (stays signed in until
 *     log-out) or browserSessionPersistence (ends when the browser closes).
 *   • "Forgot password?" → Firebase emails a reset link (no recovery keys).
 *   • Stamps, saves, history and badges sync to Firestore (users/{uid}), so
 *     they follow the user to any phone or laptop.
 *
 * TURN IT ON (details in the setup guide):
 *   1. Firebase console → create a project → add a Web app → copy its config below.
 *   2. Authentication → Sign-in method → enable Email/Password.
 *   3. Firestore Database → create it → paste the security rules from the guide.
 *   4. Authentication → Settings → Authorized domains → add your site's domain.
 *   5. In app.js, add this as the very first import:   import "./auth-firebase.js";
 * app.js and the UI don't change: db.js hands its auth functions to this file.
 *
 * Note: the admin login (username "admin") stays local. For a real launch, make
 * admins with Firebase custom claims and check them in Firestore rules.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    sendPasswordResetEmail, sendEmailVerification, updateProfile, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { useAuthProvider, notifyAuthChange, cacheWrite } from "./db.js";

/* 1. Your web app's config (Firebase console → Project settings → Your apps).
      These values only identify the project; they are not secrets. The security
      rules in Firestore are what protect each user's data. */
const firebaseConfig = {
    apiKey: "PASTE_YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    appId: "PASTE_YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "en";
const db = getFirestore(app);

const REMEMBER_KEY = "cafespot_fb_remember";
// Per-user localStorage keys (db.js stores them as `${prefix}__${uid}`) that sync to users/{uid}.progress
const SYNC_PREFIXES = ["cafespot_visited_cafes", "cafespot_visit_dates", "cafespot_saved_cafes", "cafespot_activity", "cafespot_badges"];

let current = null;   // the signed-in user, in the shape app.js expects
let busy = false;     // true while loginUser/registerUser run (they load data themselves)

function toPublicUser(fbUser, profile = {}) {
    return {
        id: fbUser.uid,
        name: profile.name || fbUser.displayName || fbUser.email.split("@")[0],
        email: fbUser.email,
        handle: profile.handle || "",
        role: "user",
        createdAt: fbUser.metadata?.creationTime ? new Date(fbUser.metadata.creationTime).toISOString() : null,
        emailVerified: fbUser.emailVerified,
        recoveryAcknowledged: true, // no recovery keys with email reset links
        hasRecoveryKey: false
    };
}

/** Firebase error codes → the same friendly messages local mode shows. */
function friendly(err) {
    const messages = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/wrong-password": "Incorrect email or password.",
        "auth/user-not-found": "Incorrect email or password.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/email-already-in-use": "An account with this email already exists. Try logging in, or use “Forgot password?”.",
        "auth/weak-password": "Choose a stronger password.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
        "auth/network-request-failed": "No connection. Check your internet and try again.",
        "auth/user-disabled": "This account has been turned off. Contact CafeSpot."
    };
    return new Error(messages[err?.code] || err?.message || "Something went wrong. Please try again.");
}

async function applyPersistence(remember) {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    try { localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch { /* storage blocked */ }
}

/* ---------- Cloud ⇄ device sync for stamps, saves, history, badges ---------- */
async function pullProgress(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : {};
    const progress = data.progress || {};
    SYNC_PREFIXES.forEach((prefix) => {
        if (progress[prefix] !== undefined) cacheWrite(`${prefix}__${uid}`, progress[prefix]);
    });
    return data;
}

let pushTimer = null;
const pending = {};
function onLocalWrite(key, value) {
    if (!current) return;
    const [prefix, uid] = key.split("__");
    if (uid !== current.id || !SYNC_PREFIXES.includes(prefix)) return;
    pending[prefix] = value;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {          // one write per burst of changes
        const batch = { ...pending };
        Object.keys(pending).forEach((k) => delete pending[k]);
        try {
            await setDoc(doc(db, "users", current.id), { progress: batch, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn("[firebase] sync failed; will retry with the next change", e);
            const newer = { ...pending };            // keep changes made while this write was failing
            Object.assign(pending, batch, newer);
        }
    }, 1000);
}

/* ---------- The functions db.js delegates to ---------- */
async function registerUser({ name, email, handle, password, remember = true, merge }) {
    busy = true;
    try {
        await applyPersistence(remember);
        const handleKey = "@" + handle.trim().replace(/^@/, "").toLowerCase();
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;
        try {
            // Claim the handle and create the profile in one transaction (handles must be unique).
            await runTransaction(db, async (tx) => {
                const handleRef = doc(db, "handles", handleKey.slice(1));
                if ((await tx.get(handleRef)).exists()) throw new Error("That handle is taken.");
                tx.set(handleRef, { uid });
                tx.set(doc(db, "users", uid), { name: name.trim(), handle: handleKey, createdAt: serverTimestamp(), progress: {} });
            });
        } catch (e) {
            await cred.user.delete(); // don't leave a half-made account behind
            throw e;
        }
        await updateProfile(cred.user, { displayName: name.trim() });
        sendEmailVerification(cred.user).catch(() => { /* optional */ });
        current = toPublicUser(cred.user, { name: name.trim(), handle: handleKey });
        const merged = merge(uid); // guest stamps on this device → the new account (pushed by onLocalWrite)
        return { user: current, recoveryKey: null, merged };
    } catch (e) {
        throw e.code ? friendly(e) : e;
    } finally {
        busy = false;
    }
}

async function loginUser(identifier, password, { remember = true, merge } = {}) {
    const email = String(identifier).trim();
    if (!email.includes("@")) throw new Error("Log in with the email address on your account.");
    busy = true;
    try {
        await applyPersistence(remember);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const profile = await pullProgress(cred.user.uid); // cloud data first…
        current = toPublicUser(cred.user, profile);
        const merged = merge(cred.user.uid);               // …then add any guest stamps
        return { user: current, merged };
    } catch (e) {
        throw friendly(e);
    } finally {
        busy = false;
    }
}

/** With email-enumeration protection (on by default for new projects) this succeeds even for unknown emails. */
async function sendPasswordResetLink(email) {
    await sendPasswordResetEmail(auth, String(email).trim(), { url: `${location.origin}${location.pathname}#/` });
}

function logoutUser() {
    current = null;
    signOut(auth).catch((e) => console.warn("[firebase] sign-out failed", e));
}

function getCurrentUser() {
    return current;
}

function getSessionInfo() {
    if (!current) return null;
    let remember = true;
    try { remember = localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { /* storage blocked */ }
    return { remember, createdAt: null, expiresAt: null }; // Firebase refreshes tokens; no fixed expiry
}

/* Restores the session on every page load (and reacts to sign-out in other tabs). */
onAuthStateChanged(auth, async (fbUser) => {
    if (busy) return;
    if (!fbUser) {
        current = null;
    } else {
        try { current = toPublicUser(fbUser, await pullProgress(fbUser.uid)); }
        catch (e) { console.warn("[firebase] couldn't load progress", e); current = toPublicUser(fbUser); }
    }
    notifyAuthChange();
});

useAuthProvider({
    mode: { provider: "firebase", recovery: "email-link" },
    registerUser, loginUser, logoutUser, sendPasswordResetLink, getCurrentUser, getSessionInfo, onLocalWrite
});