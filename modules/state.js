// Capacity configuration for each layout
export const LAYOUT_CAPACITIES = {
    'cinema': 1,
    'grid-2x2': 4,
    'grid-2x3': 6,
    'grid-2x4': 8,
    'grid-3x3': 9,
    'grid-4x4': 16,
    'layout-1-5': 6,
    'layout-2-3': 5
};

// Custom control SVG definitions
export const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
export const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;
export const MUTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;
export const VOLUME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
export const FULLSCREEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
export const POPOUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
export const SNAPSHOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;

// App state
export let appState = {
    location: "Galveston",
    timezone: "America/Chicago",
    layout: "cinema",
    streams: [],
    rotatorMode: "streams",
    rotatorInterval: 30
};

// Active Player instances references and state bindings
export let streamUptimeStatuses = {};
export let activePlayers = {};
export let tvSyncMasterCode = '';
export let tvSyncMasterSecret = '';
export let tvOriginalStateBackup = null;
export let lastSyncedMasterJson = '';
export let activeWeatherAnimations = {};
export let cinemaActiveStreamId = null;
export let cycleInterval = null;
export let dragSourceId = null;
export let youtubeAPIReady = false;

// Setters for primitive variables (to allow updates across ES modules)
export function setTvSyncMasterCode(val) { tvSyncMasterCode = val; }
export function setTvSyncMasterSecret(val) { tvSyncMasterSecret = val; }
export function setTvOriginalStateBackup(val) { tvOriginalStateBackup = val; }
export function setLastSyncedMasterJson(val) { lastSyncedMasterJson = val; }
export function setCinemaActiveStreamId(val) { cinemaActiveStreamId = val; }
export function setCycleInterval(val) { cycleInterval = val; }
export function setDragSourceId(val) { dragSourceId = val; }
export function setYoutubeAPIReady(val) { youtubeAPIReady = val; }

// XSS Protection Utility Helpers
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    return str.replace(/[&<>"']/g, function(m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    });
}

export function sanitizeUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^(javascript|data):/i.test(trimmed)) {
        return 'about:blank';
    }
    return trimmed;
}

export function escapeJsString(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Cookie Helpers
export function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    let cookieString = name + "=" + (encodeURIComponent(value) || "") + expires + "; path=/; SameSite=Lax";
    if (window.location.protocol === 'https:') {
        cookieString += "; Secure";
    }
    document.cookie = cookieString;
}

export function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

export function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}
