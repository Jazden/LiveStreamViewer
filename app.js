        // Capacity configuration for each layout
        const LAYOUT_CAPACITIES = {
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
        const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
        const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>`;
        const MUTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;
        const VOLUME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        const FULLSCREEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
        const POPOUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
        const SNAPSHOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;

        // App state
        let appState = {
            location: "Galveston",
            timezone: "America/Chicago",
            layout: "cinema",
            streams: [],
            rotatorMode: "streams",
            rotatorInterval: 30,
            keepStreamsAlive: false
        };

        // Active Player instances reference
        let streamUptimeStatuses = {};

        // Active Player instances reference
        let activePlayers = {};
        let tvSyncMasterCode = '';
        let tvSyncMasterSecret = '';
        let tvOriginalStateBackup = null;
        let lastSyncedMasterJson = '';
        let activeWeatherAnimations = {};
        let cinemaActiveStreamId = null;
        let cycleInterval = null;
        let dragSourceId = null;
        let pendingPlayerTimers = {};

        // Utility: Debounce function calls to prevent rapid repeated executions
        function debounce(func, wait = 250) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        // Dynamic API script loading triggers
        let youtubeAPIReady = false;

        // XSS Protection Utility Helpers
        function escapeHtml(str) {
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

        function sanitizeUrl(url, type) {
            if (typeof url !== 'string') return 'about:blank';
            const trimmed = url.trim();
            if (!trimmed) return 'about:blank';

            // Internal tokens
            if (trimmed === 'weather' || trimmed === 'notes') {
                return trimmed;
            }

            // Simple Twitch channel names (alphanumeric + underscore, 2-35 chars)
            if (type === 'twitch' && /^[a-zA-Z0-9_]{2,35}$/.test(trimmed)) {
                return trimmed;
            }

            // Strip whitespace, control characters, and null bytes for scheme checking
            const stripped = trimmed.replace(/[\x00-\x1F\x7F-\x9F\s]/g, '').toLowerCase();
            if (/^(javascript|data|vbscript|blob|file):/i.test(stripped)) {
                return 'about:blank';
            }

            try {
                const parsed = new URL(trimmed);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    return parsed.href;
                }
                return 'about:blank';
            } catch (e) {
                return 'about:blank';
            }
        }

        function escapeJsString(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/`/g, '\\`')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\0/g, '\\0');
        }

        // Storage Helpers (LocalStorage with transparent legacy Cookie migration)
        function setCookie(name, value, days) {
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

        function getCookie(name) {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
            return null;
        }

        function deleteCookie(name) {
            document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax";
        }

        function getStoredItem(key) {
            try {
                const val = localStorage.getItem(key);
                if (val !== null) return val;
            } catch (e) {
                console.warn('localStorage read error for ' + key, e);
            }
            // Fallback: check if legacy cookie exists and migrate it
            const legacyCookie = getCookie(key);
            if (legacyCookie !== null && legacyCookie !== '') {
                try {
                    localStorage.setItem(key, legacyCookie);
                    deleteCookie(key); // Purge legacy cookie to free up HTTP request header space
                } catch (e) {}
                return legacyCookie;
            }
            return null;
        }

        function setStoredItem(key, value) {
            try {
                localStorage.setItem(key, value);
                // Ensure legacy cookie is purged so it doesn't linger in HTTP request headers
                if (getCookie(key) !== null) {
                    deleteCookie(key);
                }
            } catch (e) {
                console.error('localStorage write error for ' + key, e);
                // Fallback to cookie if localStorage quota exceeded or private mode blocks it
                setCookie(key, value, 30);
            }
        }

        function removeStoredItem(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {}
            deleteCookie(key);
        }

        function persistState() {
            if (typeof tvSyncMasterCode !== 'undefined' && tvSyncMasterCode) {
                // In sync mode, do not write the master TV's configurations into our persistent storage!
                if (window.sendMqttSync) {
                    window.sendMqttSync();
                }
                return;
            }
            setStoredItem('stream_layout', appState.layout);
            
            // Save user-configured streams (isDefault === false)
            const userStreams = appState.streams.filter(s => !s.isDefault).map(s => ({
                id: s.id,
                name: s.name,
                url: s.url,
                type: s.type,
                category: s.category || 'General',
                active: s.active
            }));
            setStoredItem('user_streams', JSON.stringify(userStreams));
            
            // Save active stream IDs (both default and custom)
            const activeIds = appState.streams.filter(s => s.active).map(s => s.id);
            setStoredItem('active_stream_ids', JSON.stringify(activeIds));
            
            // Save stream order
            const orderIds = appState.streams.map(s => s.id);
            setStoredItem('stream_order', JSON.stringify(orderIds));
            
            // Save location configuration
            setStoredItem('location_config', JSON.stringify({
                location: appState.location,
                timezone: appState.timezone
            }));
            
            // Save rotator configuration
            setStoredItem('rotator_config', JSON.stringify({
                mode: appState.rotatorMode,
                interval: appState.rotatorInterval,
                keepAlive: appState.keepStreamsAlive
            }));

            if (window.sendMqttSync) {
                window.sendMqttSync();
            }
        }

        // Initialize App
        function initApp() {
            // Check query parameters to route to TV view or Mobile Remote view
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            const pairCode = urlParams.get('pair');
            
            if (view === 'mobile' || (!view && pairCode)) {
                // Route seamlessly to dedicated mobile remote application
                const search = window.location.search;
                const hash = window.location.hash;
                window.location.replace('./mobile/' + search + hash);
                return;
            }

            // Load layout
            const savedLayout = getStoredItem('stream_layout');
            if (savedLayout) appState.layout = savedLayout;
            
            // Load rotator configuration
            const savedRotator = getStoredItem('rotator_config');
            if (savedRotator) {
                try {
                    const rot = JSON.parse(savedRotator);
                    appState.rotatorMode = rot.mode || 'streams';
                    appState.rotatorInterval = rot.interval || 30;
                    appState.keepStreamsAlive = !!rot.keepAlive;
                } catch (e) {}
            }
            
            // Load user configured streams
            let userStreams = [];
            const savedUserStreams = getStoredItem('user_streams');
            if (savedUserStreams) {
                try {
                    userStreams = JSON.parse(savedUserStreams);
                } catch (e) {
                    console.error('Error parsing user streams storage', e);
                }
            }
            
            // Build streams list
            let streams = defaultChannels.map((c, idx) => ({
                id: 'default-' + idx,
                name: c.name,
                url: c.url,
                type: c.type || 'hls',
                category: c.category || 'General',
                active: c.active !== undefined ? c.active : true,
                isDefault: true
            }));
            
            userStreams.forEach(us => {
                streams.push({
                    id: us.id,
                    name: us.name,
                    url: us.url,
                    type: us.type,
                    category: us.category || 'General',
                    active: us.active !== undefined ? us.active : true,
                    isDefault: false
                });
            });
            
            // Load active/visible IDs
            const savedActiveIds = getStoredItem('active_stream_ids');
            if (savedActiveIds) {
                try {
                    const activeIds = JSON.parse(savedActiveIds);
                    streams.forEach(s => {
                        s.active = activeIds.includes(s.id);
                    });
                } catch (e) {
                    console.error('Error parsing active stream IDs storage', e);
                }
            }

            // Load and sort by stream order index
            const savedOrder = getStoredItem('stream_order');
            if (savedOrder) {
                try {
                    const orderIds = JSON.parse(savedOrder);
                    streams.sort((a, b) => {
                        let idxA = orderIds.indexOf(a.id);
                        let idxB = orderIds.indexOf(b.id);
                        if (idxA === -1) idxA = 9999;
                        if (idxB === -1) idxB = 9999;
                        return idxA - idxB;
                    });
                } catch (e) {
                    console.error('Error parsing stream order storage', e);
                }
            }
            
            appState.streams = streams;
            
            // Setup API script tags
            loadThirdPartyAPIs();
            
            // Select layout and render streams
            document.getElementById('layout-select-dropdown').value = appState.layout;
            renderActiveStreams();
            populateSettings();
            
            // Populate presets list in the header dropdown
            updatePresetDropdown();

            // Initialize Sidebar state and contents
            const sidebarCollapsed = getStoredItem('sidebar_collapsed');
            const sidebar = document.getElementById('streams-sidebar');
            const sidebarBtn = document.getElementById('btn-toggle-sidebar');
            if (sidebar) {
                if (sidebarCollapsed === '1') {
                    sidebar.classList.add('collapsed');
                    if (sidebarBtn) sidebarBtn.classList.remove('active');
                } else {
                    sidebar.classList.remove('collapsed');
                    if (sidebarBtn) sidebarBtn.classList.add('active');
                }
            }
            // Populate category select options and then render sidebar streams
            populateSidebarCategories();
            renderSidebarStreams();
            checkAllStreamsStatus();

            // Register change handler for custom stream input fields to ease Notes configuration
            const typeInput = document.getElementById('stream-type-input');
            const urlInput = document.getElementById('stream-url-input');
            if (typeInput && urlInput) {
                typeInput.addEventListener('change', () => {
                    if (typeInput.value === 'notes') {
                        urlInput.value = 'notes';
                        urlInput.placeholder = 'N/A (Automatically set to notes)';
                        urlInput.readOnly = true;
                    } else {
                        if (urlInput.value === 'notes') {
                            urlInput.value = '';
                        }
                        urlInput.placeholder = 'e.g. https://domain.com/feed.m3u8 or YouTube URL';
                        urlInput.readOnly = false;
                    }
                });
            }

            // Asynchronously initialize location and weather
            initLocationAndWeather();

            // Initialize visitor/guest view counter
            initVisitorCounter();

            // Initialize TV receiver pairing connection
            initTVPairing();

            // Auto-open pairing modal if launching TV view for the first time
            let launchedBefore = null;
            try {
                launchedBefore = localStorage.getItem('tv_launched_before');
                if (!launchedBefore) {
                    localStorage.setItem('tv_launched_before', 'true');
                }
            } catch (e) {
                console.error('[Storage Error] Failed to read/write tv_launched_before:', e);
            }
            if (!launchedBefore) {
                setTimeout(openPairingModal, 800);
            }
        }

        // Initialize visitor/guest view counter
        function initVisitorCounter() {
            const counterValEl = document.getElementById('visitor-count-value');
            if (!counterValEl) return;

            const sessionKey = 'visitor_counter_session_active';
            const isNewSession = !sessionStorage.getItem(sessionKey);
            
            const apiBase = 'https://api.counterapi.dev/v1/matrix_stream_console/guest_visits';
            const apiUrl = isNewSession ? `${apiBase}/up` : `${apiBase}/`;

            fetch(apiUrl)
                .then(response => {
                    if (!response.ok) throw new Error('CounterAPI response error');
                    return response.json();
                })
                .then(data => {
                    if (data && typeof data.count === 'number') {
                        const formattedCount = Number(data.count).toLocaleString();
                        counterValEl.innerText = formattedCount;
                        if (isNewSession) {
                            sessionStorage.setItem(sessionKey, 'true');
                        }
                    } else {
                        throw new Error('Invalid counter response format');
                    }
                })
                .catch(err => {
                    console.warn('Failed to load guest view counter:', err);
                    const counterValEl = document.getElementById('visitor-count-value');
                    if (counterValEl) {
                        counterValEl.innerText = 'Unavailable';
                        counterValEl.style.color = 'var(--text-muted)';
                    }
                });
        }

        // Load Youtube and Twitch Embed scripts
        function loadThirdPartyAPIs() {
            // YouTube Iframe API
            if (!window.YT) {
                const tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }
            // Twitch Embed API
            if (!window.Twitch) {
                const tag = document.createElement('script');
                tag.src = "https://embed.twitch.tv/v1/twitch-embed.js";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }
        }

        // Youtube ready trigger
        window.onYouTubeIframeAPIReady = function() {
            youtubeAPIReady = true;
        };

        // Header location updates
        function updateHeaderLocation() {
            const locEl = document.getElementById('header-location');
            if (locEl) locEl.innerText = appState.location;
            document.getElementById('location-input').value = appState.location;
            document.getElementById('timezone-select').value = appState.timezone;
        }

        // Clock logic
        function updateClock() {
            const clockEl = document.getElementById('clock');
            if (!clockEl) return;
            try {
                const timeStr = new Date().toLocaleTimeString('en-US', {
                    timeZone: appState.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
                clockEl.innerText = timeStr;
            } catch (e) {
                clockEl.innerText = new Date().toLocaleTimeString();
            }
        }
        setInterval(updateClock, 1000);
        updateClock();

        // Weather cache variables
        const WEATHER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
        let weatherForecastCache = null;
        let weatherForecastLocation = null;
        let weatherForecastPromise = null;
        let weatherForecastTimestamp = 0;
        
        // Curated localized neighborhood mappings for prominent postal codes
        const ZIP_NEIGHBORHOOD_MAP = {
            '77099': { name: 'Belknap Acres, Houston', latitude: 29.6709, longitude: -95.5866 },
            '77079': { name: 'West Houston, Texas', latitude: 29.7800, longitude: -95.6020 },
            '77077': { name: 'Energy Corridor, Houston', latitude: 29.7610, longitude: -95.6140 },
            '77042': { name: 'Westchase, Houston', latitude: 29.7280, longitude: -95.5490 },
            '77072': { name: 'Alief, Houston', latitude: 29.7040, longitude: -95.5880 },
            '77083': { name: 'Alief / West Houston', latitude: 29.7000, longitude: -95.6500 },
            '77036': { name: 'Chinatown, Houston', latitude: 29.7090, longitude: -95.5250 },
            '77002': { name: 'Downtown Houston, Texas', latitude: 29.7544, longitude: -95.3677 },
            '77006': { name: 'Montrose, Houston', latitude: 29.7420, longitude: -95.3900 },
            '77008': { name: 'The Heights, Houston', latitude: 29.7990, longitude: -95.4120 },
            '77019': { name: 'River Oaks, Houston', latitude: 29.7560, longitude: -95.4180 },
            '77024': { name: 'Memorial, Houston', latitude: 29.7740, longitude: -95.5220 },
            '77056': { name: 'Galleria / Uptown, Houston', latitude: 29.7510, longitude: -95.4670 },
            '77057': { name: 'Westchase / Galleria', latitude: 29.7400, longitude: -95.4900 }
        };

        const LOCAL_NAME_COORDINATES_MAP = {
            'belknap acres': { name: 'Belknap Acres, Houston', latitude: 29.6709, longitude: -95.5866 },
            'belknap': { name: 'Belknap Acres, Houston', latitude: 29.6709, longitude: -95.5866 },
            'west houston': { name: 'West Houston, Texas', latitude: 29.7710, longitude: -95.6050 }
        };

        // Zip code neighborhood localization via OpenStreetMap Nominatim with Zippopotam fallback
        async function resolveZipcodeToNeighborhood(zip) {
            const cleaned = zip.trim();
            if (!/^\d{5}$/.test(cleaned)) return null;

            // 1. Direct match for known neighborhood subdivisions (e.g. 77099 -> Belknap Acres, Houston)
            if (ZIP_NEIGHBORHOOD_MAP[cleaned]) {
                return ZIP_NEIGHBORHOOD_MAP[cleaned];
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);
                const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleaned}&country=US&format=json&addressdetails=1`, {
                    headers: { 'User-Agent': 'MatrixStreamConsole/2.1' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        const item = data[0];
                        const addr = item.address || {};
                        const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || addr.residential;
                        const city = addr.city || addr.town || addr.village || addr.county || '';
                        const state = addr.state || '';
                        
                        let localizedName = '';
                        if (neighborhood && city) {
                            localizedName = `${neighborhood}, ${city}`;
                        } else if (neighborhood && state) {
                            localizedName = `${neighborhood}, ${state}`;
                        } else if (city && state) {
                            localizedName = `${city}, ${state}`;
                        } else if (item.display_name) {
                            localizedName = item.display_name.split(',').slice(0, 2).join(',').trim();
                        }

                        if (localizedName) {
                            return {
                                name: localizedName,
                                latitude: parseFloat(item.lat),
                                longitude: parseFloat(item.lon)
                            };
                        }
                    }
                }
            } catch (e) {
                console.warn('[Geocoding] Nominatim zipcode lookup failed, trying fallback:', e);
            }

            // Fallback to Zippopotam
            try {
                const zRes = await fetch(`https://api.zippopotam.us/us/${cleaned}`);
                if (zRes.ok) {
                    const zData = await zRes.json();
                    if (zData && zData.places && zData.places.length > 0) {
                        const p = zData.places[0];
                        const city = p['place name'];
                        const state = p['state abbreviation'] || p['state'];
                        return {
                            name: `${city}, ${state}`,
                            latitude: parseFloat(p.latitude),
                            longitude: parseFloat(p.longitude)
                        };
                    }
                }
            } catch (e) {
                console.warn('[Geocoding] Zippopotam lookup failed:', e);
            }

            return null;
        }

        // UV Index categorization & styling
        function getUvCategory(uv) {
            if (uv === null || uv === undefined || isNaN(uv)) return { val: '--', text: 'N/A', color: '#9ca3af', level: 'unknown', badgeBg: 'rgba(156, 163, 175, 0.15)' };
            const num = Math.round(uv * 10) / 10;
            if (num < 3) return { val: num, text: `${num} (Low)`, color: '#22c55e', level: 'low', badgeBg: 'rgba(34, 197, 94, 0.15)' };
            if (num < 6) return { val: num, text: `${num} (Mod)`, color: '#eab308', level: 'moderate', badgeBg: 'rgba(234, 179, 8, 0.15)' };
            if (num < 8) return { val: num, text: `${num} (High)`, color: '#f97316', level: 'high', badgeBg: 'rgba(249, 115, 22, 0.15)' };
            if (num < 11) return { val: num, text: `${num} (Very High)`, color: '#ef4444', level: 'very-high', badgeBg: 'rgba(239, 68, 68, 0.15)' };
            return { val: num, text: `${num} (Extreme)`, color: '#a855f7', level: 'extreme', badgeBg: 'rgba(168, 85, 247, 0.15)' };
        }

        // Air Quality (US AQI) categorization & styling
        function getAqiCategory(aqi) {
            if (aqi === null || aqi === undefined || isNaN(aqi)) return { val: '--', text: 'N/A', color: '#9ca3af', level: 'unknown', badgeBg: 'rgba(156, 163, 175, 0.15)' };
            const val = Math.round(aqi);
            if (val <= 50) return { val, text: `${val} (Good)`, color: '#22c55e', level: 'good', badgeBg: 'rgba(34, 197, 94, 0.15)' };
            if (val <= 100) return { val, text: `${val} (Mod)`, color: '#eab308', level: 'moderate', badgeBg: 'rgba(234, 179, 8, 0.15)' };
            if (val <= 150) return { val, text: `${val} (Sensitive)`, color: '#f97316', level: 'sensitive', badgeBg: 'rgba(249, 115, 22, 0.15)' };
            if (val <= 200) return { val, text: `${val} (Unhealthy)`, color: '#ef4444', level: 'unhealthy', badgeBg: 'rgba(239, 68, 68, 0.15)' };
            if (val <= 300) return { val, text: `${val} (Very Unhealthy)`, color: '#a855f7', level: 'very-unhealthy', badgeBg: 'rgba(168, 85, 247, 0.15)' };
            return { val, text: `${val} (Hazardous)`, color: '#881337', level: 'hazardous', badgeBg: 'rgba(136, 19, 55, 0.25)' };
        }

        // Google Weather-style Animated Weather Frog Mascot ("Froggy") SVG generator
        function generateWeatherFrogSvg(code, isDay, temp, uv, aqi) {
            const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
            const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
            const isStorm = [95, 96, 99].includes(code);
            const isFog = [45, 48].includes(code);
            const isClearDay = isDay && (code === 0 || code === 1);
            const isClearNight = !isDay && (code === 0 || code === 1);

            let skyGrad = "";
            if (isStorm) {
                skyGrad = '<stop offset="0%" stop-color="#1e1b4b"/><stop offset="50%" stop-color="#311042"/><stop offset="100%" stop-color="#0f172a"/>';
            } else if (isRain) {
                skyGrad = '<stop offset="0%" stop-color="#1e293b"/><stop offset="60%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/>';
            } else if (isSnow) {
                skyGrad = '<stop offset="0%" stop-color="#0f172a"/><stop offset="50%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0369a1"/>';
            } else if (isClearNight) {
                skyGrad = '<stop offset="0%" stop-color="#020617"/><stop offset="50%" stop-color="#0b1329"/><stop offset="100%" stop-color="#1e1b4b"/>';
            } else if (isClearDay) {
                skyGrad = '<stop offset="0%" stop-color="#0284c7"/><stop offset="45%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/>';
            } else {
                skyGrad = '<stop offset="0%" stop-color="#334155"/><stop offset="50%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/>';
            }

            let celestial = "";
            if (isClearDay || (isDay && !isRain && !isStorm && !isSnow)) {
                celestial = `
                    <g class="frog-sun">
                        <circle cx="265" cy="40" r="22" fill="#f59e0b" opacity="0.3" filter="blur(8px)"/>
                        <circle cx="265" cy="40" r="16" fill="#fbbf24"/>
                        <circle cx="265" cy="40" r="24" fill="none" stroke="#fde047" stroke-width="2" stroke-dasharray="4 6" class="sun-rays"/>
                    </g>
                    <path d="M 40 38 Q 55 24 75 32 Q 90 22 105 32 Q 120 38 115 48 Q 40 48 40 38 Z" fill="#ffffff" opacity="0.45" class="cloud-drift"/>
                    <path d="M 190 28 Q 205 18 220 25 Q 235 16 250 25 Q 260 30 255 40 Q 190 40 190 28 Z" fill="#ffffff" opacity="0.3" class="cloud-drift-slow"/>
                `;
            } else if (!isDay) {
                celestial = `
                    <g class="frog-moon">
                        <circle cx="265" cy="40" r="16" fill="#f8fafc"/>
                        <circle cx="258" cy="36" r="13" fill="#0b1329"/>
                        <circle cx="268" cy="42" r="2" fill="#cbd5e1" opacity="0.5"/>
                    </g>
                    <circle cx="50" cy="30" r="1.5" fill="#f8fafc" class="star star-1"/>
                    <circle cx="90" cy="20" r="1" fill="#fde047" class="star star-2"/>
                    <circle cx="130" cy="45" r="1.5" fill="#f8fafc" class="star star-3"/>
                    <circle cx="180" cy="25" r="1.2" fill="#f8fafc" class="star star-4"/>
                    <circle cx="220" cy="50" r="1.5" fill="#fde047" class="star star-1"/>
                `;
            }

            let weatherEffects = "";
            if (isStorm) {
                weatherEffects = `
                    <path d="M 130 15 L 122 35 L 132 37 L 120 62" stroke="#fde047" stroke-width="2.5" fill="none" stroke-linejoin="round" class="lightning-bolt"/>
                    <line x1="60" y1="10" x2="45" y2="70" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 8" class="rain-streak-1" opacity="0.6"/>
                    <line x1="120" y1="5" x2="105" y2="75" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="8 10" class="rain-streak-2" opacity="0.7"/>
                    <line x1="200" y1="15" x2="185" y2="85" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 8" class="rain-streak-3" opacity="0.6"/>
                    <line x1="260" y1="8" x2="245" y2="78" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="7 9" class="rain-streak-1" opacity="0.6"/>
                `;
            } else if (isRain) {
                weatherEffects = `
                    <line x1="40" y1="10" x2="30" y2="60" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 8" class="rain-streak-1" opacity="0.6"/>
                    <line x1="90" y1="5" x2="80" y2="65" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="7 9" class="rain-streak-2" opacity="0.7"/>
                    <line x1="150" y1="12" x2="140" y2="72" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 8" class="rain-streak-3" opacity="0.6"/>
                    <line x1="210" y1="8" x2="200" y2="68" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="8 10" class="rain-streak-1" opacity="0.7"/>
                    <line x1="270" y1="15" x2="260" y2="75" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 8" class="rain-streak-2" opacity="0.6"/>
                    <ellipse cx="90" cy="158" rx="14" ry="4" fill="none" stroke="#38bdf8" stroke-width="1" class="water-ripple" opacity="0.5"/>
                    <ellipse cx="230" cy="158" rx="18" ry="5" fill="none" stroke="#38bdf8" stroke-width="1" class="water-ripple" opacity="0.5"/>
                `;
            } else if (isSnow) {
                weatherEffects = `
                    <circle cx="50" cy="20" r="2.5" fill="#f8fafc" class="snowflake snow-1" opacity="0.8"/>
                    <circle cx="95" cy="45" r="2" fill="#f8fafc" class="snowflake snow-2" opacity="0.9"/>
                    <circle cx="140" cy="15" r="3" fill="#f8fafc" class="snowflake snow-3" opacity="0.8"/>
                    <circle cx="205" cy="35" r="2" fill="#f8fafc" class="snowflake snow-1" opacity="0.7"/>
                    <circle cx="265" cy="25" r="2.5" fill="#f8fafc" class="snowflake snow-2" opacity="0.9"/>
                    <ellipse cx="160" cy="156" rx="85" ry="12" fill="#e2e8f0" opacity="0.6"/>
                `;
            }

            let basePlatform = "";
            if (isSnow) {
                basePlatform = `
                    <ellipse cx="160" cy="152" rx="60" ry="12" fill="#ffffff" opacity="0.85"/>
                    <circle cx="222" cy="144" r="9" fill="#f8fafc"/>
                    <circle cx="222" cy="132" r="6" fill="#f8fafc"/>
                    <circle cx="220" cy="131" r="1" fill="#0f172a"/>
                    <circle cx="224" cy="131" r="1" fill="#0f172a"/>
                    <path d="M 221 134 L 217 135" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/>
                `;
            } else if (!isDay) {
                basePlatform = `
                    <rect x="90" y="142" width="140" height="18" rx="9" fill="#78350f" opacity="0.8"/>
                    <ellipse cx="230" cy="151" rx="8" ry="9" fill="#92400e"/>
                    <circle cx="85" cy="120" r="2" fill="#fef08a" class="firefly firefly-1"/>
                    <circle cx="235" cy="105" r="2.5" fill="#fef08a" class="firefly firefly-2"/>
                `;
            } else {
                basePlatform = `
                    <ellipse cx="160" cy="150" rx="65" ry="14" fill="#15803d"/>
                    <path d="M 160 150 L 225 150 A 65 14 0 0 1 200 162 Z" fill="#166534"/>
                    <ellipse cx="108" cy="144" rx="7" ry="5" fill="#f472b6"/>
                    <circle cx="108" cy="144" r="2.5" fill="#fef08a"/>
                `;
            }

            let frogProps = "";
            if (isClearDay) {
                frogProps = `
                    <rect x="134" y="68" width="22" height="13" rx="3.5" fill="#0f172a"/>
                    <rect x="164" y="68" width="22" height="13" rx="3.5" fill="#0f172a"/>
                    <rect x="154" y="72" width="12" height="3" fill="#0f172a"/>
                    <line x1="138" y1="71" x2="148" y2="78" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="168" y1="71" x2="178" y2="78" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/>
                    <rect x="208" y="132" width="12" height="16" rx="2" fill="#fed7aa" opacity="0.9"/>
                    <line x1="214" y1="126" x2="218" y2="134" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="214" cy="130" r="4" fill="#fde047"/>
                `;
            } else if (isRain) {
                frogProps = `
                    <path d="M 175 125 Q 185 105 178 70" stroke="#15803d" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M 130 65 Q 175 35 220 65 Q 175 55 130 65 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1.5"/>
                    <ellipse cx="128" cy="146" rx="10" ry="7" fill="#eab308"/>
                    <ellipse cx="192" cy="146" rx="10" ry="7" fill="#eab308"/>
                `;
            } else if (isStorm) {
                frogProps = `
                    <rect x="186" y="80" width="12" height="65" rx="4" fill="#f1f5f9"/>
                    <path d="M 140 85 Q 192 30 245 85 Z" fill="#ef4444"/>
                    <circle cx="170" cy="65" r="4" fill="#ffffff"/>
                    <circle cx="215" cy="65" r="5" fill="#ffffff"/>
                    <circle cx="192" cy="50" r="3.5" fill="#ffffff"/>
                `;
            } else if (isSnow) {
                frogProps = `
                    <path d="M 144 68 Q 160 42 176 68 Z" fill="#dc2626"/>
                    <rect x="140" y="65" width="40" height="7" rx="3" fill="#ffffff"/>
                    <circle cx="160" cy="42" r="5" fill="#ffffff"/>
                    <rect x="146" y="108" width="28" height="8" rx="3" fill="#dc2626"/>
                    <rect x="166" y="112" width="8" height="18" rx="2" fill="#dc2626"/>
                    <line x1="148" y1="112" x2="172" y2="112" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 3"/>
                    <line x1="168" y1="116" x2="172" y2="128" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 3"/>
                `;
            } else if (!isDay) {
                frogProps = `
                    <rect x="194" y="120" width="12" height="16" rx="2" fill="#78350f"/>
                    <rect x="196" y="122" width="8" height="12" rx="1" fill="#fef08a"/>
                    <circle cx="200" cy="128" r="10" fill="#fef08a" opacity="0.35" filter="blur(4px)"/>
                    <path d="M 196 120 Q 200 114 204 120" stroke="#78350f" stroke-width="1.5" fill="none"/>
                `;
            }

            return `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="45 12 235 156" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" class="froggy-svg">
              <defs>
                <linearGradient id="skyGradDynamic" x1="0" y1="0" x2="0" y2="1">
                  ${skyGrad}
                </linearGradient>
              </defs>
              <rect x="45" y="12" width="235" height="156" rx="14" fill="url(#skyGradDynamic)" />
              ${celestial}
              ${weatherEffects}
              ${basePlatform}
              <g class="frog-character">
                <ellipse cx="126" cy="142" rx="14" ry="8" fill="#16a34a"/>
                <ellipse cx="194" cy="142" rx="14" ry="8" fill="#16a34a"/>
                <ellipse cx="160" cy="120" rx="34" ry="28" fill="#22c55e"/>
                <ellipse cx="160" cy="124" rx="22" ry="18" fill="#bbf7d0"/>
                <circle cx="160" cy="94" r="26" fill="#22c55e"/>
                <circle cx="144" cy="74" r="13" fill="#22c55e"/>
                <circle cx="176" cy="74" r="13" fill="#22c55e"/>
                <circle cx="144" cy="74" r="9.5" fill="#ffffff"/>
                <circle cx="176" cy="74" r="9.5" fill="#ffffff"/>
                <circle cx="145" cy="74" r="4.5" fill="#0f172a" class="frog-pupil"/>
                <circle cx="143.5" cy="72.5" r="1.5" fill="#ffffff"/>
                <circle cx="175" cy="74" r="4.5" fill="#0f172a" class="frog-pupil"/>
                <circle cx="173.5" cy="72.5" r="1.5" fill="#ffffff"/>
                <g class="frog-eyelids">
                  <ellipse cx="144" cy="74" rx="10" ry="10" fill="#16a34a" class="eyelid eyelid-left"/>
                  <ellipse cx="176" cy="74" rx="10" ry="10" fill="#16a34a" class="eyelid eyelid-right"/>
                </g>
                <ellipse cx="138" cy="98" rx="5.5" ry="3.5" fill="#f472b6" opacity="0.65"/>
                <ellipse cx="182" cy="98" rx="5.5" ry="3.5" fill="#f472b6" opacity="0.65"/>
                <path d="M 151 100 Q 160 107 169 100" stroke="#14532d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                <ellipse cx="140" cy="122" rx="6" ry="10" fill="#16a34a"/>
                <ellipse cx="180" cy="122" rx="6" ry="10" fill="#16a34a"/>
              </g>
              ${frogProps}
            </svg>`;
        }
        
        async function fetchWeatherForecast(location, forceRefresh = false) {
            const cityName = location.split(',')[0].trim();
            const now = Date.now();
            const isFresh = (now - weatherForecastTimestamp) < WEATHER_CACHE_TTL;

            if (!forceRefresh && weatherForecastCache && weatherForecastLocation === cityName && isFresh) {
                return Promise.resolve(weatherForecastCache);
            }
            if (!forceRefresh && weatherForecastPromise && weatherForecastLocation === cityName) {
                return weatherForecastPromise;
            }
            
            weatherForecastLocation = cityName;

            weatherForecastPromise = (async () => {
                let lat, lon, localizedName = null;

                const lowerLocation = cityName.toLowerCase();
                if (LOCAL_NAME_COORDINATES_MAP[lowerLocation]) {
                    const match = LOCAL_NAME_COORDINATES_MAP[lowerLocation];
                    lat = match.latitude;
                    lon = match.longitude;
                    localizedName = match.name;
                }

                // 1. Check if location is a 5-digit US zipcode
                if (!lat && /^\d{5}$/.test(cityName)) {
                    const resolved = await resolveZipcodeToNeighborhood(cityName);
                    if (resolved) {
                        lat = resolved.latitude;
                        lon = resolved.longitude;
                        localizedName = resolved.name;
                    }
                }

                // 2. If not a zipcode or zipcode lookup missed, query Open-Meteo geocoding
                if (!lat || !lon) {
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`);
                    if (!geoRes.ok) throw new Error('Geocoding failed');
                    const geoData = await geoRes.json();
                    if (!geoData.results || geoData.results.length === 0) {
                        throw new Error('City not found');
                    }
                    const result = geoData.results[0];
                    lat = result.latitude;
                    lon = result.longitude;
                    localizedName = result.admin1 ? `${result.name}, ${result.admin1}` : result.name;
                }

                // 3. Concurrently fetch extended weather forecast (hourly, UV, daily) and Air Quality (AQI)
                const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,weather_code,precipitation_probability,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
                const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10`;

                const [forecastRes, aqiRes] = await Promise.allSettled([
                    fetch(forecastUrl).then(r => {
                        if (!r.ok) throw new Error('Forecast failed');
                        return r.json();
                    }),
                    fetch(aqiUrl).then(r => {
                        if (!r.ok) throw new Error('AQI failed');
                        return r.json();
                    })
                ]);

                if (forecastRes.status !== 'fulfilled' || !forecastRes.value) {
                    throw new Error('Forecast fetch failed');
                }

                const data = forecastRes.value;
                data.localizedLocation = localizedName;
                data.aqi = (aqiRes.status === 'fulfilled' && aqiRes.value?.current) ? aqiRes.value.current : { us_aqi: null, pm2_5: null, pm10: null };

                weatherForecastCache = data;
                weatherForecastTimestamp = Date.now();
                weatherForecastPromise = null;
                return data;
            })().catch(err => {
                weatherForecastPromise = null;
                throw err;
            });
                
            return weatherForecastPromise;
        }

        // Periodic background weather refresh for continuous 24/7 TV/wall displays
        function refreshWeatherDisplays() {
            if (appState && appState.location) {
                updateWeatherBadge(appState.location);
                if (appState.streams) {
                    const weatherStreams = appState.streams.filter(s => s.type === 'weather');
                    weatherStreams.forEach(s => {
                        const container = document.getElementById(`player-container-${s.id}`);
                        if (container) {
                            initializeWeatherCam(s);
                        }
                    });
                }
            }
        }
        setInterval(refreshWeatherDisplays, WEATHER_CACHE_TTL);

        // Weather text badge
        function updateWeatherBadge(location) {
            const badge = document.getElementById('weather-badge');
            badge.innerText = 'Loading Weather...';
            
            fetchWeatherForecast(location)
                .then(data => {
                    const temp = Math.round(data.current.temperature_2m);
                    const code = data.current.weather_code;
                    const desc = getWeatherDescription(code);
                    badge.innerText = `${desc} +${temp}°F`;
                    badge.title = `Fetched from Open-Meteo for coordinates: ${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
                })
                .catch(err => {
                    console.warn('Open-Meteo failed, falling back to wttr.in:', err);
                    // Fallback to wttr.in plain text format
                    fetch(`https://wttr.in/${encodeURIComponent(location)}?format=%C+%t`)
                        .then(response => {
                            if (!response.ok) throw new Error('Weather fetch failed');
                            return response.text();
                        })
                        .then(text => {
                            if (text.includes('<html') || text.includes('<div') || text.trim() === "") {
                                badge.innerText = 'Weather Unavailable';
                            } else {
                                badge.innerText = text.trim();
                            }
                        })
                        .catch(fallbackErr => {
                            console.error('Weather fallback error:', fallbackErr);
                            badge.innerText = 'Weather Unavailable';
                        });
                });
        }

        function getWeatherDescription(code) {
            const descriptions = {
                0: "Clear",
                1: "Mainly Clear",
                2: "Partly Cloudy",
                3: "Overcast",
                45: "Foggy",
                48: "Rime Fog",
                51: "Light Drizzle",
                53: "Moderate Drizzle",
                55: "Dense Drizzle",
                56: "Light Freezing Drizzle",
                57: "Dense Freezing Drizzle",
                61: "Slight Rain",
                63: "Moderate Rain",
                65: "Heavy Rain",
                66: "Light Freezing Rain",
                67: "Heavy Freezing Rain",
                71: "Slight Snowfall",
                73: "Moderate Snowfall",
                75: "Heavy Snowfall",
                77: "Snow Grains",
                80: "Slight Rain Showers",
                81: "Moderate Rain Showers",
                82: "Violent Rain Showers",
                85: "Slight Snow Showers",
                86: "Heavy Snow Showers",
                95: "Thunderstorm",
                96: "Thunderstorm & Hail",
                99: "Heavy Thunderstorm"
            };
            return descriptions[code] || "Weather Normal";
        }

        function initLocationAndWeather() {
            const savedLocation = getStoredItem('location_config');
            if (savedLocation) {
                try {
                    const loc = JSON.parse(savedLocation);
                    appState.location = loc.location || "Galveston";
                    appState.timezone = loc.timezone || "America/Chicago";
                    
                    updateHeaderLocation();
                    updateWeatherBadge(appState.location);
                    renderWeatherPanel();
                    refreshWeatherDisplays();
                } catch (e) {
                    console.error('Error parsing location config storage', e);
                    detectIpLocation();
                }
            } else {
                detectIpLocation();
            }
        }

        function detectIpLocation() {
            fetch('https://ipapi.co/json/')
                .then(response => {
                    if (!response.ok) throw new Error('IP geolocation failed');
                    return response.json();
                })
                .then(data => {
                    if (data && data.city) {
                        const stateStr = data.region_code ? `, ${data.region_code}` : '';
                        appState.location = `${data.city}${stateStr}`;
                        appState.timezone = data.timezone || "America/Chicago";
                    } else {
                        appState.location = "Galveston";
                        appState.timezone = "America/Chicago";
                    }
                    updateHeaderLocation();
                    updateWeatherBadge(appState.location);
                    renderWeatherPanel();
                    refreshWeatherDisplays();
                })
                .catch(err => {
                    console.warn('IP geolocation error, falling back to Galveston:', err);
                    appState.location = "Galveston";
                    appState.timezone = "America/Chicago";
                    updateHeaderLocation();
                    updateWeatherBadge(appState.location);
                    renderWeatherPanel();
                    refreshWeatherDisplays();
                });
        }

        function getWeatherEmoji(code) {
            const emojis = {
                0: "☀️", // Clear
                1: "🌤️", // Mainly Clear
                2: "⛅", // Partly Cloudy
                3: "☁️", // Overcast
                45: "🌫️", // Foggy
                48: "🌫️", // Rime Fog
                51: "🌧️", // Light Drizzle
                53: "🌧️", // Moderate Drizzle
                55: "🌧️", // Dense Drizzle
                56: "🥶", // Freezing Drizzle
                57: "🥶",
                61: "🌧️", // Slight Rain
                63: "🌧️", // Moderate Rain
                65: "🌧️", // Heavy Rain
                66: "🌧️", // Freezing Rain
                67: "🌧️",
                71: "❄️", // Snowfall
                73: "❄️",
                75: "❄️",
                77: "❄️",
                80: "🌦️", // Rain Showers
                81: "🌦️",
                82: "⛈️",
                85: "❄️", // Snow Showers
                86: "❄️",
                95: "🌩️", // Thunderstorm
                96: "⛈️",
                99: "⛈️"
            };
            return emojis[code] || "☀️";
        }

        // Atmospheric weather theme determination
        function getWeatherTheme(code, isDay) {
            const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
            const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
            const isStorm = [95, 96, 99].includes(code);
            const isCloudy = [1, 2, 3, 45, 48].includes(code);
            
            if (isStorm) return 'theme-storm';
            if (isRain) return 'theme-rain';
            if (isSnow) return 'theme-snow';
            if (isCloudy) return 'theme-cloudy';
            if (!isDay) return 'theme-clear-night';
            return 'theme-sunny';
        }

        // Weather full details forecast panel load
        function renderWeatherPanel() {
            return fetchWeatherForecast(appState.location)
                .then(data => {
                    const current = data.current;
                    const daily = data.daily;
                    const hourly = data.hourly;
                    const aqi = data.aqi || {};
                    const isDay = current.is_day === 1;
                    const weatherCode = current.weather_code;
                    const currentTemp = Math.round(current.temperature_2m);
                    const feelsLike = Math.round(current.apparent_temperature || current.temperature_2m);
                    const high = Math.round(daily.temperature_2m_max[0]);
                    const low = Math.round(daily.temperature_2m_min[0]);
                    const desc = getWeatherDescription(weatherCode);

                    // Localized display location
                    const displayLocation = data.localizedLocation || appState.location;
                    const cityEl = document.getElementById('wf-city');
                    if (cityEl) cityEl.innerText = displayLocation;

                    const descEl = document.getElementById('wf-desc');
                    if (descEl) descEl.innerText = desc;

                    const tempEl = document.getElementById('wf-temp');
                    if (tempEl) tempEl.innerText = `${currentTemp}°F`;

                    const feelsEl = document.getElementById('wf-feelslike');
                    if (feelsEl) feelsEl.innerText = `${feelsLike}°F`;

                    const highlowEl = document.getElementById('wf-highlow');
                    if (highlowEl) highlowEl.innerText = `${high}° / ${low}°`;

                    // Apply atmospheric weather theme & hero icon
                    const theme = getWeatherTheme(weatherCode, isDay);
                    const heroCard = document.getElementById('wf-hero-card');
                    if (heroCard) {
                        heroCard.className = `weather-hero-card ${theme}`;
                    }
                    const heroIconEl = document.getElementById('wf-hero-icon');
                    if (heroIconEl) {
                        heroIconEl.innerText = getWeatherEmoji(weatherCode);
                    }

                    // UV & AQI Header Pills
                    const uvInfo = getUvCategory(current.uv_index);
                    const aqiInfo = getAqiCategory(aqi.us_aqi);

                    const uvBadge = document.getElementById('wf-uv-badge');
                    if (uvBadge) {
                        uvBadge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${uvInfo.color}; display: inline-block;"></span> UV: ${uvInfo.text}`;
                        uvBadge.style.borderColor = uvInfo.color;
                    }

                    const aqiBadge = document.getElementById('wf-aqi-badge');
                    if (aqiBadge) {
                        aqiBadge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${aqiInfo.color}; display: inline-block;"></span> AQI: ${aqiInfo.text}`;
                        aqiBadge.style.borderColor = aqiInfo.color;
                    }

                    // Environmental Metrics Cards
                    const uvValEl = document.getElementById('wf-metric-uv-val');
                    if (uvValEl) uvValEl.innerText = uvInfo.val;
                    const uvTagEl = document.getElementById('wf-metric-uv-tag');
                    if (uvTagEl) {
                        uvTagEl.innerText = uvInfo.level.toUpperCase();
                        uvTagEl.style.backgroundColor = uvInfo.badgeBg;
                        uvTagEl.style.color = uvInfo.color;
                    }
                    const uvSubEl = document.getElementById('wf-metric-uv-sub');
                    if (uvSubEl) {
                        const maxUv = daily.uv_index_max && daily.uv_index_max.length > 0 ? Math.round(daily.uv_index_max[0] * 10) / 10 : '--';
                        uvSubEl.innerText = `Max UV today: ${maxUv}`;
                    }

                    const aqiValEl = document.getElementById('wf-metric-aqi-val');
                    if (aqiValEl) aqiValEl.innerText = aqiInfo.val;
                    const aqiTagEl = document.getElementById('wf-metric-aqi-tag');
                    if (aqiTagEl) {
                        aqiTagEl.innerText = aqiInfo.level.toUpperCase();
                        aqiTagEl.style.backgroundColor = aqiInfo.badgeBg;
                        aqiTagEl.style.color = aqiInfo.color;
                    }
                    const aqiSubEl = document.getElementById('wf-metric-aqi-sub');
                    if (aqiSubEl) {
                        const pm25 = aqi.pm2_5 ? Math.round(aqi.pm2_5 * 10) / 10 : '--';
                        aqiSubEl.innerText = `PM2.5: ${pm25} µg/m³`;
                    }

                    const windEl = document.getElementById('wf-wind');
                    if (windEl) windEl.innerText = `${Math.round(current.wind_speed_10m)} mph`;
                    const humidityEl = document.getElementById('wf-humidity');
                    if (humidityEl) humidityEl.innerText = `${current.relative_humidity_2m}%`;

                    const sunriseEl = document.getElementById('wf-sunrise');
                    if (sunriseEl && daily.sunrise && daily.sunrise[0]) {
                        const srDate = new Date(daily.sunrise[0]);
                        sunriseEl.innerText = srDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    }
                    const sunsetEl = document.getElementById('wf-sunset');
                    if (sunsetEl && daily.sunset && daily.sunset[0]) {
                        const ssDate = new Date(daily.sunset[0]);
                        sunsetEl.innerText = ssDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    }

                    // Hourly Forecast Strip (Next 24 Hours)
                    const hourlyTrack = document.getElementById('wf-hourly-track');
                    if (hourlyTrack && hourly && hourly.time) {
                        hourlyTrack.innerHTML = '';
                        const nowTime = Date.now();
                        let startHourIdx = 0;
                        for (let i = 0; i < hourly.time.length; i++) {
                            const t = new Date(hourly.time[i]).getTime();
                            if (t >= (nowTime - 3600000)) {
                                startHourIdx = i;
                                break;
                            }
                        }

                        const endHourIdx = Math.min(hourly.time.length, startHourIdx + 24);
                        const frag = document.createDocumentFragment();

                        for (let i = startHourIdx; i < endHourIdx; i++) {
                            const dateObj = new Date(hourly.time[i]);
                            const isNow = (i === startHourIdx);
                            const timeLabel = isNow ? 'Now' : dateObj.toLocaleTimeString([], { hour: 'numeric' });
                            const hCode = hourly.weather_code[i];
                            const hEmoji = getWeatherEmoji(hCode);
                            const hTemp = Math.round(hourly.temperature_2m[i]);
                            const precipProb = hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0;

                            const card = document.createElement('div');
                            card.className = `weather-hourly-card ${isNow ? 'active-hour' : ''}`;
                            card.innerHTML = `
                                <span class="wh-time">${timeLabel}</span>
                                <span class="wh-icon">${hEmoji}</span>
                                <span class="wh-temp">${hTemp}°</span>
                                ${precipProb > 0 ? `<span class="wh-precip">💧 ${precipProb}%</span>` : ''}
                            `;
                            frag.appendChild(card);
                        }
                        hourlyTrack.appendChild(frag);
                    }

                    // 7-Day Extended Forecast with Temperature Spread Bars
                    const dailyGrid = document.getElementById('wf-daily-grid');
                    if (dailyGrid && daily && daily.time) {
                        dailyGrid.innerHTML = '';
                        const weekMin = Math.min(...daily.temperature_2m_min);
                        const weekMax = Math.max(...daily.temperature_2m_max);
                        const range = Math.max(1, weekMax - weekMin);

                        const frag = document.createDocumentFragment();
                        for (let i = 0; i < daily.time.length; i++) {
                            const dateStr = daily.time[i];
                            const dateObj = new Date(dateStr + 'T00:00:00');
                            const dayName = (i === 0) ? 'Today' : (i === 1) ? 'Tomorrow' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                            
                            const code = daily.weather_code[i];
                            const emoji = getWeatherEmoji(code);
                            const desc = getWeatherDescription(code);
                            const maxTemp = Math.round(daily.temperature_2m_max[i]);
                            const minTemp = Math.round(daily.temperature_2m_min[i]);

                            const leftPct = Math.max(0, Math.round(((minTemp - weekMin) / range) * 100));
                            const widthPct = Math.max(8, Math.round(((maxTemp - minTemp) / range) * 100));

                            const row = document.createElement('div');
                            row.className = 'weather-daily-row';
                            row.innerHTML = `
                                <span class="wdr-day">${dayName}</span>
                                <span class="wdr-icon" title="${desc}">${emoji}</span>
                                <div class="wdr-bar-wrap">
                                    <span class="wdr-temp-min">${minTemp}°</span>
                                    <div class="wdr-bar-bg">
                                        <div class="wdr-bar-fill" style="left: ${leftPct}%; width: ${widthPct}%;"></div>
                                    </div>
                                    <span class="wdr-temp-max">${maxTemp}°</span>
                                </div>
                            `;
                            frag.appendChild(row);
                        }
                        dailyGrid.appendChild(frag);
                    }
                })
                .catch(err => {
                    console.error('Error rendering weather forecast:', err);
                    const cityEl = document.getElementById('wf-city');
                    if (cityEl) cityEl.innerText = appState.location;
                    const descEl = document.getElementById('wf-desc');
                    if (descEl) descEl.innerText = "Forecast Unavailable";
                });
        }

        // Drag and Drop implementation
        function handleDragStart(e, streamId) {
            dragSourceId = streamId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', streamId);
            
            // Highlight target drop areas
            const container = document.getElementById('grid-container');
            if (container) {
                container.classList.add('dragging-active');
            }
            document.body.classList.add('dragging-active');
            
            const card = document.getElementById(`card-${streamId}`);
            if (card) card.classList.add('dragging');
        }

        function handleSidebarDragStart(e, streamId) {
            dragSourceId = streamId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', streamId);
            
            const container = document.getElementById('grid-container');
            if (container) {
                container.classList.add('dragging-active');
            }
            document.body.classList.add('dragging-active');
            
            const item = document.getElementById(`sidebar-item-${streamId}`);
            if (item) item.classList.add('dragging');
        }

        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drag-over');
            return false;
        }

        function handleDragLeave(e) {
            e.currentTarget.classList.remove('drag-over');
        }

        function handleDrop(e, targetId) {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            
            if (dragSourceId && dragSourceId !== targetId) {
                swapStreams(dragSourceId, targetId);
            }
            return false;
        }

        function handleDragEnd(e) {
            e.target.classList.remove('dragging');
            document.querySelectorAll('.stream-card').forEach(c => c.classList.remove('drag-over'));
            const container = document.getElementById('grid-container');
            if (container) {
                container.classList.remove('drag-over');
                container.classList.remove('dragging-active');
            }
            document.body.classList.remove('dragging-active');
        }

        function handleSidebarDragEnd(e) {
            if (dragSourceId) {
                const item = document.getElementById(`sidebar-item-${dragSourceId}`);
                if (item) item.classList.remove('dragging');
            }
            document.querySelectorAll('.stream-card').forEach(c => c.classList.remove('drag-over'));
            const container = document.getElementById('grid-container');
            if (container) {
                container.classList.remove('drag-over');
                container.classList.remove('dragging-active');
            }
            document.body.classList.remove('dragging-active');
            dragSourceId = null;
        }

        function handleTrashcanDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('drag-over');
            return false;
        }

        function handleTrashcanDragLeave(e) {
            e.currentTarget.classList.remove('drag-over');
        }

        function handleTrashcanDrop(e) {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            
            if (dragSourceId) {
                const stream = appState.streams.find(s => s.id === dragSourceId);
                if (stream) {
                    if (stream.isDefault) {
                        // Deactivate default/system stream (hide from active view)
                        toggleStreamActive(dragSourceId, false);
                    } else {
                        // Delete custom stream completely
                        deleteStream(dragSourceId);
                    }
                }
            }
            return false;
        }

        window.handleTrashcanDragOver = handleTrashcanDragOver;
        window.handleTrashcanDragLeave = handleTrashcanDragLeave;
        window.handleTrashcanDrop = handleTrashcanDrop;

        function handleGridDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            
            // Only visual feedback if grid has no streams
            const activeStreamsCount = appState.streams.filter(s => s.active).length;
            if (activeStreamsCount === 0) {
                document.getElementById('grid-container').classList.add('drag-over');
            }
            return false;
        }

        function handleGridDragLeave(e) {
            document.getElementById('grid-container').classList.remove('drag-over');
        }

        function handleGridDrop(e) {
            e.stopPropagation();
            e.preventDefault();
            document.getElementById('grid-container').classList.remove('drag-over');
            
            if (dragSourceId) {
                const stream = appState.streams.find(s => s.id === dragSourceId);
                if (stream && !stream.active) {
                    toggleStreamActive(dragSourceId, true);
                }
            }
            return false;
        }

        function swapStreams(id1, id2) {
            const idx1 = appState.streams.findIndex(s => s.id === id1);
            const idx2 = appState.streams.findIndex(s => s.id === id2);
            
            if (idx1 !== -1 && idx2 !== -1) {
                const s1 = appState.streams[idx1];
                const s2 = appState.streams[idx2];
                
                if (s1.active && s2.active) {
                    // Both are active: swap positions
                    const temp = appState.streams[idx1];
                    appState.streams[idx1] = appState.streams[idx2];
                    appState.streams[idx2] = temp;
                } else {
                    // One is active, one is inactive (from sidebar)
                    // Toggle active status: s1 becomes active, s2 becomes inactive
                    const tempActive = s1.active;
                    s1.active = s2.active;
                    s2.active = tempActive;
                    
                    // Swap their positions in array
                    const temp = appState.streams[idx1];
                    appState.streams[idx1] = appState.streams[idx2];
                    appState.streams[idx2] = temp;
                    
                    // Handle cinema active stream adjustment
                    if (appState.layout === 'cinema') {
                        if (!s1.active && cinemaActiveStreamId === s1.id) {
                            cinemaActiveStreamId = s2.id;
                        } else if (!s2.active && cinemaActiveStreamId === s2.id) {
                            cinemaActiveStreamId = s1.id;
                        }
                    }
                }
                
                persistState();
                renderActiveStreams();
                renderSidebarStreams();
                populateSettings();
            }
        }

        // Sidebar handlers
        function toggleSidebar() {
            const sidebar = document.getElementById('streams-sidebar');
            const btn = document.getElementById('btn-toggle-sidebar');
            if (!sidebar) return;
            
            const isCollapsed = sidebar.classList.toggle('collapsed');
            if (btn) {
                if (isCollapsed) {
                    btn.classList.remove('active');
                } else {
                    btn.classList.add('active');
                }
            }
            
            setStoredItem('sidebar_collapsed', isCollapsed ? '1' : '0');
        }

        const debouncedRenderSidebar = debounce(() => {
            renderSidebarStreams();
        }, 250);

        function filterSidebarStreams() {
            debouncedRenderSidebar();
        }

        function renderSidebarStreams() {
            const listContainer = document.getElementById('sidebar-streams-list');
            if (!listContainer) return;
            
            const searchInput = document.getElementById('sidebar-search-input');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            const categorySelect = document.getElementById('sidebar-category-select');
            const selectedCategory = categorySelect ? categorySelect.value : 'all';
            
            listContainer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            let count = 0;
            
            appState.streams.forEach(stream => {
                const streamCategory = stream.category || 'General';
                if (selectedCategory !== 'all' && streamCategory.toLowerCase() !== selectedCategory.toLowerCase()) {
                    return;
                }
                
                if (query && !stream.name.toLowerCase().includes(query) && !stream.type.toLowerCase().includes(query) && !streamCategory.toLowerCase().includes(query)) {
                    return;
                }
                
                const item = document.createElement('div');
                item.className = `sidebar-item ${stream.active ? 'active-in-grid' : ''}`;
                item.id = `sidebar-item-${stream.id}`;
                item.setAttribute('draggable', 'true');
                item.setAttribute('ondragstart', `handleSidebarDragStart(event, '${stream.id}')`);
                item.setAttribute('ondragend', `handleSidebarDragEnd(event)`);
                
                const badgeClass = stream.type.toLowerCase();
                const displayUrl = stream.url.length > 28 ? stream.url.substring(0, 25) + '...' : stream.url;
                
                const status = streamUptimeStatuses[stream.id] || 'checking';
                const statusTitle = status === 'checking' ? 'Checking status...' : (status === 'online' ? 'Stream online' : 'Stream offline / inaccessible');

                const escapedName = escapeHtml(stream.name);
                const escapedType = escapeHtml(stream.type);
                const escapedUrl = escapeHtml(stream.url);
                const escapedDisplayUrl = escapeHtml(displayUrl);
                const escapedStatusTitle = escapeHtml(statusTitle);

                item.innerHTML = `
                    <div class="sidebar-item-header">
                        <span class="status-dot-mini ${status}" id="sidebar-status-dot-${stream.id}" title="${escapedStatusTitle}"></span>
                        <span class="sidebar-item-name" title="${escapedName}">${escapedName}</span>
                        <span class="sidebar-item-badge ${badgeClass}">${escapedType}</span>
                    </div>
                    <div class="sidebar-item-footer">
                        <span class="sidebar-item-desc" title="${escapedUrl}">${escapedDisplayUrl}</span>
                        <div class="sidebar-item-controls">
                            <label class="sidebar-switch" title="Toggle active status" onclick="event.stopPropagation()">
                                <input type="checkbox" ${stream.active ? 'checked' : ''} onchange="toggleStreamActive('${stream.id}', this.checked)">
                                <span class="sidebar-slider"></span>
                            </label>
                        </div>
                    </div>
                `;
                
                fragment.appendChild(item);
                count++;
            });
            
            if (count === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px 0;">
                        No streams found
                    </div>
                `;
            } else {
                listContainer.appendChild(fragment);
            }
        }

        // Render layout logic with smart player reconciliation and background keep-alive
        function renderActiveStreams() {
            const container = document.getElementById('grid-container');
            if (!container) return;
            
            const activeStreams = appState.streams.filter(s => s.active);
            
            if (activeStreams.length === 0) {
                clearAllPlayers();
                container.className = '';
                container.innerHTML = `
                    <div class="no-streams">
                        <p>No active streams selected. Open configuration to set up and enable feeds.</p>
                        <button class="btn btn-primary" onclick="openSettings()">Configure Streams</button>
                    </div>
                `;
                return;
            }
            
            // Remove no-streams placeholder if present
            const noStreamsEl = container.querySelector('.no-streams');
            if (noStreamsEl) noStreamsEl.remove();
            
            // Get layout capacity and cull streams that exceed it
            const capacity = LAYOUT_CAPACITIES[appState.layout] || 4;
            let displayStreams = [];
            
            if (appState.layout === 'cinema') {
                let activeStream = activeStreams.find(s => s.id === cinemaActiveStreamId);
                if (!activeStream) {
                    activeStream = activeStreams[0];
                    cinemaActiveStreamId = activeStream.id;
                }
                displayStreams = [activeStream];
            } else {
                displayStreams = activeStreams.slice(0, capacity);
            }
            
            const displayIds = new Set(displayStreams.map(s => s.id));
            const allStreamIds = new Set(appState.streams.map(s => s.id));

            // 1. Cull / Hide Phase
            if (appState.keepStreamsAlive) {
                // Keep players alive in DOM; hide cards not in displayStreams and mute video audio
                Object.keys(activePlayers).forEach(id => {
                    // If stream was completely deleted from library, destroy it
                    if (!allStreamIds.has(id)) {
                        destroyPlayer(id);
                        return;
                    }

                    const card = document.getElementById(`card-${id}`);
                    if (!displayIds.has(id)) {
                        if (card) card.classList.add('stream-hidden');
                        
                        // Mute audio for hidden players so they don't play sound in background
                        const pObj = activePlayers[id];
                        if (pObj) {
                            if (pObj.type === 'hls' && pObj.instance && typeof pObj.instance.muted === 'function') {
                                if (pObj._wasMuted === undefined) pObj._wasMuted = pObj.instance.muted();
                                pObj.instance.muted(true);
                            } else if (pObj.type === 'youtube' && pObj.instance && typeof pObj.instance.mute === 'function') {
                                if (pObj._wasMuted === undefined && typeof pObj.instance.isMuted === 'function') {
                                    pObj._wasMuted = pObj.instance.isMuted();
                                }
                                pObj.instance.mute();
                            } else if (pObj.type === 'twitch' && pObj.instance && typeof pObj.instance.setMuted === 'function') {
                                if (pObj._wasMuted === undefined && typeof pObj.instance.isMuted === 'function') {
                                    pObj._wasMuted = pObj.instance.isMuted();
                                }
                                pObj.instance.setMuted(true);
                            }
                        }
                    }
                });

                // Remove cards from DOM for streams completely removed from library
                const existingCards = container.querySelectorAll('.stream-card');
                existingCards.forEach(card => {
                    const id = card.id.replace('card-', '');
                    if (!allStreamIds.has(id)) {
                        card.remove();
                    }
                });
            } else {
                // Standard mode: Destroy players & timers for streams that are no longer displayed
                Object.keys(activePlayers).forEach(id => {
                    if (!displayIds.has(id)) {
                        destroyPlayer(id);
                    }
                });
                Object.keys(pendingPlayerTimers).forEach(id => {
                    if (!displayIds.has(id)) {
                        clearInterval(pendingPlayerTimers[id]);
                        clearTimeout(pendingPlayerTimers[id]);
                        delete pendingPlayerTimers[id];
                    }
                });
                
                // Remove any orphan card elements from DOM
                const existingCards = container.querySelectorAll('.stream-card');
                existingCards.forEach(card => {
                    const id = card.id.replace('card-', '');
                    if (!displayIds.has(id)) {
                        card.remove();
                    }
                });
            }
            
            // 2. Layout class update
            const hasSelector = appState.layout === 'cinema' && activeStreams.length > 1;
            const targetLayoutClass = (appState.layout === 'cinema' ? 'layout-cinema' : appState.layout) + (hasSelector ? ' has-selector' : '');
            container.className = targetLayoutClass;
            
            // 3. Retain / Mount / Unhide Phase: Preserve already running players, unhide background ones, create new ones
            displayStreams.forEach((s, targetIdx) => {
                let card = document.getElementById(`card-${s.id}`);
                const currentP = activePlayers[s.id];
                const needsReinit = currentP && (currentP.url !== s.url || currentP.type !== s.type);
                
                if (needsReinit) {
                    destroyPlayer(s.id);
                    card = null;
                }
                
                if (!card) {
                    // Create new card and initialize player
                    renderStreamCard(container, s);
                    const playerContainer = document.getElementById(`player-container-${s.id}`);
                    if (playerContainer) {
                        initializePlayer(s);
                    }
                } else {
                    // Unhide card if it was hidden in background
                    card.classList.remove('stream-hidden');

                    // Restore audio mute state if it was unmuted before hiding
                    if (currentP && currentP._wasMuted === false) {
                        if (currentP.type === 'hls' && currentP.instance && typeof currentP.instance.muted === 'function') {
                            currentP.instance.muted(false);
                        } else if (currentP.type === 'youtube' && currentP.instance && typeof currentP.instance.unMute === 'function') {
                            currentP.instance.unMute();
                        } else if (currentP.type === 'twitch' && currentP.instance && typeof currentP.instance.setMuted === 'function') {
                            currentP.instance.setMuted(false);
                        }
                        delete currentP._wasMuted;
                    }

                    // Existing card: keep in place if already at target position among visible cards
                    const visibleCards = Array.from(container.children).filter(el => el.classList.contains('stream-card') && !el.classList.contains('stream-hidden'));
                    if (visibleCards.indexOf(card) !== targetIdx) {
                        container.appendChild(card);
                    }
                }
            });
            
            // 4. Cinema navigation selector handling
            let selectorDiv = container.querySelector('.cinema-selector');
            if (hasSelector) {
                if (!selectorDiv) {
                    selectorDiv = document.createElement('div');
                    selectorDiv.className = 'cinema-selector';
                    selectorDiv.innerHTML = '<h4>Active Channels Selector</h4>';
                    const btnGroup = document.createElement('div');
                    btnGroup.className = 'cinema-selector-group';
                    selectorDiv.appendChild(btnGroup);
                    container.appendChild(selectorDiv);
                } else {
                    // Ensure selector is positioned after stream cards
                    container.appendChild(selectorDiv);
                }
                
                const btnGroup = selectorDiv.querySelector('.cinema-selector-group');
                if (btnGroup) {
                    btnGroup.innerHTML = '';
                    activeStreams.forEach(s => {
                        const btn = document.createElement('button');
                        btn.className = `btn btn-sm ${s.id === cinemaActiveStreamId ? 'active' : ''}`;
                        btn.innerText = s.name;
                        btn.onclick = () => {
                            cinemaActiveStreamId = s.id;
                            renderActiveStreams();
                        };
                        btnGroup.appendChild(btn);
                    });
                }
            } else if (selectorDiv) {
                selectorDiv.remove();
            }
        }

        // Render card structure in DOM
        // Render card structure in DOM
        function renderStreamCard(parent, stream) {
            const card = document.createElement('div');
            card.id = `card-${stream.id}`;
            card.className = 'stream-card';
            
            // HTML5 Drag and Drop event attributes bound programmatically
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', (event) => handleDragStart(event, stream.id));
            card.addEventListener('dragover', (event) => handleDragOver(event));
            card.addEventListener('dragleave', (event) => handleDragLeave(event));
            card.addEventListener('drop', (event) => handleDrop(event, stream.id));
            card.addEventListener('dragend', (event) => handleDragEnd(event));

            // Delegate stream control clicks safely
            card.addEventListener('click', (event) => {
                const btn = event.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                if (action === 'fullscreen') {
                    fullscreenStream(stream.id);
                } else if (action === 'popout') {
                    popoutStream(stream.id);
                } else if (action === 'snapshot') {
                    captureSnapshot(stream.id);
                } else if (action === 'play-pause') {
                    togglePlay(stream.id);
                } else if (action === 'mute') {
                    toggleMute(stream.id);
                }
            });

            // Delegate volume slider input safely
            card.addEventListener('input', (event) => {
                const slider = event.target.closest('[data-action="volume"]');
                if (!slider) return;
                setStreamVolume(stream.id, slider.value);
            });
            
            // Add sizing tags for asymmetric layouts
            if (appState.layout === 'layout-1-5') {
                const activeStreams = appState.streams.filter(s => s.active);
                const index = activeStreams.indexOf(stream);
                if (index === 0) card.classList.add('large');
            } else if (appState.layout === 'layout-2-3') {
                const activeStreams = appState.streams.filter(s => s.active);
                const index = activeStreams.indexOf(stream);
                if (index < 2) card.classList.add('large');
                else card.classList.add('small');
            }
            
            const isIframe = stream.type === 'iframe';
            const isNotes = stream.type === 'notes';
            const isWeather = stream.type === 'weather';
            if (isIframe) card.classList.add('stream-iframe-card');
            if (isWeather) card.classList.add('stream-weather-card');
            
            let controlsHtml = '';
            let headerActionsHtml = '';

            if (isNotes) {
                controlsHtml = `
                    <div class="stream-controls">
                        <span class="control-note">Console Event Log</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                                ${FULLSCREEN_SVG}
                            </button>
                        </div>
                    </div>
                `;
            } else if (isIframe) {
                // Iframe reports/dashboards: No bottom control bar or "External Embed" note to keep filters and controls unobstructed
                controlsHtml = '';
                headerActionsHtml = `
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="control-btn popout-btn" data-action="popout" title="Pop-out Stream (New Window)">
                            ${POPOUT_SVG}
                        </button>
                        <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                            ${FULLSCREEN_SVG}
                        </button>
                    </div>
                `;
            } else if (isWeather) {
                // Weather stream: No bottom action bar on hover to prevent covering 5-day forecast
                controlsHtml = '';
                headerActionsHtml = `
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                            ${FULLSCREEN_SVG}
                        </button>
                    </div>
                `;
            } else {
                const isSnapshotSupported = stream.type === 'hls';
                const snapshotButtonHtml = isSnapshotSupported ? `
                    <button class="control-btn snapshot-btn" data-action="snapshot" title="Capture Snapshot Frame">
                        ${SNAPSHOT_SVG}
                    </button>
                ` : '';

                controlsHtml = `
                    <div class="stream-controls">
                            <button class="control-btn play-pause-btn" data-action="play-pause" title="Play/Pause">
                                ${PLAY_SVG}
                            </button>
                            <div class="volume-control">
                                <button class="control-btn volume-mute-btn" data-action="mute" title="Mute/Unmute">
                                    ${MUTE_SVG}
                                </button>
                                <input type="range" min="0" max="100" value="50" class="volume-slider" data-action="volume" title="Volume">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                ${snapshotButtonHtml}
                                <button class="control-btn popout-btn" data-action="popout" title="Pop-out Stream (New Window)">
                                    ${POPOUT_SVG}
                                </button>
                                <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                                    ${FULLSCREEN_SVG}
                                </button>
                            </div>
                        </div>
                    `;
            }
            
            const showVolumeInTab = stream.type !== 'weather' && stream.type !== 'iframe' && stream.type !== 'notes';
            const volumeTabHtml = showVolumeInTab ? `<span class="sst-volume" id="sst-volume-${stream.id}">🔇</span>` : '';

            const escapedStreamName = escapeHtml(stream.name);
            const escapedStreamType = escapeHtml(stream.type);

            card.innerHTML = `
                <div class="stream-status-tab" id="status-tab-${stream.id}">
                    <span class="sst-name">${escapedStreamName}</span>
                    ${volumeTabHtml}
                </div>
                <div class="stream-header">
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; max-width: calc(100% - 80px);">
                        <span class="stream-name">${escapedStreamName}</span>
                        <span class="stream-type-badge">${escapedStreamType}</span>
                    </div>
                    ${headerActionsHtml}
                </div>
                <div class="stream-player-container" id="player-container-${stream.id}">
                    <!-- Embedded Stream Content -->
                </div>
                ${controlsHtml}
            `;
            
            parent.appendChild(card);
        }

        // Initialize players
        function initializePlayer(stream) {
            // Guard: clear any existing pending player polling timers for this stream to prevent zombie interval leaks
            if (pendingPlayerTimers[stream.id]) {
                clearInterval(pendingPlayerTimers[stream.id]);
                clearTimeout(pendingPlayerTimers[stream.id]);
                delete pendingPlayerTimers[stream.id];
            }

            if (stream.type === 'hls') {
                const videoEl = document.createElement('video');
                videoEl.id = 'video-' + stream.id;
                videoEl.className = 'video-js vjs-default-skin';
                videoEl.setAttribute('playsinline', '');
                videoEl.muted = true;
                
                const container = document.getElementById(`player-container-${stream.id}`);
                if (!container) return;
                container.appendChild(videoEl);
                
                try {
                    // Set fluid: false for strict container resizing in fixed layout cells
                    const player = videojs(videoEl.id, {
                        autoplay: true,
                        muted: true,
                        controls: false,
                        fluid: false
                    });
                    player.src({ src: stream.url, type: 'application/x-mpegURL' });
                    
                    activePlayers[stream.id] = {
                        type: 'hls',
                        instance: player,
                        url: stream.url,
                        muted: true,
                        volume: 50
                    };
                    
                    player.volume(0.5);
                    updateFloatingTabVolume(stream.id);
                    
                    player.on('play', () => {
                        const btn = document.querySelector(`#card-${stream.id} .play-pause-btn`);
                        updatePlayBtnIcon(btn, true);
                    });
                    player.on('pause', () => {
                        const btn = document.querySelector(`#card-${stream.id} .play-pause-btn`);
                        updatePlayBtnIcon(btn, false);
                    });
                } catch (e) {
                    console.error('Error initializing HLS player: ', e);
                    const c = document.getElementById(`player-container-${stream.id}`);
                    if (c) {
                        c.innerHTML = `<div class="player-error">HLS Stream Load Failed</div>`;
                    }
                }
            } 
            else if (stream.type === 'youtube') {
                const ytId = getYouTubeId(stream.url);
                if (!ytId) {
                    const c = document.getElementById(`player-container-${stream.id}`);
                    if (c) c.innerHTML = `<div class="player-error">Invalid YouTube URL</div>`;
                    return;
                }
                
                const playerDiv = document.createElement('div');
                playerDiv.id = 'yt-' + stream.id;
                const container = document.getElementById(`player-container-${stream.id}`);
                if (!container) return;
                container.appendChild(playerDiv);
                
                let attempts = 0;
                if (pendingPlayerTimers[stream.id]) {
                    clearInterval(pendingPlayerTimers[stream.id]);
                    clearTimeout(pendingPlayerTimers[stream.id]);
                    delete pendingPlayerTimers[stream.id];
                }
                const interval = setInterval(() => {
                    attempts++;
                    if (window.YT && window.YT.Player) {
                        clearInterval(interval);
                        if (pendingPlayerTimers[stream.id] === interval) {
                            delete pendingPlayerTimers[stream.id];
                        }
                        createYTPlayer(stream, playerDiv.id, ytId);
                    } else if (attempts > 50) {
                        clearInterval(interval);
                        if (pendingPlayerTimers[stream.id] === interval) {
                            delete pendingPlayerTimers[stream.id];
                        }
                        playerDiv.innerText = "Failed to load YouTube Iframe API";
                    }
                }, 100);
                pendingPlayerTimers[stream.id] = interval;
            } 
            else if (stream.type === 'twitch') {
                const channel = getTwitchChannel(stream.url);
                if (!channel) {
                    const c = document.getElementById(`player-container-${stream.id}`);
                    if (c) c.innerHTML = `<div class="player-error">Invalid Twitch URL</div>`;
                    return;
                }
                
                const playerDiv = document.createElement('div');
                playerDiv.id = 'twitch-' + stream.id;
                const container = document.getElementById(`player-container-${stream.id}`);
                if (!container) return;
                container.appendChild(playerDiv);
                
                let attempts = 0;
                if (pendingPlayerTimers[stream.id]) {
                    clearInterval(pendingPlayerTimers[stream.id]);
                    clearTimeout(pendingPlayerTimers[stream.id]);
                    delete pendingPlayerTimers[stream.id];
                }
                const interval = setInterval(() => {
                    attempts++;
                    if (window.Twitch && window.Twitch.Player) {
                        clearInterval(interval);
                        if (pendingPlayerTimers[stream.id] === interval) {
                            delete pendingPlayerTimers[stream.id];
                        }
                        createTwitchPlayer(stream, playerDiv.id, channel);
                    } else if (attempts > 50) {
                        clearInterval(interval);
                        if (pendingPlayerTimers[stream.id] === interval) {
                            delete pendingPlayerTimers[stream.id];
                        }
                        playerDiv.innerText = "Failed to load Twitch API";
                    }
                }, 100);
                pendingPlayerTimers[stream.id] = interval;
            } 
            else if (stream.type === 'iframe') {
                const iframe = document.createElement('iframe');
                iframe.src = stream.url;
                iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
                const container = document.getElementById(`player-container-${stream.id}`);
                if (!container) return;
                container.appendChild(iframe);
                
                activePlayers[stream.id] = {
                    type: 'iframe',
                    instance: iframe,
                    url: stream.url,
                    muted: true,
                    volume: 50
                };
            }
            else if (stream.type === 'weather') {
                initializeWeatherCam(stream);
                activePlayers[stream.id] = {
                    type: 'weather',
                    instance: null,
                    url: stream.url,
                    muted: true,
                    volume: 50
                };
            }
            else if (stream.type === 'notes') {
                initializeNotesWidget(stream);
                activePlayers[stream.id] = {
                    type: 'notes',
                    instance: null,
                    url: stream.url,
                    muted: true,
                    volume: 50
                };
            }
        }

        // Helper to extract YouTube ID
        function getYouTubeId(url) {
            if (!url) return null;
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            if (match && match[2].length === 11) {
                return match[2];
            }
            if (url.length === 11 && !url.includes('/') && !url.includes('.')) {
                return url;
            }
            return null;
        }

        // Helper to extract Twitch channel
        function getTwitchChannel(url) {
            if (!url) return null;
            if (url.includes('twitch.tv/')) {
                const parts = url.split('twitch.tv/');
                if (parts[1]) {
                    return parts[1].split(/[?#]/)[0];
                }
            }
            if (!url.includes('.') && !url.includes('/')) {
                return url;
            }
            return null;
        }

        function createYTPlayer(stream, divId, videoId) {
            try {
                const player = new YT.Player(divId, {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    playerVars: {
                        autoplay: 1,
                        mute: 1,
                        controls: 0,
                        modestbranding: 1,
                        rel: 0,
                        playsinline: 1
                    },
                    events: {
                        onReady: (event) => {
                            event.target.playVideo();
                            event.target.setVolume(50);
                        },
                        onStateChange: (event) => {
                            const btn = document.querySelector(`#card-${stream.id} .play-pause-btn`);
                            if (event.data === YT.PlayerState.PLAYING) {
                                updatePlayBtnIcon(btn, true);
                            } else if (event.data === YT.PlayerState.PAUSED) {
                                updatePlayBtnIcon(btn, false);
                            }
                        }
                    }
                });
                
                activePlayers[stream.id] = {
                    type: 'youtube',
                    instance: player,
                    url: stream.url,
                    muted: true,
                    volume: 50
                };
                updateFloatingTabVolume(stream.id);
            } catch (e) {
                console.error('Error creating YouTube player instance: ', e);
            }
        }

        function createTwitchPlayer(stream, divId, channel) {
            try {
                const player = new Twitch.Player(divId, {
                    width: '100%',
                    height: '100%',
                    channel: channel,
                    parent: [window.location.hostname],
                    autoplay: true,
                    muted: true,
                    controls: false
                });
                
                activePlayers[stream.id] = {
                    type: 'twitch',
                    instance: player,
                    url: stream.url,
                    muted: true,
                    volume: 50
                };
                updateFloatingTabVolume(stream.id);
                
                player.addEventListener(Twitch.Player.READY, () => {
                    player.setVolume(0.5);
                    player.play();
                });
                
                player.addEventListener(Twitch.Player.PLAY, () => {
                    const btn = document.querySelector(`#card-${stream.id} .play-pause-btn`);
                    updatePlayBtnIcon(btn, true);
                });
                
                player.addEventListener(Twitch.Player.PAUSE, () => {
                    const btn = document.querySelector(`#card-${stream.id} .play-pause-btn`);
                    updatePlayBtnIcon(btn, false);
                });
            } catch (e) {
                console.error('Error creating Twitch player instance: ', e);
            }
        }

        // Clean up a single stream player, timers, and its associated DOM
        function destroyPlayer(streamId) {
            if (!streamId) return;

            // 1. Cancel pending initialization timer if active
            if (pendingPlayerTimers[streamId]) {
                clearInterval(pendingPlayerTimers[streamId]);
                clearTimeout(pendingPlayerTimers[streamId]);
                delete pendingPlayerTimers[streamId];
            }

            // 2. Teardown active player instance
            const pObj = activePlayers[streamId];
            if (pObj) {
                try {
                    if (pObj.type === 'hls' && pObj.instance) {
                        pObj.instance.dispose();
                    } else if (pObj.type === 'youtube' && pObj.instance && typeof pObj.instance.destroy === 'function') {
                        pObj.instance.destroy();
                    } else if (pObj.type === 'twitch' && pObj.instance) {
                        if (typeof pObj.instance.pause === 'function') {
                            try { pObj.instance.pause(); } catch (e) {}
                        }
                        if (typeof pObj.instance.destroy === 'function') {
                            try { pObj.instance.destroy(); } catch (e) {}
                        }
                    } else if (pObj.type === 'iframe' && pObj.instance) {
                        try { pObj.instance.src = 'about:blank'; } catch (e) {}
                    }
                } catch (e) {
                    console.error('Error disposing player instance for ID ' + streamId, e);
                }
                delete activePlayers[streamId];
            }

            // 3. Stop weather animation if active
            if (activeWeatherAnimations[streamId]) {
                try {
                    if (typeof activeWeatherAnimations[streamId].stop === 'function') {
                        activeWeatherAnimations[streamId].stop();
                    }
                } catch (e) {}
                delete activeWeatherAnimations[streamId];
            }

            // 4. Blank and clear any child iframes inside the player container
            const playerContainer = document.getElementById(`player-container-${streamId}`);
            if (playerContainer) {
                playerContainer.querySelectorAll('iframe').forEach(ifr => {
                    try { ifr.src = 'about:blank'; } catch (e) {}
                });
                playerContainer.innerHTML = '';
            }

            // 5. Remove card from DOM
            const card = document.getElementById(`card-${streamId}`);
            if (card) {
                card.remove();
            }
        }

        // Clean up all resources
        function clearAllPlayers() {
            // Cancel all pending player timers
            for (const id in pendingPlayerTimers) {
                try {
                    clearInterval(pendingPlayerTimers[id]);
                    clearTimeout(pendingPlayerTimers[id]);
                } catch (e) {}
                delete pendingPlayerTimers[id];
            }

            // Destroy all active player instances
            const idsToDestroy = Object.keys(activePlayers);
            idsToDestroy.forEach(id => {
                destroyPlayer(id);
            });
            activePlayers = {};

            // Clean up any remaining weather animation loops
            for (const id in activeWeatherAnimations) {
                if (activeWeatherAnimations[id] && typeof activeWeatherAnimations[id].stop === 'function') {
                    try { activeWeatherAnimations[id].stop(); } catch (e) {}
                }
            }
            activeWeatherAnimations = {};
        }

        // Unified Playback Controls
        function togglePlay(streamId) {
            const pObj = activePlayers[streamId];
            if (!pObj) return;
            const btn = document.querySelector(`#card-${streamId} .play-pause-btn`);
            
            if (pObj.type === 'hls') {
                if (pObj.instance.paused()) {
                    pObj.instance.play();
                    updatePlayBtnIcon(btn, true);
                } else {
                    pObj.instance.pause();
                    updatePlayBtnIcon(btn, false);
                }
            } else if (pObj.type === 'youtube') {
                const yt = pObj.instance;
                if (typeof yt.getPlayerState === 'function') {
                    const state = yt.getPlayerState();
                    if (state === YT.PlayerState.PLAYING) {
                        yt.pauseVideo();
                        updatePlayBtnIcon(btn, false);
                    } else {
                        yt.playVideo();
                        updatePlayBtnIcon(btn, true);
                    }
                }
            } else if (pObj.type === 'twitch') {
                const tw = pObj.instance;
                if (tw.isPaused()) {
                    tw.play();
                    updatePlayBtnIcon(btn, true);
                } else {
                    tw.pause();
                    updatePlayBtnIcon(btn, false);
                }
            }
        }

        function toggleMute(streamId) {
            const pObj = activePlayers[streamId];
            if (!pObj) return;
            const btn = document.querySelector(`#card-${streamId} .volume-mute-btn`);
            const slider = document.querySelector(`#card-${streamId} .volume-slider`);
            
            let isMuted = false;
            if (pObj.type === 'hls') {
                isMuted = !pObj.instance.muted();
                pObj.instance.muted(isMuted);
            } else if (pObj.type === 'youtube') {
                isMuted = !pObj.instance.isMuted();
                if (isMuted) {
                    pObj.instance.mute();
                } else {
                    pObj.instance.unMute();
                }
            } else if (pObj.type === 'twitch') {
                isMuted = !pObj.instance.getMuted();
                pObj.instance.setMuted(isMuted);
            }
            
            pObj.muted = isMuted;
            updateMuteBtnIcon(btn, isMuted);
            slider.value = isMuted ? 0 : pObj.volume;
            
            // Update floating status tab volume icon
            updateFloatingTabVolume(streamId);
        }

        // Toggle mute across all active stream players
        function toggleMuteAll() {
            const ids = Object.keys(activePlayers);
            if (ids.length === 0) return;
            const anyUnmuted = ids.some(id => !activePlayers[id].muted);
            const targetMute = anyUnmuted;
            ids.forEach(id => {
                const p = activePlayers[id];
                if (p && p.muted !== targetMute) {
                    toggleMute(id);
                }
            });
        }

        function setStreamVolume(streamId, val) {
            const pObj = activePlayers[streamId];
            if (!pObj) return;
            const btn = document.querySelector(`#card-${streamId} .volume-mute-btn`);
            
            val = parseInt(val);
            pObj.volume = val;
            
            if (val === 0) {
                pObj.muted = true;
                updateMuteBtnIcon(btn, true);
            } else {
                pObj.muted = false;
                updateMuteBtnIcon(btn, false);
            }
            
            if (pObj.type === 'hls') {
                pObj.instance.muted(pObj.muted);
                pObj.instance.volume(val / 100);
            } else if (pObj.type === 'youtube') {
                if (pObj.muted) {
                    pObj.instance.mute();
                } else {
                    pObj.instance.unMute();
                    pObj.instance.setVolume(val);
                }
            } else if (pObj.type === 'twitch') {
                pObj.instance.setMuted(pObj.muted);
                pObj.instance.setVolume(val / 100);
            }
            
            // Update floating status tab volume icon
            updateFloatingTabVolume(streamId);
        }

        function fullscreenStream(streamId) {
            const container = document.getElementById(`player-container-${streamId}`);
            if (!container) return;
            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => {
                    console.error(`Error enabling fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        }

        function updatePlayBtnIcon(btn, isPlaying) {
            if (btn) btn.innerHTML = isPlaying ? PAUSE_SVG : PLAY_SVG;
        }

        function updateMuteBtnIcon(btn, isMuted) {
            if (btn) btn.innerHTML = isMuted ? MUTE_SVG : VOLUME_SVG;
        }

        // Fullscreen site toggle
        function toggleFS() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }

        // Auto-cycle channels or presets
        function toggleCycle() {
            const cycleBtn = document.getElementById('cycle-btn');
            if (cycleInterval) {
                clearInterval(cycleInterval);
                cycleInterval = null;
                cycleBtn.innerText = "Auto-Cycle: OFF";
                cycleBtn.classList.remove('active');
            } else {
                if (appState.rotatorMode === 'presets') {
                    const presets = getPresets();
                    if (presets.length <= 1) {
                        alert('Need at least 2 saved presets to Auto-Cycle Presets!');
                        return;
                    }
                    
                    let currentPresetIndex = 0;
                    
                    cycleInterval = setInterval(() => {
                        const currentPresets = getPresets();
                        if (currentPresets.length <= 1) {
                            toggleCycle();
                            return;
                        }
                        currentPresetIndex = (currentPresetIndex + 1) % currentPresets.length;
                        loadPreset(currentPresets[currentPresetIndex].name);
                    }, appState.rotatorInterval * 1000);
                    
                    cycleBtn.innerText = "Auto-Cycle Presets: ON";
                    cycleBtn.classList.add('active');
                    
                    // Load the first preset immediately to start the sequence
                    loadPreset(presets[0].name);
                } else {
                    const activeStreams = appState.streams.filter(s => s.active);
                    if (activeStreams.length <= 1) {
                        alert('Need at least 2 active streams to Auto-Cycle Streams!');
                        return;
                    }
                    
                    let currentIndex = activeStreams.findIndex(s => s.id === cinemaActiveStreamId);
                    if (currentIndex === -1) currentIndex = 0;
                    
                    cycleInterval = setInterval(() => {
                        const currentActive = appState.streams.filter(s => s.active);
                        if (currentActive.length <= 1) {
                            toggleCycle();
                            return;
                        }
                        currentIndex = (currentIndex + 1) % currentActive.length;
                        cinemaActiveStreamId = currentActive[currentIndex].id;
                        
                        if (appState.layout === 'cinema' && document.getElementById('panel-weather').classList.contains('hidden')) {
                            renderActiveStreams();
                        }
                    }, appState.rotatorInterval * 1000);
                    
                    cycleBtn.innerText = "Auto-Cycle Streams: ON";
                    cycleBtn.classList.add('active');
                }
            }
        }

        function handleLayoutChange(layoutName) {
            appState.layout = layoutName;
            persistState();
            
            showMainStreamsPanel();
            renderActiveStreams();
        }

        function toggleWeatherView() {
            const weatherPanel = document.getElementById('panel-weather');
            const streamPanel = document.getElementById('panel-streams');
            const weatherBtn = document.getElementById('btn-weather-view');
            
            const browserPanel = document.getElementById('panel-browser');
            const browserBtn = document.getElementById('btn-browser-view');
            
            if (weatherPanel.classList.contains('hidden')) {
                if (!appState.keepStreamsAlive) {
                    clearAllPlayers();
                } else {
                    const container = document.getElementById('grid-container');
                    if (container) {
                        container.querySelectorAll('.stream-card').forEach(c => c.classList.add('stream-hidden'));
                    }
                }
                
                weatherPanel.classList.remove('hidden');
                streamPanel.classList.add('hidden');
                weatherBtn.classList.add('active');
                
                if (browserPanel) browserPanel.classList.add('hidden');
                if (browserBtn) browserBtn.classList.remove('active');
                
                renderWeatherPanel();
            } else {
                weatherPanel.classList.add('hidden');
                streamPanel.classList.remove('hidden');
                weatherBtn.classList.remove('active');
                renderActiveStreams();
            }
        }

        // Modal triggers
        function openSettings() {
            document.getElementById('settings-modal').classList.add('open');
        }

        function openSettingsToTab(tabId) {
            openSettings();
            switchTab(tabId);
        }

        function closeSettings() {
            document.getElementById('settings-modal').classList.remove('open');
        }

        function closeSettingsOnOverlay(event) {
            if (event.target === document.getElementById('settings-modal')) {
                closeSettings();
            }
        }

        // Settings Modal navigation
        function switchTab(tabId) {
            document.querySelectorAll('.modal-tabs .tab-btn').forEach(b => {
                b.classList.remove('active');
                if (b.getAttribute('onclick').includes(tabId)) {
                    b.classList.add('active');
                }
            });
            document.querySelectorAll('.modal-body .tab-content').forEach(c => {
                c.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
            
            if (tabId === 'tab-presets') {
                populatePresetsTable();
            }
        }

        // Configure Form Submissions
        function handleAddStream(event) {
            event.preventDefault();
            const nameInput = document.getElementById('stream-name-input');
            const categoryInput = document.getElementById('stream-category-input');
            const typeInput = document.getElementById('stream-type-input');
            const urlInput = document.getElementById('stream-url-input');
            
            const name = nameInput.value.trim().substring(0, 100);
            const category = categoryInput ? categoryInput.value.trim().substring(0, 50) || 'General' : 'General';
            const type = typeInput.value.toLowerCase().trim();
            const rawUrl = urlInput.value.trim();
            
            if (!name || !rawUrl) return;

            const VALID_TYPES = ['hls', 'youtube', 'twitch', 'iframe', 'weather', 'notes'];
            if (!VALID_TYPES.includes(type)) {
                alert('Invalid stream type selected.');
                return;
            }

            const safeUrl = sanitizeUrl(rawUrl, type);
            if (safeUrl === 'about:blank' && type !== 'notes' && type !== 'weather') {
                alert('Please enter a valid HTTP or HTTPS stream URL.');
                return;
            }
            
            const newStream = {
                id: 'custom-' + Date.now(),
                name: name,
                url: safeUrl,
                type: type,
                category: category,
                active: true,
                isDefault: false
            };
            
            appState.streams.push(newStream);
            persistState();
            
            // Reset fields
            nameInput.value = '';
            if (categoryInput) categoryInput.value = '';
            urlInput.value = '';
            
            populateSidebarCategories();
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        async function handleSaveLocation(event) {
            event.preventDefault();
            let locationVal = document.getElementById('location-input').value.trim();
            const timezoneVal = document.getElementById('timezone-select').value;
            
            if (!locationVal) return;

            // Localize 5-digit US zip codes down to neighborhood/city
            if (/^\d{5}$/.test(locationVal)) {
                try {
                    const resolved = await resolveZipcodeToNeighborhood(locationVal);
                    if (resolved && resolved.name) {
                        locationVal = resolved.name;
                        const inputEl = document.getElementById('location-input');
                        if (inputEl) inputEl.value = locationVal;
                    }
                } catch (e) {
                    console.warn('[Location] Failed to localize zipcode:', e);
                }
            }
            
            appState.location = locationVal;
            appState.timezone = timezoneVal;
            
            // Invalidate weather forecast cache to force immediate fetch of new location
            weatherForecastCache = null;
            weatherForecastLocation = null;
            weatherForecastTimestamp = 0;
            weatherForecastPromise = null;

            persistState();
            
            updateHeaderLocation();
            updateWeatherBadge(appState.location);
            renderWeatherPanel();
            refreshWeatherDisplays();
            
            alert(`Location settings updated to ${locationVal}!`);
            closeSettings();
        }

        // Populate settings table dynamically
        function populateSettings() {
            const tbody = document.getElementById('streams-table-body');
            tbody.innerHTML = '';
            const fragment = document.createDocumentFragment();
            
            appState.streams.forEach((s, idx) => {
                const tr = document.createElement('tr');
                
                // Active checkbox
                const checkboxCell = document.createElement('td');
                checkboxCell.innerHTML = `
                    <label class="checkbox-container">
                        <input type="checkbox" ${s.active ? 'checked' : ''} onchange="toggleStreamActive('${s.id}', this.checked)">
                    </label>
                `;
                tr.appendChild(checkboxCell);
                
                // Name
                const nameCell = document.createElement('td');
                nameCell.innerText = s.name;
                tr.appendChild(nameCell);
                
                // Category
                const categoryCell = document.createElement('td');
                categoryCell.innerText = s.category || 'General';
                tr.appendChild(categoryCell);
                
                // Type
                const typeCell = document.createElement('td');
                typeCell.innerHTML = `<span class="stream-type-badge">${s.type}</span>`;
                tr.appendChild(typeCell);
                
                // URL
                const urlCell = document.createElement('td');
                urlCell.innerText = s.url;
                urlCell.style.maxWidth = '200px';
                urlCell.style.overflow = 'hidden';
                urlCell.style.textOverflow = 'ellipsis';
                urlCell.style.whiteSpace = 'nowrap';
                tr.appendChild(urlCell);
                
                // Order actions & delete button
                const actionCell = document.createElement('td');
                actionCell.className = 'table-action-group';
                
                const upBtn = document.createElement('button');
                upBtn.className = 'btn btn-icon';
                upBtn.innerHTML = '&uarr;';
                upBtn.disabled = idx === 0;
                upBtn.onclick = () => moveStream(s.id, 'up');
                
                const downBtn = document.createElement('button');
                downBtn.className = 'btn btn-icon';
                downBtn.innerHTML = '&darr;';
                downBtn.disabled = idx === appState.streams.length - 1;
                downBtn.onclick = () => moveStream(s.id, 'down');
                
                actionCell.appendChild(upBtn);
                actionCell.appendChild(downBtn);
                
                if (!s.isDefault) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-danger btn-sm btn-icon';
                    deleteBtn.innerText = 'Del';
                    deleteBtn.onclick = () => deleteStream(s.id);
                    actionCell.appendChild(deleteBtn);
                } else {
                    const label = document.createElement('span');
                    label.innerText = ' Sys';
                    label.style.color = 'var(--text-muted)';
                    label.style.fontSize = '0.7rem';
                    label.style.lineHeight = '2.2';
                    actionCell.appendChild(label);
                }
                
                tr.appendChild(actionCell);
                fragment.appendChild(tr);
            });
            tbody.appendChild(fragment);

            // Populate rotator settings in modal
            const modeSelect = document.getElementById('rotator-mode-select');
            const intervalInput = document.getElementById('rotator-interval-input');
            const keepAliveToggle = document.getElementById('keep-streams-alive-toggle');
            if (modeSelect) modeSelect.value = appState.rotatorMode;
            if (intervalInput) intervalInput.value = appState.rotatorInterval;
            if (keepAliveToggle) keepAliveToggle.checked = !!appState.keepStreamsAlive;
        }

        function toggleStreamActive(id, checked) {
            const s = appState.streams.find(st => st.id === id);
            if (s) {
                s.active = checked;
                persistState();
                
                const activeStreams = appState.streams.filter(st => st.active);
                if (activeStreams.length <= 1 && cycleInterval) {
                    toggleCycle();
                }
                
                renderActiveStreams();
                renderSidebarStreams();
                populateSettings();
            }
        }

        function moveStream(id, direction) {
            const idx = appState.streams.findIndex(s => s.id === id);
            if (idx === -1) return;
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (targetIdx < 0 || targetIdx >= appState.streams.length) return;
            
            // Swap array positioning
            const temp = appState.streams[idx];
            appState.streams[idx] = appState.streams[targetIdx];
            appState.streams[targetIdx] = temp;
            
            persistState();
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        function placeStreamAtActiveIndex(streamId, slotIndex) {
            const stream = appState.streams.find(s => s.id === streamId);
            if (!stream) return;

            // Make sure the stream is active
            stream.active = true;

            // Get all active streams excluding the one we are placing
            const activeStreams = appState.streams.filter(s => s.active && s.id !== streamId);

            // Insert the stream at the target slot index among other active streams
            activeStreams.splice(slotIndex, 0, stream);

            // Reconstruct appState.streams: active streams in new order, then inactive streams
            const inactiveStreams = appState.streams.filter(s => !s.active);
            appState.streams = [...activeStreams, ...inactiveStreams];

            persistState();
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        function deleteStream(id) {
            const index = appState.streams.findIndex(s => s.id === id);
            if (index === -1) return;
            
            appState.streams.splice(index, 1);
            persistState();
            
            populateSidebarCategories();
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        function resetToSystemDefaults() {
            if (confirm("Are you sure you want to reset all configurations? This will wipe your settings and custom streams.")) {
                removeStoredItem('stream_layout');
                removeStoredItem('user_streams');
                removeStoredItem('active_stream_ids');
                removeStoredItem('stream_order');
                removeStoredItem('location_config');
                removeStoredItem('rotator_config');
                removeStoredItem('layout_presets');
                removeStoredItem('sidebar_collapsed');
                
                appState.layout = 'cinema';
                appState.location = "Galveston";
                appState.timezone = "America/Chicago";
                
                if (cycleInterval) {
                    clearInterval(cycleInterval);
                    cycleInterval = null;
                    const cycleBtn = document.getElementById('cycle-btn');
                    cycleBtn.innerText = "Auto-Cycle: OFF";
                    cycleBtn.classList.remove('active');
                }
                
                initApp();
                closeSettings();
                alert('Wiped state and restored system defaults!');
            }
        }

        // --- NEW FEATURES IMPLEMENTATION ---

        // 1. Categories Management
        function populateSidebarCategories() {
            const categorySelect = document.getElementById('sidebar-category-select');
            if (!categorySelect) return;
            
            const currentValue = categorySelect.value;
            
            const categories = new Set();
            appState.streams.forEach(s => {
                const cat = s.category || 'General';
                categories.add(cat.trim());
            });
            
            categorySelect.innerHTML = '<option value="all">All Categories</option>';
            
            Array.from(categories).sort().forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.toLowerCase();
                opt.innerText = cat;
                categorySelect.appendChild(opt);
            });
            
            if (currentValue && Array.from(categories).some(c => c.toLowerCase() === currentValue)) {
                categorySelect.value = currentValue;
            } else {
                categorySelect.value = 'all';
            }
        }

        // 2. Presets Management
        function getPresets() {
            const saved = getStoredItem('layout_presets');
            if (!saved) return [];
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Error parsing layout presets storage", e);
                return [];
            }
        }

        function updatePresetDropdown() {
            const dropdown = document.getElementById('preset-select-dropdown');
            if (!dropdown) return;
            
            dropdown.innerHTML = '<option value="">-- Load Preset --</option>';
            
            const presets = getPresets();
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.innerText = p.name;
                dropdown.appendChild(opt);
            });
        }

        function handlePresetChange(name) {
            if (!name) return;
            loadPreset(name);
            document.getElementById('preset-select-dropdown').value = '';
        }

        function promptSavePreset() {
            const name = prompt("Enter a name for the current layout preset:");
            if (name) {
                const trimmed = name.trim();
                if (trimmed) {
                    savePreset(trimmed);
                    alert(`Preset "${trimmed}" saved!`);
                }
            }
        }

        function savePreset(name) {
            if (!name) return;
            const activeStreams = appState.streams.filter(s => s.active);
            const activeStreamIds = activeStreams.map(s => s.id);
            
            const presets = getPresets();
            const existingIdx = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
            
            const presetData = {
                name: name,
                layout: appState.layout,
                activeStreamIds: activeStreamIds
            };
            
            if (existingIdx !== -1) {
                presets[existingIdx] = presetData;
            } else {
                presets.push(presetData);
            }
            
            setStoredItem('layout_presets', JSON.stringify(presets));
            updatePresetDropdown();
            populatePresetsTable();
        }

        function deletePreset(name) {
            let presets = getPresets();
            presets = presets.filter(p => p.name.toLowerCase() !== name.toLowerCase());
            setStoredItem('layout_presets', JSON.stringify(presets));
            updatePresetDropdown();
            populatePresetsTable();
        }

        function loadPreset(presetName) {
            const presets = getPresets();
            const preset = presets.find(p => p.name.toLowerCase() === presetName.toLowerCase());
            if (!preset) return;
            
            appState.layout = preset.layout;
            document.getElementById('layout-select-dropdown').value = preset.layout;
            showMainStreamsPanel();
            
            appState.streams.forEach(s => {
                s.active = preset.activeStreamIds.includes(s.id);
            });
            
            const activeStreams = [];
            const inactiveStreams = [];
            
            preset.activeStreamIds.forEach(id => {
                const s = appState.streams.find(st => st.id === id);
                if (s) activeStreams.push(s);
            });
            
            appState.streams.forEach(s => {
                if (!preset.activeStreamIds.includes(s.id)) {
                    inactiveStreams.push(s);
                }
            });
            
            appState.streams = [...activeStreams, ...inactiveStreams];
            
            persistState();
            renderActiveStreams();
            renderSidebarStreams();
            populateSettings();
        }

        function populatePresetsTable() {
            const tbody = document.getElementById('presets-table-body');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            const presets = getPresets();
            
            if (presets.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px 0;">
                            No presets saved yet. Set up your layout and click the save button in the header.
                        </td>
                    </tr>
                `;
                return;
            }
            
            const fragment = document.createDocumentFragment();
            presets.forEach(p => {
                const tr = document.createElement('tr');
                
                const nameCell = document.createElement('td');
                nameCell.innerText = p.name;
                tr.appendChild(nameCell);
                
                const layoutCell = document.createElement('td');
                layoutCell.innerText = p.layout;
                tr.appendChild(layoutCell);
                
                const countCell = document.createElement('td');
                countCell.innerText = p.activeStreamIds.length;
                tr.appendChild(countCell);
                
                const actionCell = document.createElement('td');
                actionCell.style.textAlign = 'center';
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger btn-sm';
                delBtn.innerText = 'Delete';
                delBtn.onclick = () => {
                    if (confirm(`Are you sure you want to delete preset "${p.name}"?`)) {
                        deletePreset(p.name);
                    }
                };
                actionCell.appendChild(delBtn);
                tr.appendChild(actionCell);
                
                fragment.appendChild(tr);
            });
            tbody.appendChild(fragment);
        }

        // 3. Multi-Monitor Pop-out Management
        function popoutStream(streamId) {
            const stream = appState.streams.find(s => s.id === streamId);
            if (!stream) return;
            
            const name = escapeHtml(stream.name);
            const url = sanitizeUrl(stream.url);
            const escapedUrl = escapeHtml(url);
            const type = stream.type;
            
            const w = 800;
            const h = 480;
            const left = (screen.width / 2) - (w / 2);
            const top = (screen.height / 2) - (h / 2);
            
            const popWin = window.open('', `popout_${streamId}`, `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no`);
            if (!popWin) {
                alert('Pop-up window was blocked! Please allow pop-ups for this site.');
                return;
            }
            popWin.opener = null;
            
            let playerHtml = '';
            if (type === 'hls') {
                playerHtml = `
                    <video id="pop-player" class="video-js vjs-default-skin vjs-big-play-centered" controls autoplay playsinline style="width:100%; height:100vh;">
                        <source src="${escapedUrl}" type="application/x-mpegURL">
                    </video>
                    <script src="https://vjs.zencdn.net/8.10.0/video.js" integrity="sha384-SP4kHUZoQ2oygHagiNEmaLGBfCNAu1Q0idIJrYs7Cpzj6m4PZeECCXlU1S+ZEs+z" crossorigin="anonymous"></script>
                    <script>
                        videojs('pop-player', {
                            autoplay: true,
                            controls: true,
                            fluid: false
                        });
                    </script>
                `;
            } else if (type === 'youtube') {
                let videoId = url;
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                    const match = url.match(regExp);
                    if (match && match[2].length === 11) {
                        videoId = match[2];
                    }
                }
                const escapedVideoId = escapeHtml(videoId);
                playerHtml = `
                    <iframe src="https://www.youtube.com/embed/${escapedVideoId}?autoplay=1&mute=0&controls=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%; height:100vh; border:none;"></iframe>
                `;
            } else if (type === 'twitch') {
                playerHtml = `
                    <iframe src="https://player.twitch.tv/?channel=${escapedUrl}&parent=${window.location.hostname}&autoplay=true" frameborder="0" allowfullscreen="true" scrolling="no" style="width:100%; height:100vh; border:none;"></iframe>
                `;
            } else {
                playerHtml = `
                    <iframe src="${escapedUrl}" frameborder="0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" allow="autoplay; encrypted-media; fullscreen" allowfullscreen style="width:100%; height:100vh; border:none;"></iframe>
                `;
            }
            
            popWin.document.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>${name} - Live Stream Viewer Pop-out</title>
                    <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet" integrity="sha384-6LeG/ONVwTyNrI1eNFYoIcUrglv6y7o8hvl3DB8Qd4K2/wD8niobYgHS3RJSO7uL" crossorigin="anonymous" />
                    <style>
                        body, html {
                            margin: 0;
                            padding: 0;
                            width: 100%;
                            height: 100%;
                            background-color: #030712;
                            overflow: hidden;
                        }
                    </style>
                </head>
                <body>
                    ${playerHtml}
                </body>
                </html>
            `);
            popWin.document.close();
        }

        // 4. Animated Weather Cam Stream Widget
        function initializeWeatherCam(stream) {
            const container = document.getElementById(`player-container-${stream.id}`);
            if (!container) return;
            
            container.innerHTML = `
                <div class="weather-cam-widget" id="weather-cam-widget-${stream.id}">
                    <canvas id="canvas-weather-${stream.id}" class="weather-canvas"></canvas>
                    <div class="wc-content-layer" id="wc-content-${stream.id}">
                        <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding-top: 40px;">
                            Initializing Local Weather Cam...
                        </div>
                    </div>
                </div>
            `;
            
            fetchWeatherForecast(appState.location)
                .then(data => {
                    const temp = Math.round(data.current.temperature_2m);
                    const code = data.current.weather_code;
                    const desc = getWeatherDescription(code);
                    const isDay = data.current.is_day === 1;
                    const aqi = data.aqi || {};
                    const displayLocation = data.localizedLocation || appState.location;
                    const uvInfo = getUvCategory(data.current.uv_index);
                    const aqiInfo = getAqiCategory(aqi.us_aqi);
                    const weatherEmoji = getWeatherEmoji(code);
                    const feelsLike = Math.round(data.current.apparent_temperature || data.current.temperature_2m);
                    const todayMax = data.daily?.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : temp;
                    const todayMin = data.daily?.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : temp;
                    const theme = getWeatherTheme(code, isDay);
                    
                    const widget = document.getElementById(`weather-cam-widget-${stream.id}`);
                    if (!widget) return;
                    widget.className = `weather-cam-widget ${theme}`;

                    // 1. Next 5 Hours Timeline (Larger cards)
                    let hourlyHtml = '';
                    if (data.hourly && data.hourly.time) {
                        const nowTime = Date.now();
                        let startHourIdx = 0;
                        for (let i = 0; i < data.hourly.time.length; i++) {
                            const t = new Date(data.hourly.time[i]).getTime();
                            if (t >= (nowTime - 3600000)) {
                                startHourIdx = i;
                                break;
                            }
                        }
                        const endHourIdx = Math.min(data.hourly.time.length, startHourIdx + 5);
                        for (let i = startHourIdx; i < endHourIdx; i++) {
                            const dateObj = new Date(data.hourly.time[i]);
                            const isNow = (i === startHourIdx);
                            const timeLabel = isNow ? 'Now' : dateObj.toLocaleTimeString([], { hour: 'numeric' });
                            const hEmoji = getWeatherEmoji(data.hourly.weather_code[i]);
                            const hTemp = Math.round(data.hourly.temperature_2m[i]);
                            const hPop = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[i] : 0;
                            const popHtml = (hPop > 15) ? `<span class="wc-hc-pop">💧${hPop}%</span>` : '';
                            hourlyHtml += `
                                <div class="wc-hourly-card">
                                    <span class="wc-hc-time">${timeLabel}</span>
                                    <span class="wc-hc-emoji">${hEmoji}</span>
                                    <span class="wc-hc-temp">${hTemp}°</span>
                                    ${popHtml}
                                </div>
                            `;
                        }
                    }
                    
                    // 2. 5-Day Daily Forecast Cards (Matching 5-col layout)
                    let forecastHtml = '';
                    for (let i = 1; i <= 5; i++) {
                        const dateStr = data.daily.time[i];
                        const dateObj = new Date(dateStr + 'T00:00:00');
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                        
                        const dayCode = data.daily.weather_code[i];
                        const dayEmoji = getWeatherEmoji(dayCode);
                        const dayDesc = getWeatherDescription(dayCode);
                        const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
                        const minTemp = Math.round(data.daily.temperature_2m_min[i]);
                        
                        forecastHtml += `
                            <div class="wc-forecast-day">
                                <span class="wc-fd-name">${dayName}</span>
                                <span class="wc-fd-emoji" title="${dayDesc}">${dayEmoji}</span>
                                <span class="wc-fd-temps">
                                    <span class="wc-fd-max">${maxTemp}°</span>
                                    <span class="wc-fd-min">${minTemp}°</span>
                                </span>
                            </div>
                        `;
                    }
                    
                    const contentEl = document.getElementById(`wc-content-${stream.id}`);
                    if (contentEl) {
                        contentEl.innerHTML = `
                            <div class="wc-header-card">
                                <div class="wc-info-block">
                                    <div class="wc-location">${escapeHtml(displayLocation)}</div>
                                    <div class="wc-temp-row">
                                        <span class="wc-current-temp">${temp}°F</span>
                                        <span class="wc-desc-tag">${desc}</span>
                                    </div>
                                    <div class="wc-sub-row">
                                        <span>H: ${todayMax}° • L: ${todayMin}°</span>
                                        <span>Feels ${feelsLike}°</span>
                                    </div>
                                </div>
                                <div class="wc-header-right">
                                    <div class="wc-main-emoji">${weatherEmoji}</div>
                                    <div class="wc-badges-col">
                                        <span class="wc-mini-badge" style="border-color: ${uvInfo.color}; color: ${uvInfo.color};">UV ${uvInfo.val}</span>
                                        <span class="wc-mini-badge" style="border-color: ${aqiInfo.color}; color: ${aqiInfo.color};">AQI ${aqiInfo.val}</span>
                                    </div>
                                </div>
                            </div>
                            ${hourlyHtml ? `<div class="wc-hourly-grid">${hourlyHtml}</div>` : ''}
                            <div class="wc-forecast-grid">
                                ${forecastHtml}
                            </div>
                        `;
                    }
                    
                    const canvas = document.getElementById(`canvas-weather-${stream.id}`);
                    if (canvas) {
                        if (activeWeatherAnimations[stream.id]) {
                            activeWeatherAnimations[stream.id].stop();
                        }
                        activeWeatherAnimations[stream.id] = initWeatherAnimation(canvas, code, isDay);
                    }
                })
                .catch(err => {
                    console.error('Error rendering weather stream widget:', err);
                    const widget = document.getElementById(`weather-cam-widget-${stream.id}`);
                    if (widget) {
                        widget.innerHTML = `
                            <div style="text-align: center; color: #ef4444; font-size: 0.85rem; padding-top: 40px;">
                                Weather Stream Cam Offline
                            </div>
                        `;
                    }
                });
        }

        function initWeatherAnimation(canvas, code, isDay) {
            const ctx = canvas.getContext('2d');
            let animationId;
            
            function resize() {
                if (!canvas.parentNode) return;
                const rect = canvas.parentNode.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
            }
            resize();
            const resizeObserver = new ResizeObserver(() => {
                resize();
            });
            if (canvas.parentNode) {
                resizeObserver.observe(canvas.parentNode);
            }
            
            let particles = [];
            let time = 0;
            
            const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
            const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
            const isStorm = [95, 96, 99].includes(code);
            
            if (isRain) {
                const count = isStorm ? 70 : 35;
                for (let i = 0; i < count; i++) {
                    particles.push({
                        x: Math.random() * 800,
                        y: Math.random() * 600,
                        vy: 8 + Math.random() * 6,
                        vx: -1.5 - Math.random() * 1.5,
                        len: 12 + Math.random() * 10
                    });
                }
            } else if (isSnow) {
                const count = 35;
                for (let i = 0; i < count; i++) {
                    particles.push({
                        x: Math.random() * 800,
                        y: Math.random() * 600,
                        vy: 1 + Math.random() * 1.5,
                        vx: -1.0 + Math.random() * 2.0,
                        r: 2 + Math.random() * 3,
                        density: Math.random()
                    });
                }
            }
            
            function tick() {
                time++;
                // Keep canvas transparent so vibrant CSS weather background shows with full brilliance
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if (isStorm && Math.random() < 0.007) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.18 + Math.random() * 0.25})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                if (!isDay && !isRain && !isSnow) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                    for (let i = 0; i < 22; i++) {
                        const starX = (Math.sin(i * 123.45) * 0.5 + 0.5) * canvas.width;
                        const starY = (Math.cos(i * 543.21) * 0.5 + 0.5) * (canvas.height * 0.75);
                        const flicker = 0.35 + Math.sin(time * 0.05 + i) * 0.65;
                        ctx.globalAlpha = Math.max(0.1, flicker);
                        ctx.fillRect(starX, starY, 1.8, 1.8);
                    }
                    ctx.globalAlpha = 1.0;
                }
                
                if (isRain) {
                    ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
                    ctx.lineWidth = 1.5;
                    particles.forEach(p => {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x + p.vx, p.y + p.len);
                        ctx.stroke();
                        
                        p.x += p.vx;
                        p.y += p.vy;
                        
                        if (p.y > canvas.height) {
                            p.y = -p.len;
                            p.x = Math.random() * canvas.width;
                        }
                    });
                } else if (isSnow) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    particles.forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                        ctx.fill();
                        
                        p.y += p.vy;
                        p.x += Math.sin(time * 0.02 + p.density) * 0.5;
                        
                        if (p.y > canvas.height) {
                            p.y = -10;
                            p.x = Math.random() * canvas.width;
                        }
                    });
                }
                
                animationId = requestAnimationFrame(tick);
            }
            
            tick();
            
            return {
                stop: () => {
                    cancelAnimationFrame(animationId);
                    resizeObserver.disconnect();
                }
            };
        }

        function getVolumeSymbol(muted, volume) {
            if (muted || volume === 0) return '🔇';
            if (volume <= 33) return '🔈';
            if (volume <= 66) return '🔉';
            return '🔊';
        }

        function updateFloatingTabVolume(streamId) {
            const pObj = activePlayers[streamId];
            const volumeIndicator = document.getElementById(`sst-volume-${streamId}`);
            if (!volumeIndicator) return;
            if (!pObj) {
                volumeIndicator.innerText = '🔇';
                return;
            }
            volumeIndicator.innerText = getVolumeSymbol(pObj.muted, pObj.volume);
        }

        // --- Surveillance Console Feature Helpers ---

        function pingStreamStatus(streamId) {
            const stream = appState.streams.find(s => s.id === streamId);
            if (!stream) return;

            if (['youtube', 'twitch', 'weather', 'notes'].includes(stream.type.toLowerCase())) {
                streamUptimeStatuses[streamId] = 'online';
                updateSidebarStatusDot(streamId, 'online');
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            // Fetch with mode: 'no-cors' to prevent CORS blockages on direct HEAD calls
            fetch(stream.url, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' })
                .then(() => {
                    clearTimeout(timeoutId);
                    streamUptimeStatuses[streamId] = 'online';
                    updateSidebarStatusDot(streamId, 'online');
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    const subController = new AbortController();
                    const subTimeoutId = setTimeout(() => subController.abort(), 4000);
                    fetch(stream.url, { method: 'GET', signal: subController.signal, mode: 'no-cors' })
                        .then(() => {
                            clearTimeout(subTimeoutId);
                            streamUptimeStatuses[streamId] = 'online';
                            updateSidebarStatusDot(streamId, 'online');
                        })
                        .catch(() => {
                            clearTimeout(subTimeoutId);
                            streamUptimeStatuses[streamId] = 'offline';
                            updateSidebarStatusDot(streamId, 'offline');
                        });
                });
        }

        function updateSidebarStatusDot(streamId, status) {
            const dot = document.getElementById(`sidebar-status-dot-${streamId}`);
            if (!dot) return;
            dot.className = `status-dot-mini ${status}`;
            dot.title = status === 'checking' ? 'Checking status...' : (status === 'online' ? 'Stream online' : 'Stream offline / inaccessible');
        }

        function checkAllStreamsStatus() {
            appState.streams.forEach(stream => {
                if (!streamUptimeStatuses[stream.id] || streamUptimeStatuses[stream.id] === 'offline') {
                    pingStreamStatus(stream.id);
                }
            });
        }

        function updateRotatorSettings() {
            const modeSelect = document.getElementById('rotator-mode-select');
            const intervalInput = document.getElementById('rotator-interval-input');
            const keepAliveToggle = document.getElementById('keep-streams-alive-toggle');
            if (modeSelect) appState.rotatorMode = modeSelect.value;
            if (intervalInput) appState.rotatorInterval = parseInt(intervalInput.value) || 30;

            const prevKeepAlive = appState.keepStreamsAlive;
            if (keepAliveToggle) appState.keepStreamsAlive = keepAliveToggle.checked;
            persistState();

            // If user turned OFF keepStreamsAlive, clean up any currently hidden background cards
            if (prevKeepAlive && !appState.keepStreamsAlive) {
                renderActiveStreams();
            }
            
            if (cycleInterval) {
                toggleCycle();
                toggleCycle();
            }
        }

        function captureSnapshot(streamId) {
            const stream = appState.streams.find(s => s.id === streamId);
            if (!stream) return;
            
            if (stream.type === 'hls') {
                const video = document.getElementById(`video-${streamId}_html5_api`) || document.getElementById(`video-${streamId}`);
                if (!video) {
                    alert("Video element not found for snapshot.");
                    return;
                }
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || video.clientWidth || 640;
                    canvas.height = video.videoHeight || video.clientHeight || 360;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    const dataUrl = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `Snapshot_${stream.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
                    link.href = dataUrl;
                    link.click();
                } catch (err) {
                    console.error("CORS security policy blocked HLS snapshot:", err);
                    alert("Unable to capture snapshot. The video stream source does not permit cross-origin image sharing (CORS).");
                }
            } else if (stream.type === 'weather') {
                const canvas = document.getElementById(`canvas-weather-${streamId}`);
                if (!canvas) {
                    alert("Weather canvas not found.");
                    return;
                }
                try {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(canvas, 0, 0);
                    
                    const dataUrl = tempCanvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `WeatherCam_${stream.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
                    link.href = dataUrl;
                    link.click();
                } catch (err) {
                    alert("Failed to capture weather cam snapshot.");
                }
            }
        }

        function initializeNotesWidget(stream) {
            const container = document.getElementById(`player-container-${stream.id}`);
            if (!container) return;
            
            const savedText = getStoredItem(`notes_content_${stream.id}`) || '';
            
            container.innerHTML = `
                <div class="notes-widget-container">
                    <textarea 
                        class="notes-textarea" 
                        id="notes-textarea-${stream.id}" 
                        placeholder="Console Log & Notes...&#10;Record stream events, time observations, or custom logs here."
                        oninput="saveNotesContent('${stream.id}', this.value)"
                    >${escapeHtml(savedText)}</textarea>
                </div>
            `;
        }

        function saveNotesContent(streamId, val) {
            setStoredItem(`notes_content_${streamId}`, val);
        }

        // --- Public Stream Directory Browser ---

        const PUBLIC_STREAM_DIRECTORY = [
            { name: "NASA TV Live", url: "https://www.youtube.com/watch?v=21X5lGlDOfg", type: "youtube", category: "Nature & Space", desc: "Official live stream of NASA television, featuring space exploration updates, ISS coverage, and launches.", emoji: "🪐" },
            { name: "Tokyo Shibuya Crossing", url: "https://www.youtube.com/watch?v=H-30B0cqh88", type: "youtube", category: "Cities", desc: "Real-time webcam viewing the world-famous Shibuya crossing in Tokyo, Japan.", emoji: "🏙️" },
            { name: "ABC News Live", url: "https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master_4000.m3u8", type: "hls", category: "News", desc: "24/7 breaking news broadcasts, reports, and detailed interviews from ABC News.", emoji: "📺" },
            { name: "DW News Live", url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8", type: "hls", category: "News", desc: "Deutsche Welle international broadcast channel offering reports and global viewpoints.", emoji: "📰" },
            { name: "Al Jazeera English", url: "https://live-hls-web-aja2-gcp.thehlive.com/AJA2/index.m3u8", type: "hls", category: "News", desc: "Al Jazeera English international live broadcast news channel.", emoji: "📡" },
            { name: "France 24 English", url: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_2300.m3u8", type: "hls", category: "News", desc: "France 24 English live stream, international breaking news and reports.", emoji: "🇫🇷" },
            { name: "NHK World Japan", url: "https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8", type: "hls", category: "News", desc: "NHK World-Japan English language live channel covering Japanese news, culture, and lifestyle.", emoji: "🇯🇵" },
            { name: "Galveston Harbor Cam", url: "https://usw01-smr04-relay.ozolio.com/hls-live/_definst_/relay01.zcsqd9k.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Cities", desc: "High-definition streaming cam overlooking the harbor view of Galveston, Texas.", emoji: "🚢" },
            { name: "Galveston Seawall Cam", url: "https://usw01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.ranl5w.fd0.sm1.av1.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Cities", desc: "Scenic webcam overlooking the famous boardwalk, seawall and beach of Galveston, Texas.", emoji: "🌴" },
            { name: "Galveston Skycam North", url: "https://use01-smr05-relay.ozolio.com/hls-live/_definst_/relay01.fjfebpl.fd0.sm1.av2.mt0.at0.as0.dv0.sh2.rt31821.rc0.edge.basic.stream/playlist.m3u8", type: "hls", category: "Cities", desc: "A panoramic high-altitude view of the northern side of Galveston city.", emoji: "🧭" },
            { name: "PhillyCAM Live", url: "https://livestream.telvue.com/phillycam1/f7b44cfafd5c52223d5498196c8a2e7b.sdp/playlist.m3u8", type: "hls", category: "Cities", desc: "Philadelphia community access television stream covering city events and stories.", emoji: "🔔" },
            { name: "Escambia Florida Beach Cam", url: "https://cpcdn.azureedge.net/ESCAMBIACOFLLIVE1/ESCAMBIACOFLLIVE1/playlist.m3u8", type: "hls", category: "Cities", desc: "Scenic webcam overlooking Pensacola Beach in Escambia County, Florida.", emoji: "⛱️" }
        ];

        let verifiedDirectoryStreams = {}; // Cache map: url -> 'online' | 'offline'
        let isDirectoryVerifying = false;
        let directoryVerificationStarted = false;

        async function checkDirectoryStreamUsability(item) {
            if (verifiedDirectoryStreams[item.url]) {
                return verifiedDirectoryStreams[item.url];
            }

            try {
                if (item.type === 'youtube') {
                    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(item.url)}&format=json`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6000);
                    
                    const response = await fetch(oembedUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        verifiedDirectoryStreams[item.url] = 'online';
                    } else {
                        verifiedDirectoryStreams[item.url] = 'offline';
                    }
                } else {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6000);
                    try {
                        await fetch(item.url, { 
                            method: 'HEAD', 
                            mode: 'no-cors',
                            signal: controller.signal 
                        });
                        clearTimeout(timeoutId);
                        verifiedDirectoryStreams[item.url] = 'online';
                    } catch (e) {
                        clearTimeout(timeoutId);
                        const getController = new AbortController();
                        const getTimeoutId = setTimeout(() => getController.abort(), 6000);
                        await fetch(item.url, {
                            method: 'GET',
                            mode: 'no-cors',
                            signal: getController.signal
                        });
                        clearTimeout(getTimeoutId);
                        verifiedDirectoryStreams[item.url] = 'online';
                    }
                }
            } catch (err) {
                console.warn(`Stream verification failed for "${item.name}":`, err);
                verifiedDirectoryStreams[item.url] = 'offline';
            }
            return verifiedDirectoryStreams[item.url];
        }

        async function verifyPublicDirectoryStreams() {
            if (isDirectoryVerifying) return;

            const unverified = PUBLIC_STREAM_DIRECTORY.filter(item => !verifiedDirectoryStreams[item.url]);
            if (unverified.length === 0) {
                renderPublicStreamBrowser();
                return;
            }

            isDirectoryVerifying = true;
            renderPublicStreamBrowser();

            const BATCH_SIZE = 4;
            for (let i = 0; i < unverified.length; i += BATCH_SIZE) {
                // If user closed or navigated away from the browser panel, pause further batches
                const panel = document.getElementById('panel-browser');
                if (!panel || panel.classList.contains('hidden')) {
                    console.log('[Directory] Paused background stream verification (panel closed).');
                    break;
                }

                const batch = unverified.slice(i, i + BATCH_SIZE);
                await Promise.allSettled(batch.map(item => checkDirectoryStreamUsability(item)));
                
                // Progressively update grid as each batch completes
                if (panel && !panel.classList.contains('hidden')) {
                    renderPublicStreamBrowser();
                }
            }

            isDirectoryVerifying = false;
            const panel = document.getElementById('panel-browser');
            if (panel && !panel.classList.contains('hidden')) {
                renderPublicStreamBrowser();
            }
        }

        let activePreviewPlayer = null;

        // Alias canonical getYouTubeId for backwards compatibility
        const getYoutubeId = getYouTubeId;

        function previewDirectoryStream(item) {
            const modal = document.getElementById('preview-modal');
            if (!modal) return;

            document.getElementById('preview-stream-title').textContent = item.name;

            // Render action button container
            const isAlreadyAdded = appState.streams.some(s => s.url === item.url);
            const actionContainer = document.getElementById('preview-action-btn-container');
            if (actionContainer) {
                if (isAlreadyAdded) {
                    actionContainer.innerHTML = `<button class="btn btn-success" disabled style="background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; pointer-events: none;">Added ✓</button>`;
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-primary';
                    btn.innerText = 'Add to Dashboard';
                    btn.addEventListener('click', () => {
                        addDirectoryStreamFromPreview(item.name, item.url, item.type, item.category);
                    });
                    actionContainer.innerHTML = '';
                    actionContainer.appendChild(btn);
                }
            }

            modal.classList.add('open');

            // Setup the player inside #preview-player-container
            const container = document.getElementById('preview-player-container');
            container.innerHTML = '';

            if (item.type === 'youtube') {
                const videoId = getYoutubeId(item.url);
                if (videoId) {
                    container.innerHTML = `
                        <iframe 
                            src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1" 
                            style="width: 100%; height: 100%; border: none;"
                            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                            allowfullscreen>
                        </iframe>
                    `;
                } else {
                    container.innerHTML = `<div style="color: var(--text-muted); display: flex; align-items: center; justify-content: center; height: 100%;">Invalid YouTube URL</div>`;
                }
            } else if (item.type === 'hls') {
                // Create a temporary video element for Video.js
                const videoEl = document.createElement('video');
                videoEl.id = 'preview-video-player';
                videoEl.className = 'video-js vjs-default-skin vjs-big-play-centered';
                videoEl.style.width = '100%';
                videoEl.style.height = '100%';
                videoEl.controls = true;
                videoEl.muted = true;
                videoEl.autoplay = true;
                videoEl.setAttribute('playsinline', 'true');
                
                const sourceEl = document.createElement('source');
                sourceEl.src = item.url;
                sourceEl.type = 'application/x-mpegURL';
                videoEl.appendChild(sourceEl);
                container.appendChild(videoEl);

                // Initialize Video.js player
                setTimeout(() => {
                    try {
                        activePreviewPlayer = videojs('preview-video-player', {
                            fluid: false,
                            responsive: true,
                            autoplay: 'any',
                            muted: true,
                            controls: true,
                            preload: 'auto'
                        });
                    } catch (e) {
                        console.error('Error initializing preview Video.js:', e);
                    }
                }, 50);
            } else {
                container.innerHTML = `<div style="color: var(--text-muted); display: flex; align-items: center; justify-content: center; height: 100%;">Preview not supported for this stream type.</div>`;
            }
        }

        function addDirectoryStreamFromPreview(name, url, type, category) {
            addDirectoryStream(name, url, type, category);
            // Re-render preview actions to update button state to "Added ✓"
            const actionContainer = document.getElementById('preview-action-btn-container');
            if (actionContainer) {
                actionContainer.innerHTML = `<button class="btn btn-success" disabled style="background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; pointer-events: none;">Added ✓</button>`;
            }
        }

        function closePreviewModal() {
            const modal = document.getElementById('preview-modal');
            if (modal) {
                modal.classList.remove('open');
            }

            // Cleanup HLS videojs player if active
            if (activePreviewPlayer) {
                try {
                    activePreviewPlayer.dispose();
                } catch (e) {
                    console.error('Error disposing preview player:', e);
                }
                activePreviewPlayer = null;
            }

            // Clear the player container to stop any iframe/audio
            const container = document.getElementById('preview-player-container');
            if (container) {
                container.innerHTML = '';
            }
        }

        function closePreviewOnOverlay(event) {
            if (event.target === document.getElementById('preview-modal')) {
                closePreviewModal();
            }
        }

        window.closePreviewModal = closePreviewModal;
        window.closePreviewOnOverlay = closePreviewOnOverlay;
        window.addDirectoryStreamFromPreview = addDirectoryStreamFromPreview;

        let currentBrowserCategory = 'all';

        function showMainStreamsPanel() {
            document.getElementById('panel-streams').classList.remove('hidden');
            document.getElementById('panel-weather').classList.add('hidden');
            document.getElementById('btn-weather-view').classList.remove('active');
            
            const browserPanel = document.getElementById('panel-browser');
            const browserBtn = document.getElementById('btn-browser-view');
            if (browserPanel) browserPanel.classList.add('hidden');
            if (browserBtn) browserBtn.classList.remove('active');
        }

        function toggleBrowserView() {
            const streamsPanel = document.getElementById('panel-streams');
            const weatherPanel = document.getElementById('panel-weather');
            const browserPanel = document.getElementById('panel-browser');
            
            const weatherBtn = document.getElementById('btn-weather-view');
            const browserBtn = document.getElementById('btn-browser-view');
            
            if (browserPanel.classList.contains('hidden')) {
                if (!appState.keepStreamsAlive) {
                    clearAllPlayers();
                } else {
                    const container = document.getElementById('grid-container');
                    if (container) {
                        container.querySelectorAll('.stream-card').forEach(c => c.classList.add('stream-hidden'));
                    }
                }
                
                browserPanel.classList.remove('hidden');
                streamsPanel.classList.add('hidden');
                weatherPanel.classList.add('hidden');
                
                browserBtn.classList.add('active');
                weatherBtn.classList.remove('active');
                
                verifyPublicDirectoryStreams();
                renderPublicStreamBrowser();
            } else {
                browserPanel.classList.add('hidden');
                streamsPanel.classList.remove('hidden');
                browserBtn.classList.remove('active');
                
                renderActiveStreams();
            }
        }

        function getCategoryGradient(category) {
            switch(category.toLowerCase()) {
                case 'news':
                    return 'linear-gradient(135deg, #1e3a8a 0%, #581c87 100%)';
                case 'cities':
                    return 'linear-gradient(135deg, #0f766e 0%, #1e1b4b 100%)';
                case 'nature & space':
                case 'nature':
                    return 'linear-gradient(135deg, #311042 0%, #020617 100%)';
                default:
                    return 'linear-gradient(135deg, #111827 0%, #374151 100%)';
            }
        }

        function renderPublicStreamBrowser() {
            const grid = document.getElementById('browser-streams-grid');
            if (!grid) return;
            
            const searchInput = document.getElementById('browser-search-input');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            grid.innerHTML = '';

            const verifiedOnlineStreams = PUBLIC_STREAM_DIRECTORY.filter(item => verifiedDirectoryStreams[item.url] === 'online');
            const checkedCount = Object.keys(verifiedDirectoryStreams).length;
            const totalCount = PUBLIC_STREAM_DIRECTORY.length;

            // If verifying and no streams verified online yet, show initial loading state
            if (isDirectoryVerifying && verifiedOnlineStreams.length === 0) {
                grid.innerHTML = `
                    <div class="browser-loading-container">
                        <span class="browser-spinner" style="font-size: 3.5rem; margin-bottom: 10px;">📡</span>
                        <div style="font-weight: 500; letter-spacing: 0.5px;">Checking stream availability (${checkedCount}/${totalCount} verified)...</div>
                    </div>
                `;
                return;
            }

            // If currently verifying remaining streams, display non-blocking progress banner
            if (isDirectoryVerifying) {
                const banner = document.createElement('div');
                banner.id = 'browser-verify-progress';
                banner.style.cssText = `
                    grid-column: 1 / -1;
                    padding: 10px 14px;
                    margin-bottom: 8px;
                    background: rgba(6, 182, 212, 0.1);
                    border: 1px solid rgba(6, 182, 212, 0.25);
                    border-radius: 8px;
                    font-size: 0.85rem;
                    color: var(--accent);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                `;
                banner.innerHTML = `<span style="display: inline-block; animation: spin 2s linear infinite;">📡</span> <span>Checking remaining directory streams (${checkedCount}/${totalCount} checked)...</span>`;
                grid.appendChild(banner);
            }
            
            const fragment = document.createDocumentFragment();
            PUBLIC_STREAM_DIRECTORY.forEach(item => {
                // Verify stream is usable before showing
                if (verifiedDirectoryStreams[item.url] !== 'online') {
                    return;
                }
                const itemCat = item.category.toLowerCase();
                
                // Category filter
                if (currentBrowserCategory !== 'all') {
                    if (currentBrowserCategory === 'news' && itemCat !== 'news') return;
                    if (currentBrowserCategory === 'cities' && itemCat !== 'cities') return;
                    if (currentBrowserCategory === 'nature' && itemCat !== 'nature & space') return;
                }
                
                // Search filter
                if (query && !item.name.toLowerCase().includes(query) && !item.desc.toLowerCase().includes(query)) {
                    return;
                }
                
                // Check if already in appState.streams
                const isAlreadyAdded = appState.streams.some(s => s.url === item.url);
                
                const card = document.createElement('div');
                card.className = 'browser-card';
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    if (!e.target.closest('.btn')) {
                        previewDirectoryStream(item);
                    }
                };
                
                const bgGradient = getCategoryGradient(item.category);
                const escCat = escapeHtml(item.category);
                const escType = escapeHtml(item.type);
                const escName = escapeHtml(item.name);
                const escDesc = escapeHtml(item.desc);
                const escEmoji = escapeHtml(item.emoji);

                card.innerHTML = `
                    <div class="browser-card-thumb" style="background: ${bgGradient}">
                        <div class="browser-card-category">${escCat}</div>
                        <div class="browser-card-type ${item.type}">${escType}</div>
                        <span style="font-size: 3rem; z-index: 2; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));">${escEmoji}</span>
                    </div>
                    <div class="browser-card-info">
                        <div class="browser-card-title">${escName}</div>
                        <div class="browser-card-desc">${escDesc}</div>
                    </div>
                    <div class="browser-card-action">
                    </div>
                `;

                const actionDiv = card.querySelector('.browser-card-action');
                if (isAlreadyAdded) {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-success';
                    btn.disabled = true;
                    btn.style.cssText = 'background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; pointer-events: none;';
                    btn.innerText = 'Added ✓';
                    actionDiv.appendChild(btn);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-primary';
                    btn.innerText = 'Add Stream';
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent preview onclick on the parent card
                        addDirectoryStream(item.name, item.url, item.type, item.category);
                    });
                    actionDiv.appendChild(btn);
                }
                
                fragment.appendChild(card);
            });
            grid.appendChild(fragment);
            
            if (grid.children.length === 0) {
                grid.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 40px; grid-column: 1 / -1;">
                        No streams found matching search criteria.
                    </div>
                `;
            }
        }

        function switchBrowserCategory(cat) {
            currentBrowserCategory = cat;
            
            // Update active state in tabs
            const tabs = document.querySelectorAll('#browser-category-tabs .browser-cat-btn');
            tabs.forEach(tab => {
                const onclickAttr = tab.getAttribute('onclick') || '';
                if (onclickAttr.includes(`'${cat}'`)) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
            
            renderPublicStreamBrowser();
        }

        const debouncedRenderPublicBrowser = debounce(() => {
            renderPublicStreamBrowser();
        }, 250);

        function filterPublicStreams() {
            debouncedRenderPublicBrowser();
        }

        function addDirectoryStream(name, url, type, category) {
            const safeUrl = sanitizeUrl(url, type);
            if (safeUrl === 'about:blank') return;
            if (appState.streams.some(s => s.url === safeUrl)) {
                return;
            }
            
            const newStream = {
                id: 'custom-' + Date.now(),
                name: String(name).trim().substring(0, 100),
                url: safeUrl,
                type: type,
                category: category || 'General',
                active: true,
                isDefault: false
            };
            
            appState.streams.push(newStream);
            persistState();
            
            // Re-render
            renderPublicStreamBrowser();
            populateSidebarCategories();
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
            
            alert(`"${name}" has been added to your sidebar streams!`);
        }



        // Toggle visibility of the more controls menu
        function toggleMoreControlsMenu(e) {
            if (e) e.stopPropagation();
            const menu = document.getElementById('more-controls-dropdown-menu');
            const btn = document.getElementById('btn-more-toggle');
            if (!menu || !btn) return;
            
            const isShow = menu.classList.toggle('show');
            btn.classList.toggle('active', isShow);
        }

        // Register global click handler to close dropdown on click outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('more-controls-dropdown-menu');
            const btn = document.getElementById('btn-more-toggle');
            if (menu && menu.classList.contains('show')) {
                if (!menu.contains(e.target) && !btn.contains(e.target)) {
                    menu.classList.remove('show');
                    btn.classList.remove('active');
                }
            }
        });

        // Make toggleMoreControlsMenu available globally
        window.toggleMoreControlsMenu = toggleMoreControlsMenu;

        // =========================================================================
        // REMOTE CONTROL PAIRING MODULE (MQTT-based)
        // =========================================================================

        const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
        const MQTT_TOPIC_PREFIX = 'livestreamviewer/pair/';

        // --- CRYPTO UTILITIES ---
        function base64urlEncode(bytes) {
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        function base64urlDecode(str) {
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        function generateHmacSecret() {
            const bytes = new Uint8Array(32);
            if (window.crypto && crypto.getRandomValues) {
                crypto.getRandomValues(bytes);
            } else {
                console.warn("[Crypto] window.crypto.getRandomValues not available. Falling back to Math.random.");
                for (let i = 0; i < 32; i++) {
                    bytes[i] = Math.floor(Math.random() * 256);
                }
            }
            return base64urlEncode(bytes);
        }

        function pureJsHmacSha256(msgBytes, keyBytes) {
            function sha256(words) {
                var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
                    h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
                var w = new Array(64);
                var k = [
                    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
                ];
                
                for (var i = 0; i < words.length; i += 16) {
                    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
                    for (var j = 0; j < 64; j++) {
                        if (j < 16) {
                            w[j] = words[i + j] | 0;
                        } else {
                            var s0 = (rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3));
                            var s1 = (rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10));
                            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
                        }
                        var ch = (e & f) ^ (~e & g);
                        var maj = (a & b) ^ (a & c) ^ (b & c);
                        var S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25));
                        var S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22));
                        var temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
                        var temp2 = (S0 + maj) | 0;
                        h = g; g = f; f = e;
                        e = (d + temp1) | 0;
                        d = c; c = b; b = a;
                        a = (temp1 + temp2) | 0;
                    }
                    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
                    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
                }
                return [h0, h1, h2, h3, h4, h5, h6, h7];
            }
            
            function rightRotate(value, amount) {
                return (value >>> amount) | (value << (32 - amount));
            }

            function bytesToWords(bytes) {
                var words = [];
                for (var i = 0; i < bytes.length; i++) {
                    words[i >>> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
                }
                return words;
            }

            function wordsToBytes(words) {
                var bytes = [];
                for (var i = 0; i < words.length * 4; i++) {
                    bytes.push((words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
                }
                return bytes;
            }

            function padWords(words, lengthInBytes) {
                var bitLength = lengthInBytes * 8;
                words[lengthInBytes >>> 2] |= 0x80 << (24 - (lengthInBytes % 4) * 8);
                var paddedLength = (((lengthInBytes + 8) >> 6) + 1) * 16;
                words[paddedLength - 1] = bitLength;
                return words;
            }

            var kBytes = Array.from(keyBytes);
            if (kBytes.length > 64) {
                kBytes = wordsToBytes(sha256(padWords(bytesToWords(kBytes), kBytes.length)));
            }
            while (kBytes.length < 64) {
                kBytes.push(0);
            }

            var ipad = [], opad = [];
            for (var i = 0; i < 64; i++) {
                ipad.push(kBytes[i] ^ 0x36);
                opad.push(kBytes[i] ^ 0x5c);
            }

            var mBytes = Array.from(msgBytes);
            var ipadMsg = ipad.concat(mBytes);
            var hash1 = sha256(padWords(bytesToWords(ipadMsg), ipadMsg.length));
            var opadHash1 = opad.concat(wordsToBytes(hash1));
            var hash2 = sha256(padWords(bytesToWords(opadHash1), opadHash1.length));
            
            return new Uint8Array(wordsToBytes(hash2));
        }

        async function hmacSha256(message, secret) {
            const keyBytes = base64urlDecode(secret);
            const msgBytes = new TextEncoder().encode(message);

            if (window.crypto && crypto.subtle) {
                try {
                    const key = await crypto.subtle.importKey(
                        "raw",
                        keyBytes,
                        { name: "HMAC", hash: { name: "SHA-256" } },
                        false,
                        ["sign"]
                    );
                    const signature = await crypto.subtle.sign(
                        "HMAC",
                        key,
                        msgBytes
                    );
                    return Array.from(new Uint8Array(signature))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                } catch (e) {
                    console.warn("[Crypto] Web Crypto Subtle sign failed, falling back to pure JS", e);
                }
            }
            
            const sigBytes = pureJsHmacSha256(msgBytes, keyBytes);
            return Array.from(sigBytes)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }

        let tvHmacSecret = '';
        const recentNonces = new Set();
        const nonceTimestamps = [];

        function pruneNonces() {
            const now = Date.now();
            const expiry = 60000;
            while (nonceTimestamps.length > 0 && (now - nonceTimestamps[0].t) > expiry) {
                const expired = nonceTimestamps.shift();
                recentNonces.delete(expired.n);
            }
        }

        async function signMessage(payloadObj, secret) {
            if (!secret) {
                return JSON.stringify(payloadObj);
            }
            const payloadStr = JSON.stringify(payloadObj);
            const nonce = Array.from(new Uint8Array(16))
                .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
                .join('');
            const timestamp = Date.now();
            
            const signatureInput = `${payloadStr}|${nonce}|${timestamp}`;
            const signatureHex = await hmacSha256(signatureInput, secret);
            
            const envelope = {
                p: payloadStr,
                s: signatureHex,
                n: nonce,
                t: timestamp
            };
            return JSON.stringify(envelope);
        }

        function showInsecureRemoteWarning(show) {
            const btn = document.getElementById('btn-pairing');
            if (btn) {
                if (show) {
                    btn.style.border = '1px solid #ef4444';
                    btn.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                    btn.style.color = '#ef4444';
                    btn.title = '⚠️ Warning: Insecure (unsigned) remote control connected!';
                    const label = btn.querySelector('span');
                    if (label) {
                        label.innerText = 'Remote Control ⚠️';
                    }
                } else {
                    btn.style.border = '';
                    btn.style.backgroundColor = '';
                    btn.style.color = '';
                    btn.title = 'Pair Remote Control';
                    const label = btn.querySelector('span');
                    if (label) {
                        label.innerText = 'Remote Control';
                    }
                }
            }

            // Create/manage a floating warning toast banner on TV screen
            let toast = document.getElementById('insecure-remote-toast-warning');
            if (show) {
                if (!toast) {
                    toast = document.createElement('div');
                    toast.id = 'insecure-remote-toast-warning';
                    toast.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: rgba(239, 68, 68, 0.95);
                        color: white;
                        padding: 16px 24px;
                        border-radius: 12px;
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                        z-index: 99999;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-family: inherit;
                        font-size: 0.95rem;
                        font-weight: 600;
                        backdrop-filter: blur(8px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        animation: slideIn 0.3s ease-out;
                    `;
                    toast.innerHTML = `
                        <span style="font-size: 1.25rem;">⚠️</span>
                        <div style="flex: 1; text-align: left;">
                            <div style="font-weight: 700; margin-bottom: 2px;">Insecure Connection</div>
                            <div style="font-size: 0.8rem; font-weight: 400; opacity: 0.9;">An unauthenticated remote is sending commands. Use the QR code to connect securely.</div>
                        </div>
                        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 1.2rem; padding: 0 4px; opacity: 0.8; font-weight: 700;">✕</button>
                    `;
                    
                    if (!document.getElementById('toast-animation-styles')) {
                        const style = document.createElement('style');
                        style.id = 'toast-animation-styles';
                        style.textContent = `
                            @keyframes slideIn {
                                from { transform: translateY(-20px); opacity: 0; }
                                to { transform: translateY(0); opacity: 1; }
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    document.body.appendChild(toast);
                }
            } else {
                if (toast) {
                    toast.remove();
                }
            }
        }

        async function verifyMessage(rawStr, secret) {
            try {
                const envelope = JSON.parse(rawStr);
                if (!envelope || typeof envelope !== 'object' || !envelope.p || !envelope.s || !envelope.n || !envelope.t) {
                    if (secret) {
                        console.warn("[Crypto] Rejected unauthenticated message while pairing secret is active.");
                        showInsecureRemoteWarning(true);
                        return null;
                    }
                    showInsecureRemoteWarning(true);
                    return envelope;
                }

                if (!secret) {
                    showInsecureRemoteWarning(true);
                    return JSON.parse(envelope.p);
                }

                pruneNonces();
                if (recentNonces.has(envelope.n)) {
                    console.warn("[Crypto] Duplicate nonce detected: " + envelope.n);
                    return null;
                }

                const now = Date.now();
                if (Math.abs(now - envelope.t) > 300000) {
                    console.warn("[Crypto] Message timestamp expired: " + envelope.t + " (current: " + now + "). Dropping unauthorized message.");
                    showInsecureRemoteWarning(true);
                    return null;
                }

                const signatureInput = `${envelope.p}|${envelope.n}|${envelope.t}`;
                const calculatedSig = await hmacSha256(signatureInput, secret);
                if (calculatedSig !== envelope.s) {
                    console.warn("[Crypto] Invalid signature from remote. Dropping unauthorized message.");
                    showInsecureRemoteWarning(true);
                    return null;
                }

                recentNonces.add(envelope.n);
                nonceTimestamps.push({ n: envelope.n, t: envelope.t });
                
                const parsedPayload = JSON.parse(envelope.p);
                if (parsedPayload && parsedPayload.from === 'remote') {
                    showInsecureRemoteWarning(false);
                }
                return parsedPayload;
            } catch (e) {
                console.error("[Crypto] Message verification failed:", e);
                return null;
            }
        }

        function sha256Hex(str) {
            function rightRotate(value, amount) {
                return (value >>> amount) | (value << (32 - amount));
            }
            var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
                h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
            var w = new Array(64);
            var k = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ];
            
            var bytes = [];
            for (var i = 0; i < str.length; i++) {
                bytes.push(str.charCodeAt(i) & 0xff);
            }
            
            var words = [];
            for (var i = 0; i < bytes.length; i++) {
                words[i >>> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
            }
            
            var bitLength = bytes.length * 8;
            words[bytes.length >>> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
            var paddedLength = (((bytes.length + 8) >> 6) + 1) * 16;
            words[paddedLength - 1] = bitLength;
            
            for (var i = 0; i < words.length; i += 16) {
                var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
                for (var j = 0; j < 64; j++) {
                    if (j < 16) {
                        w[j] = words[i + j] | 0;
                    } else {
                        var s0 = (rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3));
                        var s1 = (rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10));
                        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
                    }
                    var ch = (e & f) ^ (~e & g);
                    var maj = (a & b) ^ (a & c) ^ (b & c);
                    var S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25));
                    var S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22));
                    var temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
                    var temp2 = (S0 + maj) | 0;
                    h = g; g = f; f = e;
                    e = (d + temp1) | 0;
                    d = c; c = b; b = a;
                    a = (temp1 + temp2) | 0;
                }
                h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
                h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
            }
            
            var hashWords = [h0, h1, h2, h3, h4, h5, h6, h7];
            return hashWords.map(function(val) {
                var hex = (val >>> 0).toString(16);
                return '00000000'.substring(hex.length) + hex;
            }).join('');
        }

        function getMqttTopic(code) {
            const str = "ls_salt_" + code;
            return MQTT_TOPIC_PREFIX + sha256Hex(str);
        }

        // --- TV RECEIVER SIDE ---
        let tvMqttClient = null;
        let tvPairingCode = '';

        function initTVPairing() {
            tvPairingCode = getStoredItem('pairing_code');
            if (!tvPairingCode || tvPairingCode.length !== 6) {
                tvPairingCode = Math.floor(100000 + Math.random() * 900000).toString();
                setStoredItem('pairing_code', tvPairingCode);
            }

            tvHmacSecret = getStoredItem('pairing_hmac_secret');
            if (!tvHmacSecret) {
                tvHmacSecret = generateHmacSecret();
                setStoredItem('pairing_hmac_secret', tvHmacSecret);
            }

            const topic = getMqttTopic(tvPairingCode);
            console.log(`[TV Pairing] Connecting to MQTT broker. Code: ${tvPairingCode}, Topic: ${topic}`);

            try {
                tvMqttClient = mqtt.connect(MQTT_BROKER, {
                    clientId: 'livestreamviewer_tv_' + Math.random().toString(16).substring(2, 8),
                    keepalive: 60,
                    reconnectPeriod: 5000
                });

                tvMqttClient.on('connect', () => {
                    console.log('[TV Pairing] Connected to MQTT broker');
                    tvMqttClient.subscribe(topic, (err) => {
                        if (!err) {
                            console.log(`[TV Pairing] Subscribed to topic: ${topic}`);
                            updateTVPairingStatus(true);
                            sendMqttSync(); // Sync immediately in case remote was already listening
                        } else {
                            console.error('[TV Pairing] Subscription error:', err);
                        }
                    });
                });

                tvMqttClient.on('message', async (receivedTopic, message) => {
                    if (receivedTopic === topic) {
                        try {
                            const verifiedData = await verifyMessage(message.toString(), tvHmacSecret);
                            if (verifiedData && verifiedData.from === 'remote') {
                                handleRemoteCommand(verifiedData);
                            }
                        } catch (e) {
                            console.error('[TV Pairing] Error parsing message:', e);
                        }
                    }

                    if (typeof tvSyncMasterCode !== 'undefined' && tvSyncMasterCode) {
                        const masterTopic = getMqttTopic(tvSyncMasterCode);
                        if (receivedTopic === masterTopic) {
                            try {
                                const verifiedData = await verifyMessage(message.toString(), tvSyncMasterSecret);
                                if (verifiedData && verifiedData.from === 'tv' && verifiedData.type === 'sync') {
                                    handleMasterTVSync(verifiedData);
                                }
                            } catch (e) {
                                console.error('[TV Sync] Error parsing master TV sync:', e);
                            }
                        }
                    }
                });

                tvMqttClient.on('close', () => {
                    console.log('[TV Pairing] Connection closed');
                    updateTVPairingStatus(false);
                });

                tvMqttClient.on('error', (err) => {
                    console.error('[TV Pairing] MQTT Error:', err);
                    updateTVPairingStatus(false);
                });
            } catch (e) {
                console.error('[TV Pairing] MQTT init failed:', e);
            }
        }

        function updateTVPairingStatus(isConnected) {
            const statusDot = document.getElementById('pairing-status-dot');
            const statusText = document.getElementById('pairing-status-text');
            if (statusDot && statusText) {
                if (isConnected) {
                    statusDot.className = 'status-dot-mini online';
                    statusText.innerText = 'Online';
                } else {
                    statusDot.className = 'status-dot-mini checking';
                    statusText.innerText = 'Disconnected';
                }
            }
        }

        async function sendMqttSync() {
            if (tvMqttClient && tvMqttClient.connected) {
                const topic = getMqttTopic(tvPairingCode);
                const activeStatus = {};

                Object.keys(activePlayers).forEach(id => {
                    const pObj = activePlayers[id];
                    if (pObj) {
                        let isPlaying = true;
                        if (pObj.type === 'hls' && pObj.instance) {
                            isPlaying = !pObj.instance.paused();
                        } else if (pObj.type === 'youtube' && pObj.instance) {
                            isPlaying = pObj.instance.getPlayerState && pObj.instance.getPlayerState() === 1;
                        }
                        activeStatus[id] = {
                            isPlaying: isPlaying,
                            isMuted: pObj.muted || false,
                            volume: pObj.volume || 100
                        };
                    }
                });

                const payload = {
                    from: 'tv',
                    type: 'sync',
                    layout: appState.layout,
                    rotatorMode: appState.rotatorMode,
                    rotatorInterval: appState.rotatorInterval,
                    cycleActive: !!cycleInterval,
                    streams: appState.streams.map(s => ({
                        id: s.id,
                        name: s.name,
                        url: s.url,
                        type: s.type,
                        category: s.category,
                        active: s.active,
                        isDefault: s.isDefault
                    })),
                    presets: getPresets(),
                    activePlayersStatus: activeStatus
                };

                const signedPayload = await signMessage(payload, tvHmacSecret);
                tvMqttClient.publish(topic, signedPayload);
                console.log('[TV Pairing] Sent sync state');
            }
        }

        let remoteCommandTimestamps = [];
        let lastReloadTime = 0;

        function handleRemoteCommand(msg) {
            const now = Date.now();
            remoteCommandTimestamps = remoteCommandTimestamps.filter(t => now - t < 1000);
            if (remoteCommandTimestamps.length >= 10) {
                console.warn("[Rate Limit] Rate limit exceeded. Dropping remote command:", msg.action);
                return;
            }
            remoteCommandTimestamps.push(now);

            console.log('[TV Pairing] Received remote command:', msg.action);
            
            // Dismiss pairing modal once we receive confirmation that remote is communicating
            closePairingModal();

            switch (msg.action) {
                case 'ping':
                    sendMqttSync();
                    break;
                case 'setLayout':
                    if (msg.data && msg.data.layout) {
                        handleLayoutChange(msg.data.layout);
                    }
                    break;
                case 'toggleStream':
                    if (msg.data && msg.data.streamId) {
                        toggleStreamActive(msg.data.streamId, msg.data.checked);
                    }
                    break;
                case 'loadPreset':
                    if (msg.data && msg.data.name) {
                        loadPreset(msg.data.name);
                    }
                    break;
                case 'togglePlay':
                    if (msg.data && msg.data.streamId) {
                        togglePlay(msg.data.streamId);
                    }
                    break;
                case 'toggleMute':
                    if (msg.data && msg.data.streamId) {
                        toggleMute(msg.data.streamId);
                    }
                    break;
                case 'fullscreenStream':
                    if (msg.data && msg.data.streamId) {
                        fullscreenStream(msg.data.streamId);
                    }
                    break;
                case 'toggleCycle':
                    toggleCycle();
                    break;
                case 'toggleFS':
                    toggleFS();
                    break;
                case 'refreshAll':
                    if (Date.now() - lastReloadTime > 10000) {
                        lastReloadTime = Date.now();
                        location.reload();
                    } else {
                        console.warn("[Rate Limit] refreshAll ignored to prevent reload loop.");
                    }
                    break;
                case 'muteAll':
                    Object.keys(activePlayers).forEach(streamId => {
                        const pObj = activePlayers[streamId];
                        if (pObj && !pObj.muted) {
                            toggleMute(streamId);
                        }
                    });
                    break;
                case 'unmuteAll':
                    Object.keys(activePlayers).forEach(streamId => {
                        const pObj = activePlayers[streamId];
                        if (pObj && pObj.muted) {
                            toggleMute(streamId);
                        }
                    });
                    break;
                case 'addStream':
                    if (msg.data && msg.data.stream) {
                        const s = msg.data.stream;
                        if (!s || typeof s !== 'object') break;

                        const VALID_TYPES = ['hls', 'youtube', 'twitch', 'iframe', 'weather', 'notes'];
                        const streamType = typeof s.type === 'string' ? s.type.toLowerCase().trim() : '';
                        if (!VALID_TYPES.includes(streamType)) {
                            console.warn('[TV Pairing] Rejected remote addStream with invalid type:', s.type);
                            break;
                        }

                        const streamName = typeof s.name === 'string' ? s.name.trim().substring(0, 100) : '';
                        if (!streamName) {
                            console.warn('[TV Pairing] Rejected remote addStream with empty name');
                            break;
                        }

                        const rawUrl = typeof s.url === 'string' ? s.url.trim() : '';
                        const safeUrl = sanitizeUrl(rawUrl, streamType);
                        if (safeUrl === 'about:blank' && streamType !== 'notes' && streamType !== 'weather') {
                            console.warn('[TV Pairing] Rejected remote addStream with unsafe or unparseable URL:', s.url);
                            break;
                        }

                        const category = typeof s.category === 'string' ? s.category.trim().substring(0, 50) || 'General' : 'General';

                        const newStream = {
                            id: 'custom-' + Date.now(),
                            name: streamName,
                            url: safeUrl,
                            type: streamType,
                            category: category,
                            active: true,
                            isDefault: false
                        };
                        appState.streams.push(newStream);
                        persistState();
                        populateSidebarCategories();
                        populateSettings();
                        renderActiveStreams();
                        renderSidebarStreams();
                    }
                    break;
                case 'moveStream':
                    if (msg.data && msg.data.id && msg.data.direction) {
                        moveStream(msg.data.id, msg.data.direction);
                    }
                    break;
                case 'swapStreams':
                    if (msg.data && msg.data.id1 && msg.data.id2) {
                        swapStreams(msg.data.id1, msg.data.id2);
                    }
                    break;
                case 'placeStream':
                    if (msg.data && msg.data.streamId && msg.data.slotIndex !== undefined) {
                        placeStream(msg.data.streamId, parseInt(msg.data.slotIndex));
                    }
                    break;
                case 'togglePlay':
                    if (msg.data && msg.data.streamId) {
                        togglePlayStream(msg.data.streamId);
                    }
                    break;
                case 'toggleMute':
                    if (msg.data && msg.data.streamId) {
                        toggleMuteStream(msg.data.streamId);
                    }
                    break;
                case 'fullscreenStream':
                    if (msg.data && msg.data.streamId) {
                        toggleFSStream(msg.data.streamId);
                    }
                    break;
                case 'cyclePreset':
                    cycleStreamLayoutPreset();
                    break;
                case 'cycleWeather':
                    cycleWeatherView();
                    break;
                case 'loadPreset':
                    if (msg.data && msg.data.name) {
                        loadPreset(msg.data.name);
                    }
                    break;
                case 'savePreset':
                    if (msg.data && msg.data.name) {
                        savePreset(msg.data.name);
                    }
                    break;
                case 'deletePreset':
                    if (msg.data && msg.data.name) {
                        deletePreset(msg.data.name);
                    }
                    break;
                case 'setVolume':
                    if (msg.data && msg.data.streamId && msg.data.volume !== undefined) {
                        setStreamVolume(msg.data.streamId, parseInt(msg.data.volume));
                    }
                    break;
                case 'syncToMaster':
                    if (msg.data && msg.data.masterCode) {
                        connectTVSync(msg.data.masterCode, msg.data.masterSecret);
                    }
                    break;
                case 'disconnectMaster':
                    disconnectTVSync();
                    break;
                default:
                    console.warn("[TV Pairing] Unknown action received:", msg.action);
                    break;
            }
            sendMqttSync();
        }

        // --- GLOBAL PAIRING MODAL INTERACTION ---
        function openPairingModal() {
            const modal = document.getElementById('pairing-modal');
            if (!modal) return;
            modal.classList.add('open');

            // Update TV-to-TV Sync UI elements
            updateTVSyncUI();

            // Build mobile remote URL
            const currentPath = window.location.pathname;
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            const pairingUrlClean = `${window.location.origin}${basePath}mobile/?pair=${tvPairingCode}`;
            const pairingUrlWithSecret = `${pairingUrlClean}#secret=${tvHmacSecret}`;
            
            const urlText = document.getElementById('pairing-url-text');
            if (urlText) urlText.innerText = pairingUrlClean; // Keep UI display clean

            const codeDisplay = document.getElementById('pairing-code-display');
            if (codeDisplay) codeDisplay.innerText = tvPairingCode;

            // Render QR Code using QRious
            try {
                const qrCanvas = document.getElementById('pairing-qrcode-canvas');
                if (qrCanvas) {
                    new QRious({
                        element: qrCanvas,
                        value: pairingUrlWithSecret,
                        size: 200,
                        background: 'white',
                        foreground: '#030712',
                        level: 'H'
                    });
                }
            } catch (e) {
                console.error('Error generating QR code:', e);
            }
        }

        function closePairingModal() {
            const modal = document.getElementById('pairing-modal');
            if (modal) modal.classList.remove('open');
        }

        function closePairingOnOverlay(event) {
            if (event.target === document.getElementById('pairing-modal')) {
                closePairingModal();
            }
        }

        function copyPairingURL() {
            const currentPath = window.location.pathname;
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            const pairingUrlWithSecret = `${window.location.origin}${basePath}mobile/?pair=${tvPairingCode}#secret=${tvHmacSecret}`;
            navigator.clipboard.writeText(pairingUrlWithSecret).then(() => {
                alert('Pairing link copied to clipboard!');
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        }

        function regeneratePairingCode() {
            if (confirm('Regenerating pairing code will disconnect any currently paired remote controls. Continue?')) {
                tvPairingCode = Math.floor(100000 + Math.random() * 900000).toString();
                setStoredItem('pairing_code', tvPairingCode);
                
                // Rotate secret
                tvHmacSecret = generateHmacSecret();
                setStoredItem('pairing_hmac_secret', tvHmacSecret);

                if (tvMqttClient) {
                    try {
                        tvMqttClient.end(true);
                    } catch (e) {}
                }

                initTVPairing();
                openPairingModal();
            }
        }

        async function connectTVSync(code, secret) {
            if (!code) {
                const inputEl = document.getElementById('tv-sync-code-input');
                if (inputEl) code = inputEl.value.trim();
            }
            if (!code) return;
            
            if (code.length !== 6 || isNaN(code)) {
                alert('Please enter a valid 6-digit TV pairing code.');
                return;
            }

            if (code === tvPairingCode) {
                alert('Cannot sync a TV to itself. Please enter another TV\'s code.');
                return;
            }

            // Backup current state if not already synced
            if (!tvSyncMasterCode) {
                tvOriginalStateBackup = {
                    layout: appState.layout,
                    streams: JSON.parse(JSON.stringify(appState.streams)),
                    cinemaActiveStreamId: cinemaActiveStreamId
                };
            }

            // Set master code and secret
            tvSyncMasterCode = code;
            tvSyncMasterSecret = secret || '';
            lastSyncedMasterJson = '';

            // Subscribe to the master's MQTT topic
            const masterTopic = getMqttTopic(code);
            if (tvMqttClient && tvMqttClient.connected) {
                tvMqttClient.subscribe(masterTopic, async (err) => {
                    if (!err) {
                        console.log(`[TV Sync] Successfully subscribed to master topic: ${masterTopic}`);
                        
                        // Send ping to master topic so it replies with sync data immediately
                        const pingPayload = {
                            from: 'remote',
                            action: 'ping'
                        };
                        const signedPing = await signMessage(pingPayload, tvSyncMasterSecret);
                        tvMqttClient.publish(masterTopic, signedPing);
                    } else {
                        console.error('[TV Sync] Failed to subscribe to master topic:', err);
                    }
                });
            }

            // Update UI status
            updateTVSyncUI();
        }

        function disconnectTVSync() {
            if (!tvSyncMasterCode) return;

            // Unsubscribe from master topic
            const masterTopic = getMqttTopic(tvSyncMasterCode);
            if (tvMqttClient && tvMqttClient.connected) {
                tvMqttClient.unsubscribe(masterTopic);
            }

            // Clear master code
            tvSyncMasterCode = '';
            lastSyncedMasterJson = '';

            // Restore original state (forget master settings)
            if (tvOriginalStateBackup) {
                appState.layout = tvOriginalStateBackup.layout;
                appState.streams = tvOriginalStateBackup.streams;
                cinemaActiveStreamId = tvOriginalStateBackup.cinemaActiveStreamId;
                tvOriginalStateBackup = null;
            }

            // Re-render local TV state
            renderActiveStreams();
            renderSidebarStreams();
            populateSettings();

            // Clear input field
            const inputEl = document.getElementById('tv-sync-code-input');
            if (inputEl) inputEl.value = '';

            // Update UI status
            updateTVSyncUI();
        }

        function updateTVSyncUI() {
            const setupContainer = document.getElementById('tv-sync-setup-container');
            const activeContainer = document.getElementById('tv-sync-active-container');
            const activeCodeEl = document.getElementById('tv-sync-active-code');

            if (tvSyncMasterCode) {
                if (setupContainer) setupContainer.classList.add('hidden');
                if (activeContainer) activeContainer.classList.remove('hidden');
                if (activeCodeEl) activeCodeEl.innerText = `Code: ${tvSyncMasterCode}`;
            } else {
                if (setupContainer) setupContainer.classList.remove('hidden');
                if (activeContainer) activeContainer.classList.add('hidden');
            }
        }

        function handleMasterTVSync(data) {
            // Check if layout or active streams list changed
            const currentSyncJson = JSON.stringify({
                layout: data.layout,
                streams: data.streams.filter(s => s.active).map(s => s.id)
            });

            if (currentSyncJson !== lastSyncedMasterJson) {
                lastSyncedMasterJson = currentSyncJson;
                
                appState.layout = data.layout;
                appState.streams = data.streams;
                
                renderActiveStreams();
                renderSidebarStreams();
                populateSettings();
            }

            // Always apply play/pause/mute/volume state updates after short delay
            setTimeout(() => {
                applyMasterPlayerStates(data.activePlayersStatus);
            }, 500);
        }

        function applyMasterPlayerStates(activePlayersStatus) {
            if (!activePlayersStatus) return;
            
            Object.keys(activePlayersStatus).forEach(streamId => {
                const status = activePlayersStatus[streamId];
                const pObj = activePlayers[streamId];
                if (!pObj) return;

                // 1. Sync volume
                if (status.volume !== undefined && pObj.volume !== status.volume) {
                    setStreamVolume(streamId, status.volume);
                }

                // 2. Sync mute
                if (status.isMuted !== undefined && pObj.muted !== status.isMuted) {
                    pObj.muted = status.isMuted;
                    
                    const btn = document.querySelector(`#card-${streamId} .volume-mute-btn`);
                    const slider = document.querySelector(`#card-${streamId} .volume-slider`);
                    updateMuteBtnIcon(btn, status.isMuted);
                    if (slider) slider.value = status.isMuted ? 0 : pObj.volume;

                    if (pObj.type === 'hls' && pObj.instance) {
                        pObj.instance.muted(status.isMuted);
                    } else if (pObj.type === 'youtube' && pObj.instance) {
                        if (status.isMuted) pObj.instance.mute();
                        else pObj.instance.unMute();
                    } else if (pObj.type === 'twitch' && pObj.instance) {
                        pObj.instance.setMuted(status.isMuted);
                    }
                    updateFloatingTabVolume(streamId);
                }

                // 3. Sync play/pause
                if (status.isPlaying !== undefined) {
                    let isLocalPlaying = true;
                    if (pObj.type === 'hls' && pObj.instance) {
                        isLocalPlaying = !pObj.instance.paused();
                        if (status.isPlaying && !isLocalPlaying) {
                            pObj.instance.play();
                        } else if (!status.isPlaying && isLocalPlaying) {
                            pObj.instance.pause();
                        }
                    } else if (pObj.type === 'youtube' && pObj.instance) {
                        isLocalPlaying = pObj.instance.getPlayerState && pObj.instance.getPlayerState() === 1;
                        if (status.isPlaying && !isLocalPlaying) {
                            pObj.instance.playVideo();
                        } else if (!status.isPlaying && isLocalPlaying) {
                            pObj.instance.pauseVideo();
                        }
                    }
                }
            });
        }

        window.openPairingModal = openPairingModal;
        window.closePairingModal = closePairingModal;
        window.closePairingOnOverlay = closePairingOnOverlay;
        window.copyPairingURL = copyPairingURL;
        window.regeneratePairingCode = regeneratePairingCode;
        window.sendMqttSync = sendMqttSync;
        window.destroyPlayer = destroyPlayer;
        window.clearAllPlayers = clearAllPlayers;
        window.connectTVSync = connectTVSync;
        window.disconnectTVSync = disconnectTVSync;
        window.updateTVSyncUI = updateTVSyncUI;
        window.toggleMuteAll = toggleMuteAll;

        // Global Keyboard Shortcuts
        const LAYOUT_HOTKEYS = {
            '1': 'cinema',
            '2': 'grid-2x2',
            '3': 'grid-2x3',
            '4': 'grid-2x4',
            '5': 'grid-3x3',
            '6': 'grid-4x4',
            '7': 'layout-1-5',
            '8': 'layout-2-3'
        };

        function handleGlobalKeydown(e) {
            const isTyping = e.target && (
                e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.tagName === 'SELECT' ||
                e.target.isContentEditable
            );

            // Escape: Dismiss active modals or menus
            if (e.key === 'Escape') {
                if (isTyping && typeof e.target.blur === 'function') {
                    e.target.blur();
                }
                const previewModal = document.getElementById('preview-modal');
                if (previewModal && previewModal.classList.contains('open')) {
                    closePreviewModal();
                    return;
                }
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal && settingsModal.classList.contains('open')) {
                    closeSettings();
                    return;
                }
                const pairingModal = document.getElementById('pairing-modal');
                if (pairingModal && pairingModal.classList.contains('open')) {
                    closePairingModal();
                    return;
                }
                const moreMenu = document.getElementById('more-controls-dropdown-menu');
                if (moreMenu && moreMenu.classList.contains('show')) {
                    const btn = document.getElementById('btn-more-toggle');
                    moreMenu.classList.remove('show');
                    if (btn) btn.classList.remove('active');
                    return;
                }
                return;
            }

            // Guard: Ignore shortcuts while user is typing in form controls or holding modifier keys
            if (isTyping || e.altKey || e.ctrlKey || e.metaKey) {
                return;
            }

            const keyLower = e.key.toLowerCase();

            // 'f': Toggle Fullscreen
            if (keyLower === 'f') {
                e.preventDefault();
                toggleFS();
                return;
            }

            // 'm': Toggle Mute All
            if (keyLower === 'm') {
                e.preventDefault();
                toggleMuteAll();
                return;
            }

            // 'c': Toggle Rotator / Auto-Cycle
            if (keyLower === 'c') {
                e.preventDefault();
                toggleCycle();
                return;
            }

            // ' ': Space bar toggles playback on active/first stream
            if (e.code === 'Space') {
                const ids = Object.keys(activePlayers);
                if (ids.length > 0) {
                    e.preventDefault();
                    togglePlay(ids[0]);
                }
                return;
            }

            // '1' - '8': Switch layout presets
            if (LAYOUT_HOTKEYS[e.key]) {
                e.preventDefault();
                const targetLayout = LAYOUT_HOTKEYS[e.key];
                const select = document.getElementById('layout-select-dropdown');
                if (select) {
                    select.value = targetLayout;
                }
                handleLayoutChange(targetLayout);
                return;
            }
        }

        window.addEventListener('keydown', handleGlobalKeydown);

        // Run application
        initApp();
