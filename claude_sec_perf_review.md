# LiveStreamViewer — Security & Performance Audit

Full codebase review completed 2026-09-03. Findings are cross-referenced against [`product_review.md`](file:///home/jazden/Projects/LiveStreamViewer/product_review.md) — only **new or unresolved** issues are listed.

---

## Security Findings

### 🔴 S1. `sanitizeUrl()` Is Trivially Bypassable
- **Severity**: High
- **File**: [app.js L76-83](file:///home/jazden/Projects/LiveStreamViewer/app.js#L76-L83)
- **Description**: The current sanitizer only blocks URLs starting with `javascript:` or `data:` via a simple regex. This is bypassable with leading whitespace/tabs (`\tjavascript:...`), Unicode direction overrides, or alternative schemes (`vbscript:`, `blob:`). It also doesn't enforce HTTPS.
- **Fix**: Parse with the `URL` constructor and allowlist protocols:
```javascript
function sanitizeUrl(url) {
    if (typeof url !== 'string') return '';
    try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'about:blank';
        }
        return parsed.href;
    } catch {
        // Relative URLs or special types like "weather", "notes"
        if (/^(javascript|data|vbscript|blob):/i.test(url.trim())) {
            return 'about:blank';
        }
        return url.trim();
    }
}
```

---

### 🔴 S2. `addStream` via MQTT Accepts Unsanitized Payloads
- **Severity**: High
- **File**: [app.js L4045-4063](file:///home/jazden/Projects/LiveStreamViewer/app.js#L4045-L4063)
- **Description**: The `addStream` remote command takes `s.name`, `s.url`, `s.type`, and `s.category` directly from the MQTT payload and pushes them into `appState.streams` with **no validation**. A crafted URL could be injected by anyone publishing to the topic. The `type` field is also unchecked — an invalid type won't crash but could cause unexpected behavior.
- **Fix**: Validate at the point of ingestion inside `handleRemoteCommand`:
```javascript
case 'addStream':
    if (msg.data && msg.data.stream) {
        const s = msg.data.stream;
        const VALID_TYPES = ['hls', 'youtube', 'twitch', 'iframe', 'weather', 'notes'];
        if (!VALID_TYPES.includes(s.type)) break;
        if (typeof s.name !== 'string' || s.name.length > 200) break;
        if (typeof s.url !== 'string') break;
        const safeUrl = sanitizeUrl(s.url);
        if (safeUrl === 'about:blank') break;
        // ... create newStream with safeUrl
    }
    break;
```

---

### 🟡 S3. State Stored in Cookies — Sent with Every HTTP Request
- **Severity**: Medium
- **File**: [app.js L125-157](file:///home/jazden/Projects/LiveStreamViewer/app.js#L125-L157)
- **Description**: `persistState()` writes `user_streams`, `active_stream_ids`, `stream_order`, `location_config`, and `rotator_config` as cookies with 365-day expiry. Cookies are automatically attached to **every HTTP request** to the domain (including all CDN fetches for Video.js, MQTT library, fonts, etc.), bloating request headers with kilobytes of serialized JSON that the server never reads. This is both a **privacy leak** (stream URLs/names sent to every CDN) and a **performance issue**.
- **Fix**: Migrate all app state from cookies to `localStorage`. Cookies should only be used for `pairing_code` and `pairing_hmac_secret` if cross-path access is needed.

---

### 🟡 S4. No `sandbox` Attribute on User-Controlled Iframes
- **Severity**: Medium
- **File**: [app.js L1437-1444](file:///home/jazden/Projects/LiveStreamViewer/app.js#L1437-L1444)
- **Description**: When creating iframe embeds, no `sandbox` attribute is set. The iframe URL comes from user input (or MQTT remote commands), meaning an attacker-controlled URL gets full access to run scripts, submit forms, open popups, and navigate the top frame.
- **Fix**: For general iframes, add a restrictive sandbox. For trusted report domains, use a permissive one:
```javascript
iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
```

> [!NOTE]
> Some Power BI / Looker embeds require `allow-same-origin`. Test your specific report iframes to find the minimal sandbox that works.

---

### 🟡 S5. `escapeJsString()` Missing Backtick and Newline Escaping
- **Severity**: Medium
- **File**: [app.js L85-89](file:///home/jazden/Projects/LiveStreamViewer/app.js#L85-L89)
- **Description**: `escapeJsString()` escapes `\`, `'`, and `"` but not backticks (`` ` ``), newlines (`\n`, `\r`), or null bytes. If any inline `onclick` handler uses template literals or if a stream name contains newlines, this creates an injection vector.
- **Fix**: Extend the function:
```javascript
function escapeJsString(str) {
    if (str == null) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\0/g, '\\0');
}
```

---

### 🟢 S6. No Subresource Integrity (SRI) on CDN Scripts
- **Severity**: Low
- **File**: [index.html L8, L485, L490-491](file:///home/jazden/Projects/LiveStreamViewer/index.html#L485-L491)
- **Description**: Video.js, MQTT.js, and QRious are loaded from public CDNs without `integrity` attributes. If the CDN is compromised or serves a modified file, arbitrary JavaScript executes in your page context.
- **Fix**: Add `integrity` and `crossorigin` attributes:
```html
<script src="https://vjs.zencdn.net/8.10.0/video.js"
        integrity="sha384-<hash>"
        crossorigin="anonymous"></script>
```

---

### 🟢 S7. Pairing Code Stored in 365-Day Cookie
- **Severity**: Low
- **File**: [app.js L3823-3824](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3823-L3824)
- **Description**: The 6-digit pairing code and HMAC secret persist for a full year. Since they act as the sole authentication factor for remote control, the long lifetime increases the risk of interception or reuse.
- **Fix**: Reduce cookie lifetime to 30 days or session-only. Add a "Regenerate Code" button in the pairing modal.

---

## Performance Findings

### 🔴 P1. Cookie-Based State Bloats All HTTP Requests
- **Impact**: High
- **File**: [app.js L125-157](file:///home/jazden/Projects/LiveStreamViewer/app.js#L125-L157)
- **Description**: Same as S3 above. Every `persistState()` call writes multiple large JSON cookies. With 20+ streams, the `user_streams` cookie alone can exceed 4KB — the typical cookie size limit — and is sent with every HTTP request.
- **Fix**: Migrate to `localStorage` (see S3).

---

### 🔴 P2. Unbatched Network Storm on Directory Verification
- **Impact**: High
- **File**: [app.js L3023-3041](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3023-L3041)
- **Description**: `verifyPublicDirectoryStreams()` fires `fetch` for **every** public directory stream simultaneously via `Promise.allSettled(promises)`. With 20+ streams, this triggers 20+ concurrent HTTP requests at page load, potentially hitting browser concurrency limits (6 per domain) and causing request queuing.
- **Fix**: Batch requests (e.g., 4 at a time) or defer verification until the browser panel is actually opened:
```javascript
async function verifyPublicDirectoryStreams() {
    const BATCH_SIZE = 4;
    for (let i = 0; i < PUBLIC_STREAM_DIRECTORY.length; i += BATCH_SIZE) {
        const batch = PUBLIC_STREAM_DIRECTORY.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(checkDirectoryStreamUsability));
    }
}
```

---

### 🟡 P3. Overwriteable Player Polling Timers
- **Impact**: Medium
- **File**: [app.js L1394, L1423](file:///home/jazden/Projects/LiveStreamViewer/app.js#L1394-L1435)
- **Description**: YouTube and Twitch player initialization uses `setInterval` to poll for SDK readiness, stored in `pendingPlayerTimers[stream.id]`. If `initializePlayer` is called again for the same stream before the SDK loads, the old interval reference is overwritten and leaked — it continues running in the background indefinitely.
- **Fix**: Clear any existing timer before creating a new one:
```javascript
if (pendingPlayerTimers[stream.id]) {
    clearInterval(pendingPlayerTimers[stream.id]);
    delete pendingPlayerTimers[stream.id];
}
const interval = setInterval(() => { ... }, 100);
pendingPlayerTimers[stream.id] = interval;
```

---

### 🟡 P4. Layout Thrashing in List Rendering Loops
- **Impact**: Medium
- **File**: [app.js L2013-2068](file:///home/jazden/Projects/LiveStreamViewer/app.js#L2013-L2068) (`populateSettings`), [app.js L3242-3295](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3242-L3295) (`renderPublicStreams`)
- **Description**: Settings table and public stream browser rebuild the DOM by appending elements inside `forEach` loops. Each `appendChild` triggers a style recalculation and potential reflow.
- **Fix**: Build elements into a `DocumentFragment` first, then append once:
```javascript
const fragment = document.createDocumentFragment();
appState.streams.forEach(s => {
    const tr = document.createElement('tr');
    // ... build row
    fragment.appendChild(tr);
});
tbody.appendChild(fragment);
```

---

### 🟡 P5. `transition: all` Forces Unnecessary Repaints
- **Impact**: Medium
- **File**: [style.css L177, L231, L379, L565, L589](file:///home/jazden/Projects/LiveStreamViewer/style.css#L177) (widespread, ~15 occurrences)
- **Description**: Many elements use `transition: all 0.25s` or similar. This instructs the browser to watch **every** CSS property for changes, including layout-triggering ones like `width`, `height`, `top`, `left`. When any property changes, the browser must check all of them, potentially triggering expensive composite layer invalidations.
- **Fix**: Target only the properties you actually animate:
```css
/* Before */
transition: all 0.25s ease;
/* After */
transition: background-color 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
```

---

### 🟢 P6. Video.js Loaded Unconditionally (700KB+)
- **Impact**: Low
- **File**: [index.html L8, L485](file:///home/jazden/Projects/LiveStreamViewer/index.html#L485)
- **Description**: Video.js CSS and JS (~700KB combined) are loaded for every page visit, even if the user has no HLS streams active. YouTube and Twitch SDKs are already loaded on-demand.
- **Fix**: Dynamically inject the Video.js `<script>` and `<link>` tags inside `initializePlayer` when the first HLS stream is initialized, matching the existing pattern for YouTube/Twitch SDKs.

---

## Summary Matrix

| ID | Category | Severity | Status | Quick Fix? |
|----|----------|----------|--------|------------|
| S1 | Security — URL Sanitization | 🔴 High | Open | ✅ Yes |
| S2 | Security — MQTT Input Validation | 🔴 High | Open | ✅ Yes |
| S3 | Security — Cookie Privacy Leak | 🟡 Medium | Open | ✅ Yes |
| S4 | Security — Iframe Sandboxing | 🟡 Medium | Open | ✅ Yes |
| S5 | Security — JS String Escaping | 🟡 Medium | Open | ✅ Yes |
| S6 | Security — CDN Integrity | 🟢 Low | Open | ✅ Yes |
| S7 | Security — Pairing Cookie Lifetime | 🟢 Low | Open | ✅ Yes |
| P1 | Perf — Cookie Request Bloat | 🔴 High | Open | ✅ Yes |
| P2 | Perf — Network Storm | 🔴 High | Open | ✅ Yes |
| P3 | Perf — Timer Leaks | 🟡 Medium | Open | ✅ Yes |
| P4 | Perf — Layout Thrashing | 🟡 Medium | Open | ✅ Yes |
| P5 | Perf — CSS Transitions | 🟡 Medium | Open | ✅ Yes |
| P6 | Perf — Unconditional Video.js | 🟢 Low | Open | ✅ Yes |

> [!TIP]
> **Highest-impact quick wins**: S1 + S2 (sanitization hardening), S3/P1 (cookie → localStorage migration), and P2 (batched verification) would collectively improve both security posture and page load performance significantly.
