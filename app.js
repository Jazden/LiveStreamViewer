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

        // App state
        let appState = {
            location: "Galveston",
            timezone: "America/Chicago",
            layout: "cinema",
            streams: []
        };

        // Active Player instances reference
        let activePlayers = {};
        let cinemaActiveStreamId = null;
        let cycleInterval = null;
        let dragSourceId = null;

        // Dynamic API script loading triggers
        let youtubeAPIReady = false;

        // Cookie Helpers
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

        function persistState() {
            setCookie('stream_layout', appState.layout, 365);
            
            // Save user-configured streams (isDefault === false)
            const userStreams = appState.streams.filter(s => !s.isDefault).map(s => ({
                id: s.id,
                name: s.name,
                url: s.url,
                type: s.type,
                active: s.active
            }));
            setCookie('user_streams', JSON.stringify(userStreams), 365);
            
            // Save active stream IDs (both default and custom)
            const activeIds = appState.streams.filter(s => s.active).map(s => s.id);
            setCookie('active_stream_ids', JSON.stringify(activeIds), 365);
            
            // Save stream order
            const orderIds = appState.streams.map(s => s.id);
            setCookie('stream_order', JSON.stringify(orderIds), 365);
            
            // Save location configuration
            setCookie('location_config', JSON.stringify({
                location: appState.location,
                timezone: appState.timezone
            }), 365);
        }

        // Initialize App
        function initApp() {
            // Load layout
            const savedLayout = getCookie('stream_layout');
            if (savedLayout) appState.layout = savedLayout;
            
            // Load user configured streams
            let userStreams = [];
            const savedUserStreams = getCookie('user_streams');
            if (savedUserStreams) {
                try {
                    userStreams = JSON.parse(savedUserStreams);
                } catch (e) {
                    console.error('Error parsing user streams cookie', e);
                }
            }
            
            // Build streams list
            let streams = defaultChannels.map((c, idx) => ({
                id: 'default-' + idx,
                name: c.name,
                url: c.url,
                type: c.type || 'hls',
                active: c.active !== undefined ? c.active : true,
                isDefault: true
            }));
            
            userStreams.forEach(us => {
                streams.push({
                    id: us.id,
                    name: us.name,
                    url: us.url,
                    type: us.type,
                    active: us.active !== undefined ? us.active : true,
                    isDefault: false
                });
            });
            
            // Load active/visible IDs
            const savedActiveIds = getCookie('active_stream_ids');
            if (savedActiveIds) {
                try {
                    const activeIds = JSON.parse(savedActiveIds);
                    streams.forEach(s => {
                        s.active = activeIds.includes(s.id);
                    });
                } catch (e) {
                    console.error('Error parsing active stream IDs cookie', e);
                }
            }

            // Load and sort by stream order index
            const savedOrder = getCookie('stream_order');
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
                    console.error('Error parsing stream order cookie', e);
                }
            }
            
            appState.streams = streams;
            
            // Setup API script tags
            loadThirdPartyAPIs();
            
            // Select layout and render streams
            document.getElementById('layout-select-dropdown').value = appState.layout;
            renderActiveStreams();
            populateSettings();

            // Initialize Sidebar state and contents
            const sidebarCollapsed = getCookie('sidebar_collapsed');
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
            renderSidebarStreams();

            // Asynchronously initialize location and weather
            initLocationAndWeather();
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

        // Weather text badge
        function updateWeatherBadge(location) {
            const badge = document.getElementById('weather-badge');
            badge.innerText = 'Loading Weather...';
            
            // Clean up city name
            const cityName = location.split(',')[0].trim();
            
            // Step 1: Geocode the city name to lat/long using Open-Meteo Geocoding API
            fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`)
                .then(response => {
                    if (!response.ok) throw new Error('Geocoding failed');
                    return response.json();
                })
                .then(geoData => {
                    if (!geoData.results || geoData.results.length === 0) {
                        throw new Error('City not found');
                    }
                    const result = geoData.results[0];
                    const lat = result.latitude;
                    const lon = result.longitude;
                    
                    // Step 2: Fetch weather details using Open-Meteo Forecast API
                    return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
                })
                .then(response => {
                    if (!response.ok) throw new Error('Forecast fetch failed');
                    return response.json();
                })
                .then(weatherData => {
                    const temp = Math.round(weatherData.current.temperature_2m);
                    const code = weatherData.current.weather_code;
                    const desc = getWeatherDescription(code);
                    badge.innerText = `${desc} +${temp}°F`;
                    badge.title = `Fetched from Open-Meteo for coordinates: ${weatherData.latitude.toFixed(2)}, ${weatherData.longitude.toFixed(2)}`;
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
            const savedLocation = getCookie('location_config');
            if (savedLocation) {
                try {
                    const loc = JSON.parse(savedLocation);
                    appState.location = loc.location || "Galveston";
                    appState.timezone = loc.timezone || "America/Chicago";
                    
                    updateHeaderLocation();
                    updateWeatherBadge(appState.location);
                    renderWeatherPanel();
                } catch (e) {
                    console.error('Error parsing location config cookie', e);
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
                })
                .catch(err => {
                    console.warn('IP geolocation error, falling back to Galveston:', err);
                    appState.location = "Galveston";
                    appState.timezone = "America/Chicago";
                    updateHeaderLocation();
                    updateWeatherBadge(appState.location);
                    renderWeatherPanel();
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

        // Weather full details forecast panel load
        function renderWeatherPanel() {
            const cityName = appState.location.split(',')[0].trim();
            
            // Geocode first, then get forecast
            fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`)
                .then(response => {
                    if (!response.ok) throw new Error('Geocoding failed');
                    return response.json();
                })
                .then(geoData => {
                    if (!geoData.results || geoData.results.length === 0) {
                        throw new Error('City not found');
                    }
                    const result = geoData.results[0];
                    const lat = result.latitude;
                    const lon = result.longitude;
                    
                    // Fetch full weather details
                    return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`);
                })
                .then(response => {
                    if (!response.ok) throw new Error('Forecast failed');
                    return response.json();
                })
                .then(data => {
                    // Populate current weather details
                    const cityEl = document.getElementById('wf-city');
                    if (cityEl) cityEl.innerText = appState.location;
                    
                    const tempEl = document.getElementById('wf-temp');
                    if (tempEl) tempEl.innerText = `${Math.round(data.current.temperature_2m)}°F`;
                    
                    const descEl = document.getElementById('wf-desc');
                    if (descEl) descEl.innerText = getWeatherDescription(data.current.weather_code);
                    
                    const iconEl = document.getElementById('wf-current-icon');
                    if (iconEl) iconEl.innerText = getWeatherEmoji(data.current.weather_code);
                    
                    const windEl = document.getElementById('wf-wind');
                    if (windEl) windEl.innerText = `${Math.round(data.current.wind_speed_10m)} mph`;
                    
                    const humidityEl = document.getElementById('wf-humidity');
                    if (humidityEl) humidityEl.innerText = `${data.current.relative_humidity_2m}%`;
                    
                    const high = Math.round(data.daily.temperature_2m_max[0]);
                    const low = Math.round(data.daily.temperature_2m_min[0]);
                    const highlowEl = document.getElementById('wf-highlow');
                    if (highlowEl) highlowEl.innerText = `${high}° / ${low}°`;
                    
                    // Populate daily forecast list
                    const dailyGrid = document.getElementById('wf-daily-grid');
                    if (dailyGrid) {
                        dailyGrid.innerHTML = '';
                        
                        // Loop through 7 days (starting tomorrow)
                        for (let i = 1; i < data.daily.time.length; i++) {
                            const dateStr = data.daily.time[i];
                            const dateObj = new Date(dateStr + 'T00:00:00');
                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                            
                            const code = data.daily.weather_code[i];
                            const emoji = getWeatherEmoji(code);
                            const desc = getWeatherDescription(code);
                            const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
                            const minTemp = Math.round(data.daily.temperature_2m_min[i]);
                            
                            const item = document.createElement('div');
                            item.className = 'weather-daily-item';
                            item.innerHTML = `
                                <div class="wdi-day">${dayName}</div>
                                <div class="wdi-icon-desc">
                                    <span class="wdi-emoji">${emoji}</span>
                                    <span class="wdi-desc">${desc}</span>
                                </div>
                                <div class="wdi-temps">
                                    <span class="wdi-temp-max">${maxTemp}°</span>
                                    <span class="wdi-temp-min">${minTemp}°</span>
                                </div>
                            `;
                            dailyGrid.appendChild(item);
                        }
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
            dragSourceId = null;
        }

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
            
            setCookie('sidebar_collapsed', isCollapsed ? '1' : '0', 365);
        }

        function filterSidebarStreams() {
            renderSidebarStreams();
        }

        function renderSidebarStreams() {
            const listContainer = document.getElementById('sidebar-streams-list');
            if (!listContainer) return;
            
            const searchInput = document.getElementById('sidebar-search-input');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            listContainer.innerHTML = '';
            
            appState.streams.forEach(stream => {
                if (query && !stream.name.toLowerCase().includes(query) && !stream.type.toLowerCase().includes(query)) {
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
                
                item.innerHTML = `
                    <div class="sidebar-item-header">
                        <span class="sidebar-item-name" title="${stream.name}">${stream.name}</span>
                        <span class="sidebar-item-badge ${badgeClass}">${stream.type}</span>
                    </div>
                    <div class="sidebar-item-footer">
                        <span class="sidebar-item-desc" title="${stream.url}">${displayUrl}</span>
                        <div class="sidebar-item-controls">
                            <label class="sidebar-switch" title="Toggle active status" onclick="event.stopPropagation()">
                                <input type="checkbox" ${stream.active ? 'checked' : ''} onchange="toggleStreamActive('${stream.id}', this.checked)">
                                <span class="sidebar-slider"></span>
                            </label>
                        </div>
                    </div>
                `;
                
                listContainer.appendChild(item);
            });
            
            if (listContainer.children.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px 0;">
                        No streams found
                    </div>
                `;
            }
        }

        // Render layout logic
        function renderActiveStreams() {
            clearAllPlayers();
            
            const container = document.getElementById('grid-container');
            container.innerHTML = '';
            
            const activeStreams = appState.streams.filter(s => s.active);
            
            if (activeStreams.length === 0) {
                container.innerHTML = `
                    <div class="no-streams">
                        <p>No active streams selected. Open configuration to set up and enable feeds.</p>
                        <button class="btn btn-primary" onclick="openSettings()">Configure Streams</button>
                    </div>
                `;
                return;
            }
            
            container.className = '';
            
            // Get layout capacity and cull streams that exceed it
            const capacity = LAYOUT_CAPACITIES[appState.layout] || 4;
            const displayStreams = activeStreams.slice(0, capacity);
            
            if (appState.layout === 'cinema') {
                container.classList.add('layout-cinema');
                
                let activeStream = displayStreams.find(s => s.id === cinemaActiveStreamId);
                if (!activeStream) {
                    activeStream = displayStreams[0];
                    cinemaActiveStreamId = activeStream.id;
                }
                
                renderStreamCard(container, activeStream);
                
                // Cinema view streams navigation bar
                if (activeStreams.length > 1) {
                    container.classList.add('has-selector');
                    const selectorDiv = document.createElement('div');
                    selectorDiv.className = 'cinema-selector';
                    selectorDiv.innerHTML = '<h4>Active Channels Selector</h4>';
                    
                    const btnGroup = document.createElement('div');
                    btnGroup.className = 'cinema-selector-group';
                    
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
                    selectorDiv.appendChild(btnGroup);
                    container.appendChild(selectorDiv);
                }
            } else {
                container.classList.add(appState.layout);
                
                displayStreams.forEach(s => {
                    renderStreamCard(container, s);
                });
            }
            
            // Instantiate players once inside DOM
            displayStreams.forEach(s => {
                const playerContainer = document.getElementById(`player-container-${s.id}`);
                if (!playerContainer) return; // not rendered in current view layout
                initializePlayer(s);
            });
        }

        // Render card structure in DOM
        function renderStreamCard(parent, stream) {
            const card = document.createElement('div');
            card.id = `card-${stream.id}`;
            card.className = 'stream-card';
            
            // HTML5 Drag and Drop event attributes
            card.setAttribute('draggable', 'true');
            card.setAttribute('ondragstart', `handleDragStart(event, '${stream.id}')`);
            card.setAttribute('ondragover', `handleDragOver(event)`);
            card.setAttribute('ondragleave', `handleDragLeave(event)`);
            card.setAttribute('ondrop', `handleDrop(event, '${stream.id}')`);
            card.setAttribute('ondragend', `handleDragEnd(event)`);
            
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
            const controlsHtml = isIframe ? `
                <div class="stream-controls">
                    <span class="control-note">External Embed (Custom controls unavailable)</span>
                    <button class="control-btn fullscreen-btn" onclick="fullscreenStream('${stream.id}')" title="Fullscreen">
                        ${FULLSCREEN_SVG}
                    </button>
                </div>
            ` : `
                <div class="stream-controls">
                    <button class="control-btn play-pause-btn" onclick="togglePlay('${stream.id}')" title="Play/Pause">
                        ${PLAY_SVG}
                    </button>
                    <div class="volume-control">
                        <button class="control-btn volume-mute-btn" onclick="toggleMute('${stream.id}')" title="Mute/Unmute">
                            ${MUTE_SVG}
                        </button>
                        <input type="range" min="0" max="100" value="50" class="volume-slider" oninput="setStreamVolume('${stream.id}', this.value)" title="Volume">
                    </div>
                    <button class="control-btn fullscreen-btn" onclick="fullscreenStream('${stream.id}')" title="Fullscreen">
                        ${FULLSCREEN_SVG}
                    </button>
                </div>
            `;
            
            card.innerHTML = `
                <div class="stream-header">
                    <span class="stream-name">${stream.name}</span>
                    <span class="stream-type-badge">${stream.type}</span>
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
            if (stream.type === 'hls') {
                const videoEl = document.createElement('video');
                videoEl.id = 'video-' + stream.id;
                videoEl.className = 'video-js vjs-default-skin';
                videoEl.setAttribute('playsinline', '');
                videoEl.muted = true;
                
                const container = document.getElementById(`player-container-${stream.id}`);
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
                        muted: true,
                        volume: 50
                    };
                    
                    player.volume(0.5);
                    
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
                    document.getElementById(`player-container-${stream.id}`).innerHTML = 
                        `<div class="player-error">HLS Stream Load Failed</div>`;
                }
            } 
            else if (stream.type === 'youtube') {
                const ytId = getYouTubeId(stream.url);
                if (!ytId) {
                    document.getElementById(`player-container-${stream.id}`).innerHTML = 
                        `<div class="player-error">Invalid YouTube URL</div>`;
                    return;
                }
                
                const playerDiv = document.createElement('div');
                playerDiv.id = 'yt-' + stream.id;
                const container = document.getElementById(`player-container-${stream.id}`);
                container.appendChild(playerDiv);
                
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    if (window.YT && window.YT.Player) {
                        createYTPlayer(stream, playerDiv.id, ytId);
                        clearInterval(interval);
                    } else if (attempts > 50) {
                        clearInterval(interval);
                        playerDiv.innerText = "Failed to load YouTube Iframe API";
                    }
                }, 100);
            } 
            else if (stream.type === 'twitch') {
                const channel = getTwitchChannel(stream.url);
                if (!channel) {
                    document.getElementById(`player-container-${stream.id}`).innerHTML = 
                        `<div class="player-error">Invalid Twitch URL</div>`;
                    return;
                }
                
                const playerDiv = document.createElement('div');
                playerDiv.id = 'twitch-' + stream.id;
                const container = document.getElementById(`player-container-${stream.id}`);
                container.appendChild(playerDiv);
                
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    if (window.Twitch && window.Twitch.Player) {
                        createTwitchPlayer(stream, playerDiv.id, channel);
                        clearInterval(interval);
                    } else if (attempts > 50) {
                        clearInterval(interval);
                        playerDiv.innerText = "Failed to load Twitch API";
                    }
                }, 100);
            } 
            else if (stream.type === 'iframe') {
                const iframe = document.createElement('iframe');
                iframe.src = stream.url;
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('allow', 'autoplay; encrypted-media');
                const container = document.getElementById(`player-container-${stream.id}`);
                container.appendChild(iframe);
                
                activePlayers[stream.id] = {
                    type: 'iframe',
                    instance: iframe,
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
                    muted: true,
                    volume: 50
                };
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
                    muted: true,
                    volume: 50
                };
                
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

        // Clean up resources
        function clearAllPlayers() {
            for (const id in activePlayers) {
                const pObj = activePlayers[id];
                if (!pObj) continue;
                try {
                    if (pObj.type === 'hls' && pObj.instance) {
                        pObj.instance.dispose();
                    } else if (pObj.type === 'youtube' && pObj.instance && typeof pObj.instance.destroy === 'function') {
                        pObj.instance.destroy();
                    }
                } catch (e) {
                    console.error('Error disposing player instance for ID ' + id, e);
                }
            }
            activePlayers = {};
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

        // Auto-cycle channels inside cinema view
        function toggleCycle() {
            const cycleBtn = document.getElementById('cycle-btn');
            if (cycleInterval) {
                clearInterval(cycleInterval);
                cycleInterval = null;
                cycleBtn.innerText = "Auto-Cycle: OFF";
                cycleBtn.classList.remove('active');
            } else {
                const activeStreams = appState.streams.filter(s => s.active);
                if (activeStreams.length <= 1) {
                    alert('Need at least 2 active streams to Auto-Cycle!');
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
                }, 30000);
                
                cycleBtn.innerText = "Auto-Cycle: ON";
                cycleBtn.classList.add('active');
            }
        }

        function handleLayoutChange(layoutName) {
            appState.layout = layoutName;
            persistState();
            
            // Switch panels
            document.getElementById('panel-streams').classList.remove('hidden');
            document.getElementById('panel-weather').classList.add('hidden');
            document.getElementById('btn-weather-view').classList.remove('active');
            
            renderActiveStreams();
        }

        function toggleWeatherView() {
            const weatherPanel = document.getElementById('panel-weather');
            const streamPanel = document.getElementById('panel-streams');
            const weatherBtn = document.getElementById('btn-weather-view');
            
            if (weatherPanel.classList.contains('hidden')) {
                weatherPanel.classList.remove('hidden');
                streamPanel.classList.add('hidden');
                weatherBtn.classList.add('active');
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
        }

        // Configure Form Submissions
        function handleAddStream(event) {
            event.preventDefault();
            const nameInput = document.getElementById('stream-name-input');
            const typeInput = document.getElementById('stream-type-input');
            const urlInput = document.getElementById('stream-url-input');
            
            const name = nameInput.value.trim();
            const type = typeInput.value;
            const url = urlInput.value.trim();
            
            if (!name || !url) return;
            
            const newStream = {
                id: 'custom-' + Date.now(),
                name: name,
                url: url,
                type: type,
                active: true,
                isDefault: false
            };
            
            appState.streams.push(newStream);
            persistState();
            
            // Reset fields
            nameInput.value = '';
            urlInput.value = '';
            
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        function handleSaveLocation(event) {
            event.preventDefault();
            const locationVal = document.getElementById('location-input').value.trim();
            const timezoneVal = document.getElementById('timezone-select').value;
            
            if (!locationVal) return;
            
            appState.location = locationVal;
            appState.timezone = timezoneVal;
            
            persistState();
            
            updateHeaderLocation();
            updateWeatherBadge(appState.location);
            renderWeatherPanel();
            
            alert('Location settings updated successfully!');
            closeSettings();
        }

        // Populate settings table dynamically
        function populateSettings() {
            const tbody = document.getElementById('streams-table-body');
            tbody.innerHTML = '';
            
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
                tbody.appendChild(tr);
            });
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

        function deleteStream(id) {
            const index = appState.streams.findIndex(s => s.id === id);
            if (index === -1) return;
            
            appState.streams.splice(index, 1);
            persistState();
            
            populateSettings();
            renderActiveStreams();
            renderSidebarStreams();
        }

        function resetToSystemDefaults() {
            if (confirm("Are you sure you want to reset all configurations? This will wipe your settings and custom streams.")) {
                setCookie('stream_layout', '', -1);
                setCookie('user_streams', '', -1);
                setCookie('active_stream_ids', '', -1);
                setCookie('stream_order', '', -1);
                setCookie('location_config', '', -1);
                
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

        // Run application
        initApp();
