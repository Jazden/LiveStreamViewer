# Product Review: LiveStreamViewer

This document tracks all identified performance, architectural, and design issues. You can use the checkboxes to track progress and add notes for each item as we address them.

---

## High Severity Issues

### [ ] Twitch Player Memory & Audio Leak
- **Category**: Performance / Quality (Bug Tester)
- **Description**: Deactivating streams or shifting layout grids fails to properly destroy/clean up existing Twitch player instances. As a result, iframe processes remain active, stream audio continues playing invisibly in the background, and browser memory leaks accumulate over time.
- **Proposed Solution**: Maintain a registry of active Twitch SDK player instances and call `.destroy()` or clear the target element's content cleanly whenever a layout shifts or a stream is closed.
- **Notes**: 

### [ ] Redundant & Heavy Player Re-initialization
- **Category**: Performance (Bug Tester)
- **Description**: Every layout modification or channel toggle triggers a full teardown and rebuild of every iframe player from scratch. This creates high CPU/GPU spikes, increases bandwidth waste, and causes irritating player loading/buffering delays.
- **Proposed Solution**: Reuse existing iframe containers and player objects where possible, adjusting CSS properties (e.g., width, height, visibility) instead of reconstructing DOM subtrees.
- **Notes**: 

### [ ] Monolithic File Bloat (`app.js`)
- **Category**: Architecture (Project Architect)
- **Description**: `app.js` is a single file containing over 4,600 lines of code. It mixes player instance state, event dispatching, DOM updates, network request handlers, and layout settings in one namespace. This makes debugging, modifying, and testing code highly error-prone.
- **Proposed Solution**: Split the script into logical ES Modules (e.g., `stateManager.js`, `playerManager.js`, `uiController.js`, `apiClient.js`) and load them natively or bundle them.
- **Notes**: 

---

## Medium Severity Issues

### [ ] Keystroke-Rate Network Storms
- **Category**: Performance (Bug Tester)
- **Description**: Typing rapidly in the channel search filters triggers simultaneous HTTP HEAD/GET validation requests to verify the status of streams on every keystroke, resulting in network congestion.
- **Proposed Solution**: Introduce a debounce mechanism (e.g., 300ms delay) on the search input listener before executing status checks.
- **Notes**: 

### [ ] Multi-Role Code Duplication & HTML Bloat (`index.html`)
- **Category**: Architecture (Project Architect)
- **Description**: The desktop view dashboard and the mobile remote share a single HTML document. Because of this, mobile devices are forced to parse massive blocks of desktop-only markup and load heavy scripts.
- **Proposed Solution**: Refactor and extract the mobile-specific controller interface into its own clean page under the `/mobile/` path.
- **Notes**: 

### [ ] Global Scope Pollution
- **Category**: Architecture (Project Architect)
- **Description**: The app relies heavily on global state variables (e.g., `appState`, `activePlayers`) and exposes methods globally on the `window` object. This creates namespace collision hazards and makes automated testing impossible.
- **Proposed Solution**: Wrap variables in modules or a class-based state store exposing state change observers (Pub/Sub pattern).
- **Notes**: 

---

## Low Severity Issues

### [ ] Grid Responsiveness on Medium Viewports
- **Category**: Design / UI (UI/UX Expert)
- **Description**: Multi-stream grid layouts (3x3, 4x4) scale down rigidly when viewed on tablet or medium screen dimensions, leading to overflow or unreadable text elements.
- **Proposed Solution**: Add responsive CSS Grid breakpoints in `style.css` using media queries to transition to fewer columns when viewport size shrinks.
- **Notes**: 

### [ ] Lack of Semantic HTML Elements & Accessibility Tags
- **Category**: Design / UX (UI/UX Expert)
- **Description**: Dropdown menus use plain `<span>` elements instead of `<label>`, and modal popups lack `aria-label` tags, causing poor screen reader compatibility.
- **Proposed Solution**: Replace interactive span headers with true label elements and assign descriptive aria properties.
- **Notes**: 

### [ ] Hardcoded Colors & Inline Styles
- **Category**: Design / UI (UI/UX Expert)
- **Description**: Color schemes are hardcoded inline inside `index.html` and in various CSS declarations, making uniform color changes or theme support difficult to manage.
- **Proposed Solution**: Extract inline styling to `style.css` and use CSS Custom Properties (`--primary-color`, `--bg-color`) inside the `:root` pseudo-class.
- **Notes**: 

### [ ] Leaked Timer Intervals
- **Category**: Performance (Bug Tester)
- **Description**: Several polling timers waiting for YouTube/Twitch players to load are not cancelled if the host container is closed or removed midway.
- **Proposed Solution**: Keep track of all timer IDs and call `clearInterval` or `clearTimeout` in a unified cleanup function.
- **Notes**: 

### [ ] Redundant Code Duplication
- **Category**: Clean Code (Bug Tester)
- **Description**: The helper utility `getYoutubeId` is defined twice within `app.js`.
- **Proposed Solution**: Delete the duplicate declaration.
- **Notes**: 

---

## Security Findings (MQTT & Data Sanitization)

### [x] Public MQTT Broker with No Authentication
- **Category**: Security — MQTT (Critical)
- **Severity**: Critical
- **File**: [app.js L3133](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3133)
- **Description**: The app connects to `wss://broker.emqx.io:8084/mqtt`, a **free public MQTT broker**, with no username, password, or token-based authentication. Any person on the internet can connect to this same broker, subscribe to the same topics, and both **eavesdrop on all commands/state syncs** and **inject arbitrary commands** that the TV receiver will execute blindly.
- **Proposed Solution**: Either (a) deploy a private MQTT broker (e.g., self-hosted Mosquitto or a managed cloud broker) with TLS + username/password or client-certificate authentication, or (b) implement a shared-secret HMAC signature on every published message payload and validate it on the receiving side before executing any command.
- **Notes**: 

### [x] Weak/Predictable MQTT Topic Derivation
- **Category**: Security — MQTT (High)
- **Severity**: High
- **File**: [app.js L3136-L3144](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3136-L3144)
- **Description**: `getMqttTopic()` derives the MQTT topic from the 6-digit pairing code using a simple DJB2-style hash with a hardcoded salt (`"ls_salt_"`). Since pairing codes are only 6 digits (000000–999999 = 1 million possibilities), the entire topic space can be enumerated trivially. An attacker can precompute all possible topics and subscribe to all of them, or brute-force a specific TV's topic in seconds.
- **Proposed Solution**: Replace the 6-digit numeric code with a cryptographically random token of at least 128 bits (e.g., `crypto.getRandomValues()` generating a 32-character hex string). Use this token directly as the topic suffix instead of hashing it, or use a proper HMAC-SHA256 derivation.
- **Notes**: 

### [x] No Message Authentication — Remote Commands Executed Without Verification
- **Category**: Security — MQTT (High)
- **Severity**: High
- **File**: [app.js L3180-L3205](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3180-L3205), [app.js L3282-L3407](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3282-L3407)
- **Description**: `handleRemoteCommand()` blindly trusts any JSON message arriving on the subscribed topic. It checks only `data.from === 'remote'` — a field any attacker can set. There is **no HMAC, no nonce, no session token** to verify the message actually came from a legitimately paired remote. An attacker who knows (or guesses) the topic can send any command: `addStream`, `refreshAll`, `loadPreset`, `deletePreset`, etc.
- **Proposed Solution**: Implement a shared secret (exchanged during pairing via QR code). Sign each MQTT payload with HMAC-SHA256 using the shared secret and include the signature + a monotonic nonce in the message. On the receiver side, verify the signature and reject replayed nonces.
- **Notes**: 

### [ ] `addStream` via MQTT Accepts Unsanitized URL Data
- **Category**: Security — Data Sanitization (High)
- **Severity**: High
- **File**: [app.js L3347-L3365](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3347-L3365)
- **Description**: The `addStream` remote command takes `s.name`, `s.url`, `s.type`, and `s.category` directly from the MQTT message payload and pushes them into `appState.streams` with **no validation or sanitization at the point of ingestion**. While `escapeHtml()` is applied later during rendering, the raw URL is stored and eventually fed into iframe `src` attributes and `<source>` tags. A crafted URL (e.g., a `javascript:` URI variant that bypasses the simple regex in `sanitizeUrl`, or a malicious HLS endpoint) could be injected by anyone who can publish to the topic.
- **Proposed Solution**: Validate and sanitize all MQTT-received stream data at the point of ingestion in `handleRemoteCommand()`. Specifically: (1) enforce URL allowlists or strict protocol validation (only `https://`), (2) validate `type` against known enum values (`hls`, `youtube`, `twitch`, `weather`, `notes`), (3) limit `name`/`category` string lengths, and (4) run `sanitizeUrl()` on the URL before storing it.
- **Notes**: 

### [ ] `sanitizeUrl()` Is Insufficient — Only Blocks `javascript:` and `data:`
- **Category**: Security — Data Sanitization (Medium)
- **Severity**: Medium
- **File**: [app.js L64-L71](file:///home/jazden/Projects/LiveStreamViewer/app.js#L64-L71)
- **Description**: `sanitizeUrl()` only rejects URLs starting with `javascript:` or `data:`. This can be bypassed with whitespace tricks (e.g., `\tjavascript:...`), Unicode direction overrides, or other protocol schemes (e.g., `vbscript:`, `blob:`). Additionally, it does not enforce HTTPS-only, meaning an attacker could inject `http://` URLs that load mixed content or redirect to malicious sites.
- **Proposed Solution**: Use a URL allowlist approach: parse the URL with the `URL` constructor, verify `protocol` is `https:` (or `http:` if explicitly needed), and reject everything else. Consider using a battle-tested library like DOMPurify for URL sanitization.
- **Notes**: 

### [x] Remote-Triggered `location.reload()` — Denial of Service
- **Category**: Security — MQTT (Medium)
- **Severity**: Medium
- **File**: [app.js L3328-L3329](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3328-L3329)
- **Description**: The `refreshAll` remote command calls `location.reload()` unconditionally. Since MQTT messages are unauthenticated, an attacker can send rapid `refreshAll` commands to force the TV into an infinite reload loop, effectively a denial-of-service on the display.
- **Proposed Solution**: Rate-limit the `refreshAll` action (e.g., once per 30 seconds), require explicit user confirmation for reload commands, or remove it entirely from the remote command set and only allow it locally.
- **Notes**: 

### [ ] Pairing Code Stored in Long-Lived Cookie (365 days)
- **Category**: Security — MQTT (Low)
- **Severity**: Low
- **File**: [app.js L3154](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3154)
- **Description**: The pairing code is stored in a cookie with a 365-day expiry. Given that this code acts as the sole authentication factor for remote control access, its long lifetime increases the window for interception or reuse. The cookie is set with `SameSite=Lax` and conditionally `Secure`, but there is no `HttpOnly` flag (not applicable for JS-read cookies, but the long lifetime is still a concern).
- **Proposed Solution**: Reduce cookie lifetime to session-only or a short period (e.g., 7 days). Consider prompting users to regenerate codes periodically. Store the code in `sessionStorage` if cross-session persistence is not required.
- **Notes**: 

### [ ] Inline `onclick` Handlers with String-Interpolated Data
- **Category**: Security — Data Sanitization (Low)
- **Severity**: Low
- **File**: [app.js L1074-L1131](file:///home/jazden/Projects/LiveStreamViewer/app.js#L1074-L1131), [app.js L2799](file:///home/jazden/Projects/LiveStreamViewer/app.js#L2799), [app.js L3957-L3964](file:///home/jazden/Projects/LiveStreamViewer/app.js#L3957-L3964)
- **Description**: Many interactive elements use inline `onclick="functionName('${escapedValue}')"` patterns where data values are interpolated into HTML attribute strings. While `escapeHtml()` and `escapeJsString()` are applied, this pattern is inherently fragile — any gap in escaping creates an XSS vector. The current `escapeJsString()` does not handle backticks, newlines, or other special characters.
- **Proposed Solution**: Replace inline `onclick` handlers with `addEventListener()` calls that use closures to pass data, eliminating the need for string escaping entirely. For example: `btn.addEventListener('click', () => functionName(dataValue))`.
- **Notes**: 
