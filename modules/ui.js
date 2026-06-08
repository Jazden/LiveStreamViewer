import { 
    appState, 
    remoteState,
    pairedDisplays,
    streamUptimeStatuses,
    activePlayers,
    tvSyncMasterCode,
    setTvSyncMasterCode,
    tvSyncMasterSecret,
    setTvSyncMasterSecret,
    tvOriginalStateBackup,
    setTvOriginalStateBackup,
    lastSyncedMasterJson,
    setLastSyncedMasterJson,
    activeWeatherAnimations,
    cinemaActiveStreamId,
    setCinemaActiveStreamId,
    cycleInterval,
    setCycleInterval,
    dragSourceId,
    setDragSourceId,
    youtubeAPIReady,
    setYoutubeAPIReady,
    LAYOUT_CAPACITIES,
    PLAY_SVG,
    PAUSE_SVG,
    MUTE_SVG,
    VOLUME_SVG,
    FULLSCREEN_SVG,
    POPOUT_SVG,
    SNAPSHOT_SVG,
    escapeHtml,
    sanitizeUrl,
    escapeJsString,
    setCookie,
    getCookie,
    deleteCookie
} from './state.js';

import {
    base64urlEncode,
    base64urlDecode,
    sha256Hex,
    pureJsHmacSha256,
    hmacSha256,
    signMessage,
    verifyMessage,
    tvHmacSecret,
    setTvHmacSecret,
    generateHmacSecret
} from './crypto.js';

import {
    initializePlayer,
    destroyPlayer,
    clearAllPlayers,
    togglePlay,
    toggleMute,
    setStreamVolume,
    getYouTubeId,
    getTwitchChannel
} from './player.js';

import {
    tvMqttClient,
    setTvMqttClient,
    tvPairingCode,
    setTvPairingCode,
    remoteMqttClient,
    setRemoteMqttClient,
    remotePairCode,
    setRemotePairCode,
    getMqttTopic,
    initTVPairing,
    sendMqttSync,
    handleRemoteCommand,
    connectTVSync,
    disconnectTVSync
} from './mqtt.js';


        function persistState() {
            if (typeof tvSyncMasterCode !== 'undefined' && tvSyncMasterCode) {
                // In sync mode, do not write the master TV's configurations into our cookies!
                if (window.sendMqttSync) {
                    window.sendMqttSync();
                }
                return;
            }
            setCookie('stream_layout', appState.layout, 365);
            
            // Save user-configured streams (isDefault === false)
            const userStreams = appState.streams.filter(s => !s.isDefault).map(s => ({
                id: s.id,
                name: s.name,
                url: s.url,
                type: s.type,
                category: s.category || 'General',
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
            
            // Save rotator configuration
            setCookie('rotator_config', JSON.stringify({
                mode: appState.rotatorMode,
                interval: appState.rotatorInterval
            }), 365);

            if (window.sendMqttSync) {
                window.sendMqttSync();
            }
        }


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
        let weatherForecastCache = null;
        let weatherForecastLocation = null;
        let weatherForecastPromise = null;
        
        function fetchWeatherForecast(location) {
            const cityName = location.split(',')[0].trim();
            if (weatherForecastCache && weatherForecastLocation === cityName) {
                return Promise.resolve(weatherForecastCache);
            }
            if (weatherForecastPromise && weatherForecastLocation === cityName) {
                return weatherForecastPromise;
            }
            
            weatherForecastLocation = cityName;
            weatherForecastPromise = fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`)
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
                    
                    return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`);
                })
                .then(response => {
                    if (!response.ok) throw new Error('Forecast failed');
                    return response.json();
                })
                .then(data => {
                    weatherForecastCache = data;
                    return data;
                })
                .catch(err => {
                    // Reset promise so we can retry on error
                    weatherForecastPromise = null;
                    throw err;
                });
                
            return weatherForecastPromise;
        }

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
            fetchWeatherForecast(appState.location)
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
            
            const categorySelect = document.getElementById('sidebar-category-select');
            const selectedCategory = categorySelect ? categorySelect.value : 'all';
            
            listContainer.innerHTML = '';
            
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
                
                listContainer.appendChild(item);
            });
            
            if (listContainer.children.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px 0;">
                        No streams found
                    </div>
                `;
            }
            
            // Queue status verification for newly rendered list items
            setTimeout(checkAllStreamsStatus, 100);
        }

        // Render layout logic
        // Render layout logic
        function renderActiveStreams() {
            const container = document.getElementById('grid-container');
            const activeStreams = appState.streams.filter(s => s.active);
            
            if (activeStreams.length === 0) {
                clearAllPlayers();
                container.innerHTML = `
                    <div class="no-streams">
                        <p>No active streams selected. Open configuration to set up and enable feeds.</p>
                        <button class="btn btn-primary" onclick="openSettings()">Configure Streams</button>
                    </div>
                `;
                return;
            }
            
            // Get layout capacity and cull streams that exceed it
            const capacity = LAYOUT_CAPACITIES[appState.layout] || 4;
            const displayStreams = activeStreams.slice(0, capacity);
            
            let streamsToDisplay = [];
            if (appState.layout === 'cinema') {
                let activeStream = displayStreams.find(s => s.id === cinemaActiveStreamId);
                if (!activeStream) {
                    activeStream = displayStreams[0];
                    cinemaActiveStreamId = activeStream.id;
                }
                streamsToDisplay = [activeStream];
            } else {
                streamsToDisplay = displayStreams;
            }
            
            // 1. Destroy running players that are no longer in the new streamsToDisplay list
            const toDisplayIds = new Set(streamsToDisplay.map(s => s.id));
            const runningIds = Object.keys(activePlayers);
            for (const id of runningIds) {
                if (!toDisplayIds.has(id)) {
                    destroyPlayer(id);
                    const card = document.getElementById(`card-${id}`);
                    if (card) {
                        card.remove();
                    }
                }
            }
            
            // 2. Remove static non-card elements (like previous no-streams or cinema-selectors)
            const nonCardKids = container.querySelectorAll(':scope > *:not(.stream-card)');
            nonCardKids.forEach(el => el.remove());
            
            // 3. Render or update stream cards
            streamsToDisplay.forEach((s, index) => {
                let card = document.getElementById(`card-${s.id}`);
                if (!card) {
                    // Create and append a new card
                    renderStreamCard(container, s);
                    card = document.getElementById(`card-${s.id}`);
                    initializePlayer(s);
                } else {
                    // Existing card: clean and update layout classes
                    card.classList.remove('large', 'small');
                    if (appState.layout === 'layout-1-5') {
                        if (index === 0) card.classList.add('large');
                    } else if (appState.layout === 'layout-2-3') {
                        if (index < 2) card.classList.add('large');
                        else card.classList.add('small');
                    }
                }
                
                // Set CSS order to position the card visually without moving it in the DOM
                if (card) {
                    card.style.order = index;
                }
            });
            
            // 4. Update container styling
            container.className = '';
            if (appState.layout === 'cinema') {
                container.classList.add('layout-cinema');
                
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
            
            let controlsHtml = '';
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
                controlsHtml = `
                    <div class="stream-controls">
                        <span class="control-note">External Embed (Custom controls unavailable)</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="control-btn popout-btn" data-action="popout" title="Pop-out Stream (New Window)">
                                ${POPOUT_SVG}
                            </button>
                            <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                                ${FULLSCREEN_SVG}
                            </button>
                        </div>
                    </div>
                `;
            } else {
                const isSnapshotSupported = stream.type === 'hls' || stream.type === 'weather';
                const snapshotButtonHtml = isSnapshotSupported ? `
                    <button class="control-btn snapshot-btn" data-action="snapshot" title="Capture Snapshot Frame">
                        ${SNAPSHOT_SVG}
                    </button>
                ` : '';
                
                if (stream.type === 'weather') {
                    controlsHtml = `
                        <div class="stream-controls">
                            <span class="control-note">Weather Forecast Cam</span>
                            <div style="display: flex; gap: 8px;">
                                ${snapshotButtonHtml}
                                <button class="control-btn fullscreen-btn" data-action="fullscreen" title="Fullscreen">
                                    ${FULLSCREEN_SVG}
                                </button>
                            </div>
                        </div>
                    `;
                } else {
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
                    <span class="stream-name">${escapedStreamName}</span>
                    <span class="stream-type-badge">${escapedStreamType}</span>
                </div>
                <div class="stream-player-container" id="player-container-${stream.id}">
                    <!-- Embedded Stream Content -->
                </div>
                ${controlsHtml}
            `;
            
            parent.appendChild(card);
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
                clearAllPlayers();
                
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
            
            const name = nameInput.value.trim();
            const category = categoryInput ? categoryInput.value.trim() || 'General' : 'General';
            const type = typeInput.value;
            const url = urlInput.value.trim();
            
            if (!name || !url) return;
            
            const newStream = {
                id: 'custom-' + Date.now(),
                name: name,
                url: url,
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
                tbody.appendChild(tr);
            });

            // Populate rotator settings in modal
            const modeSelect = document.getElementById('rotator-mode-select');
            const intervalInput = document.getElementById('rotator-interval-input');
            if (modeSelect) modeSelect.value = appState.rotatorMode;
            if (intervalInput) intervalInput.value = appState.rotatorInterval;
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
                setCookie('stream_layout', '', -1);
                setCookie('user_streams', '', -1);
                setCookie('active_stream_ids', '', -1);
                setCookie('stream_order', '', -1);
                setCookie('location_config', '', -1);
                setCookie('layout_presets', '', -1);
                
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
            const saved = getCookie('layout_presets');
            if (!saved) return [];
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Error parsing layout presets cookie", e);
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
            
            setCookie('layout_presets', JSON.stringify(presets), 365);
            updatePresetDropdown();
            populatePresetsTable();
        }

        function deletePreset(name) {
            let presets = getPresets();
            presets = presets.filter(p => p.name.toLowerCase() !== name.toLowerCase());
            setCookie('layout_presets', JSON.stringify(presets), 365);
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
                
                tbody.appendChild(tr);
            });
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
            
            let playerHtml = '';
            if (type === 'hls') {
                playerHtml = `
                    <video id="pop-player" class="video-js vjs-default-skin vjs-big-play-centered" controls autoplay playsinline style="width:100%; height:100vh;">
                        <source src="${escapedUrl}" type="application/x-mpegURL">
                    </video>
                    <script src="https://vjs.zencdn.net/8.10.0/video.js"></script>
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
                    <iframe src="${escapedUrl}" frameborder="0" allowfullscreen style="width:100%; height:100vh; border:none;"></iframe>
                `;
            }
            
            popWin.document.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>${name} - Live Stream Viewer Pop-out</title>
                    <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet" />
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
                <canvas id="canvas-weather-${stream.id}" class="weather-canvas"></canvas>
                <div class="weather-cam-widget" id="weather-cam-widget-${stream.id}">
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding-top: 40px;">
                        Initializing Local Weather Cam...
                    </div>
                </div>
            `;
            
            const canvas = document.getElementById(`canvas-weather-${stream.id}`);
            
            fetchWeatherForecast(appState.location)
                .then(data => {
                    const temp = Math.round(data.current.temperature_2m);
                    const code = data.current.weather_code;
                    const desc = getWeatherDescription(code);
                    const emoji = getWeatherEmoji(code);
                    const isDay = data.current.is_day === 1;
                    
                    const widget = document.getElementById(`weather-cam-widget-${stream.id}`);
                    if (!widget) return;
                    
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
                    
                    widget.innerHTML = `
                        <div class="wc-header">
                            <div>
                                <div class="wc-location">${escapeHtml(appState.location)}</div>
                            </div>
                            <div style="text-align: right;">
                                <div class="wc-current-temp">${temp}°F</div>
                            </div>
                        </div>
                        <div class="wc-current-center">
                            <span class="wc-cc-icon">${emoji}</span>
                            <span class="wc-cc-desc">${desc}</span>
                        </div>
                        <div class="wc-forecast-grid">
                            ${forecastHtml}
                        </div>
                    `;
                    
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
            let clouds = [];
            let sunAngle = 0;
            let time = 0;
            
            const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
            const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
            const isCloudy = [1, 2, 3, 45, 48].includes(code) || isRain || isSnow;
            const isSunny = !isRain && !isSnow && (code === 0 || code === 1 || code === 2);
            const isStorm = [95, 96, 99].includes(code);
            
            if (isRain) {
                const count = isStorm ? 80 : 40;
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
                const count = 40;
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
            
            if (isCloudy) {
                const cloudCount = isRain ? 4 : 2;
                for (let i = 0; i < cloudCount; i++) {
                    clouds.push({
                        x: Math.random() * 600 - 100,
                        y: 10 + Math.random() * 40,
                        speed: 0.15 + Math.random() * 0.15,
                        scale: 0.6 + Math.random() * 0.5,
                        opacity: isRain ? 0.35 : 0.25
                    });
                }
            }
            
            function tick() {
                time++;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                if (isDay) {
                    if (isRain || isStorm) {
                        grad.addColorStop(0, '#1f2937');
                        grad.addColorStop(1, '#111827');
                    } else if (isCloudy) {
                        grad.addColorStop(0, '#374151');
                        grad.addColorStop(1, '#1f2937');
                    } else {
                        grad.addColorStop(0, '#0f172a');
                        grad.addColorStop(1, '#020617');
                    }
                } else {
                    grad.addColorStop(0, '#020617');
                    grad.addColorStop(1, '#000000');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                if (isStorm && Math.random() < 0.007) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + Math.random() * 0.2})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                if (!isDay && !isRain && !isSnow) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    for (let i = 0; i < 20; i++) {
                        const starX = (Math.sin(i * 123.45) * 0.5 + 0.5) * canvas.width;
                        const starY = (Math.cos(i * 543.21) * 0.5 + 0.5) * (canvas.height * 0.7);
                        const flicker = 0.5 + Math.sin(time * 0.05 + i) * 0.5;
                        ctx.globalAlpha = flicker;
                        ctx.fillRect(starX, starY, 1.5, 1.5);
                    }
                    ctx.globalAlpha = 1.0;
                }
                
                if (isSunny && isDay) {
                    sunAngle += 0.005;
                    const sunX = canvas.width - 60;
                    const sunY = 60;
                    
                    const sunGlow = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 50);
                    sunGlow.addColorStop(0, 'rgba(251, 146, 60, 0.6)');
                    sunGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
                    ctx.fillStyle = sunGlow;
                    ctx.beginPath();
                    ctx.arc(sunX, sunY, 50, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#fdba74';
                    ctx.beginPath();
                    ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.strokeStyle = '#fdba74';
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 8; i++) {
                        const angle = sunAngle + (i * Math.PI / 4);
                        ctx.beginPath();
                        ctx.moveTo(sunX + Math.cos(angle) * 26, sunY + Math.sin(angle) * 26);
                        ctx.lineTo(sunX + Math.cos(angle) * 36, sunY + Math.sin(angle) * 36);
                        ctx.stroke();
                    }
                }
                
                if (isSunny && !isDay) {
                    const moonX = canvas.width - 60;
                    const moonY = 60;
                    
                    ctx.fillStyle = '#e2e8f0';
                    ctx.beginPath();
                    ctx.arc(moonX, moonY, 18, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#020617';
                    ctx.beginPath();
                    ctx.arc(moonX - 6, moonY - 2, 16, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                if (isRain) {
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
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
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
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
                
                if (isCloudy) {
                    clouds.forEach(c => {
                        ctx.fillStyle = isRain ? `rgba(156, 163, 175, ${c.opacity})` : `rgba(243, 244, 246, ${c.opacity})`;
                        ctx.save();
                        ctx.translate(c.x, c.y);
                        ctx.scale(c.scale, c.scale);
                        
                        ctx.beginPath();
                        ctx.arc(50, 50, 30, 0, Math.PI * 2);
                        ctx.arc(90, 50, 40, 0, Math.PI * 2);
                        ctx.arc(140, 55, 30, 0, Math.PI * 2);
                        ctx.rect(50, 45, 90, 40);
                        ctx.closePath();
                        ctx.fill();
                        
                        ctx.restore();
                        
                        c.x += c.speed;
                        if (c.x > canvas.width + 200) {
                            c.x = -200;
                            c.y = 10 + Math.random() * 40;
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
            if (modeSelect) appState.rotatorMode = modeSelect.value;
            if (intervalInput) appState.rotatorInterval = parseInt(intervalInput.value) || 30;
            persistState();
            
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
            
            const savedText = getCookie(`notes_content_${stream.id}`) || '';
            
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
            setCookie(`notes_content_${streamId}`, val, 365);
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
            if (directoryVerificationStarted) return;
            directoryVerificationStarted = true;
            isDirectoryVerifying = true;

            const panel = document.getElementById('panel-browser');
            if (panel && !panel.classList.contains('hidden')) {
                renderPublicStreamBrowser();
            }

            const promises = PUBLIC_STREAM_DIRECTORY.map(item => checkDirectoryStreamUsability(item));
            await Promise.allSettled(promises);

            isDirectoryVerifying = false;
            
            if (panel && !panel.classList.contains('hidden')) {
                renderPublicStreamBrowser();
            }
        }

        let activePreviewPlayer = null;

        function getYoutubeId(url) {
            let videoId = '';
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                const match = url.match(regExp);
                if (match && match[2].length === 11) {
                    videoId = match[2];
                }
            }
            return videoId;
        }

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
                clearAllPlayers();
                
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

            if (isDirectoryVerifying) {
                grid.innerHTML = `
                    <div class="browser-loading-container">
                        <span class="browser-spinner" style="font-size: 3.5rem; margin-bottom: 10px;">📡</span>
                        <div style="font-weight: 500; letter-spacing: 0.5px;">Verifying stream directory availability...</div>
                    </div>
                `;
                return;
            }
            
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
                
                grid.appendChild(card);
            });
            
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

        function filterPublicStreams() {
            renderPublicStreamBrowser();
        }

        function addDirectoryStream(name, url, type, category) {
            if (appState.streams.some(s => s.url === url)) {
                return;
            }
            
            const newStream = {
                id: 'custom-' + Date.now(),
                name: name,
                url: url,
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

        // --- GLOBAL PAIRING MODAL INTERACTION ---
        function openPairingModal() {
            const modal = document.getElementById('pairing-modal');
            if (!modal) return;
            modal.classList.add('open');

            // Update TV-to-TV Sync UI elements
            updateTVSyncUI();

            const pairingUrlClean = `${window.location.origin}${window.location.pathname}?pair=${tvPairingCode}`;
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
            const pairingUrlWithSecret = `${window.location.origin}${window.location.pathname}?pair=${tvPairingCode}#secret=${tvHmacSecret}`;
            navigator.clipboard.writeText(pairingUrlWithSecret).then(() => {
                alert('Pairing link copied to clipboard!');
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        }

        function regeneratePairingCode() {
            if (confirm('Regenerating pairing code will disconnect any currently paired remote controls. Continue?')) {
                tvPairingCode = Math.floor(100000 + Math.random() * 900000).toString();
                setCookie('pairing_code', tvPairingCode, 365);
                
                // Rotate secret
                tvHmacSecret = generateHmacSecret();
                setCookie('pairing_hmac_secret', tvHmacSecret, 365);

                if (tvMqttClient) {
                    try {
                        tvMqttClient.end(true);
                    } catch (e) {}
                }

                initTVPairing();
                openPairingModal();
            }
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

        let pairedDisplays = [];

        function loadPairedDisplays(currentCode) {
            pairedDisplays = [];
            try {
                const saved = localStorage.getItem('remote_paired_displays');
                if (saved) {
                    pairedDisplays = JSON.parse(saved);
                }
            } catch (e) {
                console.error('[Storage Error] Failed to read from localStorage:', e);
            }
            if (!Array.isArray(pairedDisplays)) {
                pairedDisplays = [];
            }

            if (currentCode) {
                const codeStr = String(currentCode).trim();
                if (codeStr !== '') {
                    // Extract secret from fragment
                    let secret = '';
                    if (window.location.hash) {
                        const hashParams = new URLSearchParams(window.location.hash.substring(1));
                        secret = hashParams.get('secret') || '';
                    }
                    const existingIndex = pairedDisplays.findIndex(d => d.code === codeStr);
                    if (existingIndex === -1) {
                        pairedDisplays.push({
                            name: 'Display ' + codeStr,
                            code: codeStr,
                            hmacKey: secret
                        });
                        savePairedDisplays();
                    } else if (secret) {
                        // Update secret if a new one is provided in URL
                        if (pairedDisplays[existingIndex].hmacKey !== secret) {
                            pairedDisplays[existingIndex].hmacKey = secret;
                            savePairedDisplays();
                        }
                    }
                }
            }
        }

        function savePairedDisplays() {
            try {
                localStorage.setItem('remote_paired_displays', JSON.stringify(pairedDisplays));
            } catch (e) {
                console.error('[Storage Error] Failed to write to localStorage:', e);
            }
        }

        function renderDisplaySwitcherHeader() {
            const container = document.getElementById('remote-code-badge');
            if (!container) return;
            
            const currentDisplay = pairedDisplays.find(d => d.code === remotePairCode);
            const displayName = currentDisplay ? currentDisplay.name : (remotePairCode ? 'CODE: ' + remotePairCode : 'UNPAIRED');
            
            let badgeStyle = 'background: rgba(6, 182, 212, 0.15); color: var(--accent); border-color: var(--border-color);';
            let warningText = '';
            if (currentDisplay && !currentDisplay.hmacKey) {
                badgeStyle = 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3);';
                warningText = ' <span style="font-size: 0.75rem;" title="Insecure connection (no signature)">⚠️</span>';
            }
            
            container.style.cssText = `font-family: inherit; font-size: 0.8rem; font-weight: 700; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: all 0.2s; ${badgeStyle}`;
            // Render a beautiful pill that prompts the switcher popup when clicked
            container.innerHTML = `📺 <span style="margin-left: 2px;">${escapeHtml(displayName)}</span>${warningText} <span style="font-size: 0.65rem; opacity: 0.7; margin-left: 4px;">▼</span>`;
        }

        function openRemoteSwitcherPopup() {
            const popup = document.getElementById('remote-switcher-popup');
            if (!popup) return;
            
            const activeNameEl = document.getElementById('remote-switcher-active-name');
            if (activeNameEl) {
                const currentDisplay = pairedDisplays.find(d => d.code === remotePairCode);
                activeNameEl.innerText = currentDisplay ? `${currentDisplay.name} (${currentDisplay.code})` : (remotePairCode ? `Display ${remotePairCode}` : 'None Connected');
            }

            const listEl = document.getElementById('remote-switcher-list');
            if (listEl) {
                listEl.innerHTML = '';
                if (pairedDisplays.length === 0) {
                    listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 8px;">No displays paired yet.</div>';
                } else {
                    pairedDisplays.forEach(d => {
                        const isCurrent = d.code === remotePairCode;
                        const item = document.createElement('div');
                        item.className = 'remote-list-item ' + (isCurrent ? 'selected' : '');
                        item.style.cursor = 'pointer';
                        
                        item.addEventListener('click', () => {
                            selectDisplayFromSwitcher(d.code);
                        });
                        
                        const titleHtml = `<div class="remote-item-info">
                            <div class="remote-item-title" style="font-weight: 700; color: ${isCurrent ? 'var(--accent)' : 'white'};">${escapeHtml(d.name)} ${d.hmacKey ? '' : '<span style="color:#ef4444;" title="Insecure Connection">⚠️</span>'}</div>
                            <div class="remote-item-desc">Code: ${escapeHtml(d.code)}</div>
                        </div>`;
                        
                        const indicatorHtml = `<div class="remote-item-actions">
                            ${isCurrent ? '<span style="color: var(--accent); font-weight: 700; font-size: 0.8rem;">Active 🟢</span>' : '<span style="color: var(--text-muted); font-size: 0.75rem;">Tap to Switch</span>'}
                        </div>`;
                        
                        item.innerHTML = titleHtml + indicatorHtml;
                        listEl.appendChild(item);
                    });
                }
            }
            popup.classList.add('open');
        }

        function closeRemoteSwitcherPopup() {
            const popup = document.getElementById('remote-switcher-popup');
            if (popup) popup.classList.remove('open');
        }

        function closeRemoteSwitcherOnOverlay(e) {
            if (e.target === document.getElementById('remote-switcher-popup')) {
                closeRemoteSwitcherPopup();
            }
        }

        function selectDisplayFromSwitcher(code) {
            switchRemotePairing(code);
            closeRemoteSwitcherPopup();
        }

        function switchRemotePairing(newCode) {
            initMobileRemote(newCode);
        }

        function addNewPairingFromSettings() {
            const inputEl = document.getElementById('remote-add-pairing-input');
            if (!inputEl) return;
            const code = inputEl.value.trim();
            
            if (code.length !== 6 || isNaN(code)) {
                alert('Please enter a valid 6-digit pairing code.');
                return;
            }

            const exists = pairedDisplays.some(d => d.code === code);
            if (exists) {
                alert('This display is already paired.');
                return;
            }

            pairedDisplays.push({
                name: 'Display ' + code,
                code: code,
                hmacKey: ''
            });
            savePairedDisplays();

            inputEl.value = '';

            renderDisplaySwitcherHeader();
            renderPairedDisplaysSettings();
            updateTVSyncDropdowns();
            
            switchRemotePairing(code);
            alert(`Display ${code} added and connected!`);
        }

        function removePairing(code) {
            const displayObj = pairedDisplays.find(d => d.code === code);
            const displayName = displayObj ? displayObj.name : code;
            if (confirm(`Are you sure you want to remove Display "${displayName}"?`)) {
                pairedDisplays = pairedDisplays.filter(d => d.code !== code);
                savePairedDisplays();
                
                if (remotePairCode === code) {
                    const nextCode = pairedDisplays.length > 0 ? pairedDisplays[0].code : '';
                    switchRemotePairing(nextCode);
                } else {
                    renderDisplaySwitcherHeader();
                    renderPairedDisplaysSettings();
                    updateTVSyncDropdowns();
                }
            }
        }

        function renamePairing(code) {
            const display = pairedDisplays.find(d => d.code === code);
            if (!display) return;
            
            const newName = prompt(`Enter a new name for Display "${display.name}":`, display.name);
            if (newName) {
                const trimmed = newName.trim();
                if (trimmed) {
                    display.name = trimmed;
                    savePairedDisplays();
                    
                    renderDisplaySwitcherHeader();
                    renderPairedDisplaysSettings();
                    updateTVSyncDropdowns();
                }
            }
        }

        function updateTVSyncDropdowns() {
            const slaveSelect = document.getElementById('remote-sync-slave-select');
            const masterSelect = document.getElementById('remote-sync-master-select');
            if (!slaveSelect || !masterSelect) return;
            
            slaveSelect.innerHTML = '<option value="">-- Select Slave TV --</option>';
            masterSelect.innerHTML = '<option value="">-- Select Master TV --</option>';

            pairedDisplays.forEach(d => {
                const escName = escapeHtml(d.name);
                const escCode = escapeHtml(d.code);
                slaveSelect.innerHTML += `<option value="${escCode}">${escName} (${escCode})</option>`;
                masterSelect.innerHTML += `<option value="${escCode}">${escName} (${escCode})</option>`;
            });

            masterSelect.innerHTML += '<option value="custom">-- Enter custom code... --</option>';
        }

        async function remoteTriggerTVSync() {
            const slaveSelect = document.getElementById('remote-sync-slave-select');
            const masterSelect = document.getElementById('remote-sync-master-select');
            if (!slaveSelect || !masterSelect) return;
            
            const slaveCode = slaveSelect.value;
            let masterCode = masterSelect.value;

            if (!slaveCode) {
                alert('Please select a Slave TV.');
                return;
            }

            if (masterSelect.value === 'custom') {
                const customCode = prompt('Enter the 6-digit code of the Master TV:');
                if (!customCode || customCode.trim().length !== 6 || isNaN(customCode)) {
                    alert('Please enter a valid 6-digit pairing code.');
                    return;
                }
                masterCode = customCode.trim();
            }

            if (!masterCode) {
                alert('Please select or enter a Master TV code.');
                return;
            }

            if (slaveCode === masterCode) {
                alert('Cannot sync a TV to itself.');
                return;
            }

            const masterObj = pairedDisplays.find(d => d.code === masterCode);
            const masterSecret = masterObj ? (masterObj.hmacKey || '') : '';

            const payload = {
                from: 'remote',
                action: 'syncToMaster',
                data: {
                    masterCode: masterCode,
                    masterSecret: masterSecret
                }
            };

            const slaveObj = pairedDisplays.find(d => d.code === slaveCode);
            const slaveSecret = slaveObj ? (slaveObj.hmacKey || '') : '';
            const signedPayload = await signMessage(payload, slaveSecret);

            const slaveTopic = getMqttTopic(slaveCode);
            if (remoteMqttClient && remoteMqttClient.connected) {
                remoteMqttClient.publish(slaveTopic, signedPayload);
                const slaveName = slaveObj ? slaveObj.name : slaveCode;
                const masterName = masterObj ? masterObj.name : masterCode;
                alert(`Command sent: telling Display "${slaveName}" to sync with Master Display "${masterName}".`);
            } else {
                alert('MQTT remote client not connected. Please reconnect first.');
            }
        }

        async function remoteTriggerTVDisconnect() {
            const slaveSelect = document.getElementById('remote-sync-slave-select');
            if (!slaveSelect) return;
            
            const slaveCode = slaveSelect.value;
            if (!slaveCode) {
                alert('Please select a TV to disconnect.');
                return;
            }

            const payload = {
                from: 'remote',
                action: 'disconnectMaster'
            };

            const slaveObj = pairedDisplays.find(d => d.code === slaveCode);
            const slaveSecret = slaveObj ? (slaveObj.hmacKey || '') : '';
            const signedPayload = await signMessage(payload, slaveSecret);

            const slaveTopic = getMqttTopic(slaveCode);
            if (remoteMqttClient && remoteMqttClient.connected) {
                remoteMqttClient.publish(slaveTopic, signedPayload);
                const slaveName = slaveObj ? slaveObj.name : slaveCode;
                alert(`Command sent: telling Display "${slaveName}" to disconnect from master sync.`);
            } else {
                alert('MQTT remote client not connected. Please reconnect first.');
            }
        }

        function renderPairedDisplaysSettings() {
            const listEl = document.getElementById('remote-paired-displays-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            if (pairedDisplays.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px; text-align: center;">No displays paired yet.</div>';
                return;
            }

            pairedDisplays.forEach(d => {
                const item = document.createElement('div');
                const isCurrent = d.code === remotePairCode;
                item.className = 'remote-list-item ' + (isCurrent ? 'selected' : '');
                
                const escCode = escapeHtml(d.code);
                const escName = escapeHtml(d.name);
                
                item.innerHTML = `
                    <div class="remote-item-info" data-action="switch" data-code="${escCode}" style="cursor: pointer; flex-grow: 1;">
                        <div class="remote-item-title" style="font-weight: 700; color: ${isCurrent ? 'var(--accent)' : 'white'};">${escName} ${isCurrent ? '🟢' : ''}</div>
                        <div class="remote-item-desc">Code: ${escCode} ${isCurrent ? '(Active)' : '(Tap to connect)'}</div>
                    </div>
                    <div class="remote-item-actions" style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary" data-action="rename" data-code="${escCode}" style="padding: 4px 8px; font-size: 0.75rem; min-width: auto;">Rename</button>
                        <button class="btn btn-sm btn-danger" data-action="remove" data-code="${escCode}" style="padding: 4px 8px; font-size: 0.75rem; min-width: auto;">✕</button>
                    </div>
                `;

                item.addEventListener('click', (e) => {
                    const target = e.target.closest('[data-action]');
                    if (!target) return;
                    const action = target.getAttribute('data-action');
                    const code = target.getAttribute('data-code');
                    if (action === 'switch') {
                        switchRemotePairing(code);
                    } else if (action === 'rename') {
                        renamePairing(code);
                    } else if (action === 'remove') {
                        removePairing(code);
                    }
                });

                listEl.appendChild(item);
            });
        }

        // --- MOBILE REMOTE CONTROLLER SIDE ---
        let remoteMqttClient = null;
        let remotePairCode = '';
        let remoteState = null;

        function initMobileRemote(code) {
            document.body.classList.add('remote-mode');

            if (remoteMqttClient) {
                try {
                    remoteMqttClient.end(true);
                } catch (e) {}
                remoteMqttClient = null;
            }

            // Load displays list
            loadPairedDisplays(code);

            // Auto-select first paired display if code is empty and we have saved displays
            if ((!code || code.trim() === '') && pairedDisplays.length > 0) {
                code = pairedDisplays[0].code;
            }

            remotePairCode = code || '';

            // Render switcher in header
            renderDisplaySwitcherHeader();

            // Refresh settings lists
            renderPairedDisplaysSettings();
            updateTVSyncDropdowns();

            const container = document.getElementById('mobile-remote-container');
            if (container) container.classList.remove('hidden');

            const entryCard = document.getElementById('remote-pairing-entry-card');
            const disOverlay = document.getElementById('remote-disconnected-overlay');
            const ctrlDeck = document.getElementById('remote-control-deck');

            if (!remotePairCode || remotePairCode.trim() === '') {
                // State A: Show manual code entry screen, hide TV remote deck
                if (entryCard) entryCard.classList.remove('hidden');
                if (disOverlay) disOverlay.classList.add('hidden');
                if (ctrlDeck) ctrlDeck.classList.add('hidden');
                return;
            }

            // State B: Show connecting/disconnected card, wait for TV sync
            if (entryCard) entryCard.classList.add('hidden');
            if (disOverlay) disOverlay.classList.remove('hidden');
            if (ctrlDeck) ctrlDeck.classList.add('hidden');

            const topic = getMqttTopic(remotePairCode);
            console.log(`[Mobile Remote] Connecting. Code: ${code}, Topic: ${topic}`);

            try {
                remoteMqttClient = mqtt.connect(MQTT_BROKER, {
                    clientId: 'livestreamviewer_remote_' + Math.random().toString(16).substring(2, 8),
                    keepalive: 60,
                    reconnectPeriod: 5000
                });

                remoteMqttClient.on('connect', () => {
                    console.log('[Mobile Remote] Connected to MQTT broker');
                    remoteMqttClient.subscribe(topic, (err) => {
                        if (!err) {
                            console.log(`[Mobile Remote] Subscribed to topic: ${topic}`);
                            updateRemoteStatus(true);
                            sendRemoteCommand('ping');
                        }
                    });
                });

                remoteMqttClient.on('message', async (receivedTopic, message) => {
                    if (receivedTopic === topic) {
                        try {
                            const currentDisplay = pairedDisplays.find(d => d.code === remotePairCode);
                            const secret = currentDisplay ? (currentDisplay.hmacKey || '') : '';
                            const verifiedData = await verifyMessage(message.toString(), secret);
                            if (verifiedData && verifiedData.from === 'tv' && verifiedData.type === 'sync') {
                                handleRemoteSync(verifiedData);
                            }
                        } catch (e) {
                            console.error('[Mobile Remote] Error parsing message:', e);
                        }
                    }
                });

                remoteMqttClient.on('close', () => {
                    console.log('[Mobile Remote] Connection closed');
                    updateRemoteStatus(false);
                });

                remoteMqttClient.on('error', (err) => {
                    console.error('[Mobile Remote] MQTT Error:', err);
                    updateRemoteStatus(false);
                });
            } catch (e) {
                console.error('[Mobile Remote] MQTT init failed:', e);
            }
        }

        function updateRemoteStatus(isConnected) {
            const connDot = document.getElementById('remote-conn-dot');
            if (connDot) {
                if (isConnected) {
                    connDot.className = 'status-dot-mini online';
                    connDot.style.backgroundColor = '#10b981';
                    connDot.style.boxShadow = '0 0 6px #10b981';
                } else {
                    connDot.className = 'status-dot-mini checking';
                    connDot.style.backgroundColor = 'var(--text-muted)';
                    connDot.style.boxShadow = '0 0 6px var(--text-muted)';
                }
            }
        }

        function handleRemoteSync(data) {
            remoteState = data;

            const disOverlay = document.getElementById('remote-disconnected-overlay');
            if (disOverlay) disOverlay.classList.add('hidden');

            const ctrlDeck = document.getElementById('remote-control-deck');
            if (ctrlDeck) ctrlDeck.classList.remove('hidden');

            updateRemoteStatus(true);

            // Update layouts active state
            document.querySelectorAll('.remote-grid-2col .remote-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeLayoutBtn = document.getElementById('remote-layout-' + data.layout);
            if (activeLayoutBtn) activeLayoutBtn.classList.add('active');

            // Update auto-cycle rotator button text
            const cycleBtn = document.getElementById('remote-btn-cycle');
            if (cycleBtn) {
                if (data.cycleActive) {
                    cycleBtn.innerText = 'Auto-Cycle Rotator: ON';
                    cycleBtn.classList.add('active');
                } else {
                    cycleBtn.innerText = 'Auto-Cycle Rotator: OFF';
                    cycleBtn.classList.remove('active');
                }
            }

            renderRemoteActiveStreamsList();
            renderRemoteLibraryStreamsList();
            renderRemotePresetsList();
            renderRemoteVirtualGrid();
            renderRemoteMainVirtualGrid();
            renderRemoteArrangeLibraryList();
        }

        function renderRemoteActiveStreamsList() {
            const listEl = document.getElementById('remote-active-streams-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const activeStreams = (remoteState.streams || []).filter(s => s.active);
            if (activeStreams.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border: 1px dashed var(--border-color);">No active streams on TV screen.</div>';
                return;
            }

            activeStreams.forEach(stream => {
                const playerStatus = (remoteState.activePlayersStatus || {})[stream.id] || { isPlaying: true, isMuted: false, volume: 100 };
                const isPlaying = playerStatus.isPlaying !== false;
                const isMuted = playerStatus.isMuted === true;

                const item = document.createElement('div');
                item.className = 'remote-list-item';

                const escName = escapeHtml(stream.name);
                const escCat = escapeHtml(stream.category);
                const escType = escapeHtml(stream.type.toUpperCase());
                const escId = escapeHtml(stream.id);

                const titleHtml = `<div class="remote-item-info">
                    <div class="remote-item-title">${escName}</div>
                    <div class="remote-item-desc">${escCat} • ${escType}</div>
                </div>`;

                const actionsHtml = `<div class="remote-item-actions" style="display: flex; gap: 6px;">
                    <button class="remote-action-btn" data-action="move-up" data-stream-id="${escId}" title="Move Up" style="font-size: 0.75rem;">
                        ▲
                    </button>
                    <button class="remote-action-btn" data-action="move-down" data-stream-id="${escId}" title="Move Down" style="font-size: 0.75rem;">
                        ▼
                    </button>
                    <button class="remote-action-btn ${isPlaying ? 'active' : ''}" data-action="toggle-play" data-stream-id="${escId}" title="Play / Pause">
                        ${isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button class="remote-action-btn ${isMuted ? 'active' : ''}" data-action="toggle-mute" data-stream-id="${escId}" title="Mute / Unmute">
                        ${isMuted ? '🔇' : '🔊'}
                    </button>
                    <button class="remote-action-btn" data-action="fullscreen" data-stream-id="${escId}" title="Fullscreen">
                        🖥️
                    </button>
                </div>`;

                const volumeControlHtml = `<div style="display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                    <span style="font-size: 0.75rem; color: var(--text-muted); width: 30px;">Vol</span>
                    <input type="range" class="remote-volume-slider" data-stream-id="${escId}" min="0" max="100" value="${isMuted ? 0 : (playerStatus.volume !== undefined ? playerStatus.volume : 100)}" style="flex: 1; height: 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); outline: none; margin: 0 4px; accent-color: var(--accent); cursor: pointer;">
                    <span class="vol-label" style="font-size: 0.75rem; color: var(--text-muted); min-width: 32px; text-align: right;">${isMuted ? 'Muted' : (playerStatus.volume !== undefined ? playerStatus.volume + '%' : '100%')}</span>
                </div>`;

                item.innerHTML = `<div style="display: flex; flex-direction: column; width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        ${titleHtml}
                        ${actionsHtml}
                    </div>
                    ${volumeControlHtml}
                </div>`;

                // Add actions listener
                item.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    const action = btn.getAttribute('data-action');
                    const streamId = btn.getAttribute('data-stream-id');
                    if (action === 'move-up') {
                        sendRemoteCommand('moveStream', { id: streamId, direction: 'up' });
                    } else if (action === 'move-down') {
                        sendRemoteCommand('moveStream', { id: streamId, direction: 'down' });
                    } else if (action === 'toggle-play') {
                        sendRemoteCommand('togglePlay', { streamId: streamId });
                    } else if (action === 'toggle-mute') {
                        sendRemoteCommand('toggleMute', { streamId: streamId });
                    } else if (action === 'fullscreen') {
                        sendRemoteCommand('fullscreenStream', { streamId: streamId });
                    }
                });

                // Add volume slider listeners
                const slider = item.querySelector('.remote-volume-slider');
                const label = item.querySelector('.vol-label');
                slider.addEventListener('change', (e) => {
                    sendRemoteCommand('setVolume', { streamId: stream.id, volume: e.target.value });
                });
                slider.addEventListener('input', (e) => {
                    label.innerText = e.target.value + '%';
                });

                listEl.appendChild(item);
            });
        }

        function renderRemoteLibraryStreamsList() {
            const listEl = document.getElementById('remote-library-streams-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const streams = remoteState.streams || [];
            if (streams.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px; text-align: center;">Library is empty.</div>';
                return;
            }

            streams.forEach(stream => {
                const item = document.createElement('div');
                item.className = 'remote-list-item';

                const escName = escapeHtml(stream.name);
                const escCat = escapeHtml(stream.category);
                const escType = escapeHtml(stream.type.toUpperCase());

                const titleHtml = `<div class="remote-item-info">
                    <div class="remote-item-title">${escName}</div>
                    <div class="remote-item-desc">${escCat} • ${escType}</div>
                </div>`;

                const switchHtml = `<div class="remote-item-actions">
                    <label class="remote-switch">
                        <input type="checkbox" ${stream.active ? 'checked' : ''}>
                        <span class="remote-slider"></span>
                    </label>
                </div>`;

                item.innerHTML = titleHtml + switchHtml;

                const checkbox = item.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', (e) => {
                    sendRemoteCommand('toggleStream', { streamId: stream.id, checked: e.target.checked });
                });

                listEl.appendChild(item);
            });
        }

        function renderRemotePresetsList() {
            const listEl = document.getElementById('remote-presets-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const presets = remoteState.presets || [];
            if (presets.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border: 1px dashed var(--border-color);">No saved presets found on TV.</div>';
                return;
            }

            presets.forEach(preset => {
                const item = document.createElement('div');
                item.className = 'remote-list-item';

                const escName = escapeHtml(preset.name);
                const escLayout = escapeHtml(preset.layout);

                const titleHtml = `<div class="remote-item-info">
                    <div class="remote-item-title">${escName}</div>
                    <div class="remote-item-desc">Layout: ${escLayout} • ${(preset.streams || preset.activeStreamIds || []).length} channels</div>
                </div>`;

                const actionHtml = `<div class="remote-item-actions" style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn btn-sm btn-primary btn-load" style="padding: 6px 12px; font-size: 0.75rem;">Load</button>
                    <button class="btn btn-sm btn-danger btn-delete" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 6px; display: flex; align-items: center; justify-content: center; height: 26px; width: 26px; border: none; cursor: pointer; color: #ef4444; background: rgba(239, 68, 68, 0.1);">✕</button>
                </div>`;

                item.innerHTML = titleHtml + actionHtml;

                item.querySelector('.btn-load').addEventListener('click', () => {
                    sendRemoteCommand('loadPreset', { name: preset.name });
                });
                item.querySelector('.btn-delete').addEventListener('click', () => {
                    handleRemoteDeletePreset(preset.name);
                });

                listEl.appendChild(item);
            });
        }

        function promptRemoteSavePreset() {
            const name = prompt("Enter a name for the current layout preset:");
            if (name) {
                const trimmed = name.trim();
                if (trimmed) {
                    sendRemoteCommand('savePreset', { name: trimmed });
                }
            }
        }

        function handleRemoteDeletePreset(name) {
            if (confirm(`Are you sure you want to delete preset "${name}"?`)) {
                sendRemoteCommand('deletePreset', { name: name });
            }
        }

        function switchRemoteTab(tabId) {
            document.querySelectorAll('.remote-tabs .remote-tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeTabBtn = document.getElementById('btn-' + tabId);
            if (activeTabBtn) activeTabBtn.classList.add('active');

            document.querySelectorAll('.remote-content .remote-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');
        }

        async function sendRemoteCommand(action, data = {}) {
            if (remoteMqttClient && remoteMqttClient.connected) {
                const topic = getMqttTopic(remotePairCode);
                const currentDisplay = pairedDisplays.find(d => d.code === remotePairCode);
                const secret = currentDisplay ? (currentDisplay.hmacKey || '') : '';
                
                const payload = {
                    from: 'remote',
                    action: action,
                    data: data
                };
                const signedPayload = await signMessage(payload, secret);
                remoteMqttClient.publish(topic, signedPayload);
                console.log('[Mobile Remote] Sent command:', action);
            }
        }

        function handleRemoteAddStream(event) {
            event.preventDefault();
            const nameEl = document.getElementById('remote-add-name');
            const urlEl = document.getElementById('remote-add-url');
            const typeEl = document.getElementById('remote-add-type');

            const name = nameEl.value.trim();
            const url = urlEl.value.trim();
            const type = typeEl.value;

            if (!name || !url) return;

            sendRemoteCommand('addStream', {
                stream: {
                    name: name,
                    url: url,
                    type: type,
                    category: 'Remote Custom'
                }
            });

            nameEl.value = '';
            urlEl.value = '';

            alert(`Command sent: Add stream "${name}"`);
        }

        function connectWithInputCode() {
            const inputEl = document.getElementById('remote-pairing-input');
            if (!inputEl) return;
            const code = inputEl.value.trim();
            if (code.length !== 6 || isNaN(code)) {
                alert('Please enter a valid 6-digit pairing code.');
                return;
            }
            // Redirect to mobile view with pair code parameter
            window.location.href = window.location.pathname + "?view=mobile&pair=" + code;
        }

        // --- MOBILE REMOTE ARRANGE / DRAG AND DROP ACTIONS ---
        let remoteDragSourceId = null;
        let selectedRemoteStreamId = null;

        function handleRemoteDragStart(e, streamId) {
            remoteDragSourceId = streamId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', streamId);
            
            // Visual feedback on start dragging
            const item = document.querySelector(`[ondragstart*="${streamId}"]`);
            if (item) item.classList.add('dragging');
        }

        function handleRemoteDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.currentTarget.classList.add('drag-over');
            return false;
        }

        function handleRemoteDragLeave(e) {
            e.currentTarget.classList.remove('drag-over');
        }

        function handleRemoteDrop(e, slotIndex, targetStreamId) {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');

            // Clean up visual dragging state
            document.querySelectorAll('.remote-draggable-item, .remote-virtual-slot').forEach(item => {
                item.classList.remove('dragging');
            });

            if (!remoteDragSourceId) return false;

            if (targetStreamId) {
                // There is a stream in this slot. Swap them!
                if (remoteDragSourceId !== targetStreamId) {
                    sendRemoteCommand('swapStreams', { id1: remoteDragSourceId, id2: targetStreamId });
                }
            } else {
                // Empty slot. Place it at the target slot index!
                sendRemoteCommand('placeStream', { streamId: remoteDragSourceId, slotIndex: slotIndex });
            }
            remoteDragSourceId = null;
            return false;
        }

        function handleRemoteSlotClick(slotIndex, streamId) {
            if (selectedRemoteStreamId) {
                if (streamId) {
                    // Swap
                    if (selectedRemoteStreamId !== streamId) {
                        sendRemoteCommand('swapStreams', { id1: selectedRemoteStreamId, id2: streamId });
                    }
                } else {
                    // Empty slot. Place it!
                    sendRemoteCommand('placeStream', { streamId: selectedRemoteStreamId, slotIndex: slotIndex });
                }
                
                // Deselect
                selectedRemoteStreamId = null;
                renderRemoteArrangeLibraryList();
            }
        }

        function handleRemoteLibraryItemClick(streamId) {
            if (selectedRemoteStreamId === streamId) {
                selectedRemoteStreamId = null;
            } else {
                selectedRemoteStreamId = streamId;
            }
            renderRemoteArrangeLibraryList();
        }

        function renderRemoteVirtualGrid() {
            const gridEl = document.getElementById('remote-virtual-grid');
            if (!gridEl) return;
            gridEl.innerHTML = '';

            const layout = remoteState.layout || 'cinema';
            const capacity = LAYOUT_CAPACITIES[layout] || 4;
            const activeStreams = (remoteState.streams || []).filter(s => s.active);

            // Set the class corresponding to the active TV layout and clear any inline templates
            gridEl.className = 'remote-virtual-grid-container ' + layout;
            gridEl.style.gridTemplateColumns = '';

            const labelTextFunc = (idx) => capacity > 6 ? `#${idx + 1}` : `Window ${idx + 1}`;

            for (let i = 0; i < capacity; i++) {
                const stream = activeStreams[i];
                const slot = document.createElement('div');
                
                let slotClass = 'remote-virtual-slot';
                if (layout === 'layout-1-5') {
                    if (i === 0) slotClass += ' large';
                } else if (layout === 'layout-2-3') {
                    if (i < 2) slotClass += ' large';
                    else slotClass += ' small';
                }

                if (stream) {
                    slot.className = slotClass + ' active';
                    slot.draggable = true;
                    
                    const escName = escapeHtml(stream.name);

                    slot.addEventListener('dragstart', (event) => handleRemoteDragStart(event, stream.id));
                    slot.addEventListener('dragover', (event) => handleRemoteDragOver(event));
                    slot.addEventListener('dragleave', (event) => handleRemoteDragLeave(event));
                    slot.addEventListener('drop', (event) => handleRemoteDrop(event, i, stream.id));
                    slot.addEventListener('click', () => handleRemoteSlotClick(i, stream.id));
                    
                    slot.innerHTML = `
                        <div class="remote-slot-index">${labelTextFunc(i)}</div>
                        <div class="remote-slot-name">${escName}</div>
                        <button class="remote-slot-remove-btn" title="Remove stream">✕</button>
                    `;
                    
                    slot.querySelector('.remote-slot-remove-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        sendRemoteCommand('toggleStream', { streamId: stream.id, checked: false });
                    });
                } else {
                    slot.className = slotClass;
                    slot.addEventListener('dragover', (event) => handleRemoteDragOver(event));
                    slot.addEventListener('dragleave', (event) => handleRemoteDragLeave(event));
                    slot.addEventListener('drop', (event) => handleRemoteDrop(event, i, null));
                    slot.addEventListener('click', () => handleRemoteSlotClick(i, null));
                    
                    slot.innerHTML = `
                        <div class="remote-slot-index">${labelTextFunc(i)}</div>
                        <div class="remote-slot-empty">Empty</div>
                    `;
                }
                gridEl.appendChild(slot);
            }
        }

        function renderRemoteMainVirtualGrid() {
            const gridEl = document.getElementById('remote-main-virtual-grid');
            if (!gridEl) return;
            gridEl.innerHTML = '';

            const layout = remoteState.layout || 'cinema';
            const capacity = LAYOUT_CAPACITIES[layout] || 4;
            const activeStreams = (remoteState.streams || []).filter(s => s.active);

            // Set the class corresponding to the active TV layout and clear any inline templates
            gridEl.className = 'remote-virtual-grid-container ' + layout;
            gridEl.style.gridTemplateColumns = '';

            const labelTextFunc = (idx) => capacity > 6 ? `#${idx + 1}` : `Window ${idx + 1}`;

            for (let i = 0; i < capacity; i++) {
                const stream = activeStreams[i];
                const slot = document.createElement('div');
                
                let slotClass = 'remote-virtual-slot';
                if (layout === 'layout-1-5') {
                    if (i === 0) slotClass += ' large';
                } else if (layout === 'layout-2-3') {
                    if (i < 2) slotClass += ' large';
                    else slotClass += ' small';
                }

                if (stream) {
                    slot.className = slotClass + ' active';
                    
                    const escName = escapeHtml(stream.name);

                    slot.addEventListener('click', () => {
                        sendRemoteCommand('togglePlay', { streamId: stream.id });
                    });
                    
                    const playerStatus = (remoteState.activePlayersStatus || {})[stream.id] || { isPlaying: true, isMuted: false };
                    const isPlaying = playerStatus.isPlaying !== false;
                    const isMuted = playerStatus.isMuted === true;

                    const statusIcon = isPlaying ? '⏸️' : '▶️';
                    const muteIcon = isMuted ? '🔇' : '🔊';

                    slot.innerHTML = `
                        <div class="remote-slot-index">${labelTextFunc(i)}</div>
                        <div class="remote-slot-name">${escName}</div>
                        <div style="display: flex; gap: 6px; font-size: 0.8rem; margin-top: 4px; align-items: center; justify-content: center; pointer-events: none;">
                            <span>${statusIcon}</span>
                            <span>${muteIcon}</span>
                        </div>
                    `;
                } else {
                    slot.className = slotClass;
                    slot.innerHTML = `
                        <div class="remote-slot-index">${labelTextFunc(i)}</div>
                        <div class="remote-slot-empty">Empty</div>
                    `;
                }
                gridEl.appendChild(slot);
            }
        }

        function openRemoteLayoutSelector() {
            const popup = document.getElementById('remote-layout-popup');
            if (popup) popup.classList.add('open');
        }

        function closeRemoteLayoutSelector() {
            const popup = document.getElementById('remote-layout-popup');
            if (popup) popup.classList.remove('open');
        }

        function closeRemoteLayoutSelectorOnOverlay(e) {
            if (e.target === document.getElementById('remote-layout-popup')) {
                closeRemoteLayoutSelector();
            }
        }

        function renderRemoteArrangeLibraryList() {
            const listEl = document.getElementById('remote-arrange-library-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const streams = remoteState.streams || [];
            if (streams.length === 0) {
                listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px; text-align: center;">No channels in library.</div>';
                return;
            }

            streams.forEach(stream => {
                const item = document.createElement('div');
                const isSelected = selectedRemoteStreamId === stream.id;
                
                item.className = 'remote-list-item remote-draggable-item ' + (isSelected ? 'selected' : '');
                item.draggable = true;
                
                const escName = escapeHtml(stream.name);
                const escCat = escapeHtml(stream.category);

                item.addEventListener('dragstart', (event) => handleRemoteDragStart(event, stream.id));
                item.addEventListener('click', () => handleRemoteLibraryItemClick(stream.id));

                const titleHtml = `<div class="remote-item-info">
                    <div class="remote-item-title">${escName}</div>
                    <div class="remote-item-desc">${escCat} • ${stream.active ? 'ACTIVE' : 'INACTIVE'}</div>
                </div>`;

                const indicatorHtml = `<div class="remote-item-actions" style="font-size: 1.1rem; color: var(--text-muted); margin-right: 4px;">
                    ${stream.active ? '🟢' : '⚪'}
                </div>`;

                item.innerHTML = titleHtml + indicatorHtml;
                listEl.appendChild(item);
            });
        }



export {
    persistState,
    initVisitorCounter,
    loadThirdPartyAPIs,
    updateHeaderLocation,
    updateClock,
    fetchWeatherForecast,
    updateWeatherBadge,
    getWeatherDescription,
    initLocationAndWeather,
    detectIpLocation,
    getWeatherEmoji,
    renderWeatherPanel,
    handleDragStart,
    handleSidebarDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleSidebarDragEnd,
    handleTrashcanDragOver,
    handleTrashcanDragLeave,
    handleTrashcanDrop,
    handleGridDragOver,
    handleGridDragLeave,
    handleGridDrop,
    swapStreams,
    toggleSidebar,
    filterSidebarStreams,
    renderSidebarStreams,
    renderActiveStreams,
    renderStreamCard,
    fullscreenStream,
    updatePlayBtnIcon,
    updateMuteBtnIcon,
    updateFloatingTabVolume,
    togglePlayStream,
    toggleMuteStream,
    toggleFSStream,
    popoutStream,
    captureSnapshot,
    downloadBlob,
    openSettings,
    closeSettings,
    closeSettingsOnOverlay,
    openSettingsToTab,
    switchTab,
    populateSettings,
    savePreset,
    deletePreset,
    loadPreset,
    cycleStreamLayoutPreset,
    getPresets,
    resetToSystemDefaults,
    updateSystemDefaultsUI,
    initializeWeatherCam,
    updateWeatherCam,
    drawRain,
    drawSnow,
    drawClouds,
    initializeNotesWidget,
    updateNotesEventLog,
    clearNotesEventLog,
    addCustomStreamFromSettings,
    toggleStreamActive,
    handleLayoutChange,
    toggleCycle,
    cycleStreamsRotator,
    toggleFS,
    renderDirectoryBrowser,
    switchBrowserCategory,
    previewDirectoryStream,
    closePreviewModal,
    closePreviewOnOverlay,
    showInsecureRemoteWarning,
    openPairingModal,
    closePairingModal,
    closePairingOnOverlay,
    copyPairingURL,
    regeneratePairingCode,
    updateTVSyncUI,
    addNewPairingFromSettings,
    renamePairing,
    removePairing,
    switchRemotePairing,
    openRemoteSwitcherPopup,
    closeRemoteSwitcherPopup,
    closeRemoteSwitcherOnOverlay,
    selectDisplayFromSwitcher,
    renderPairedDisplaysSettings,
    initMobileRemote,
    initMobileRemoteUI,
    sendRemoteCommand,
    promptRemoteSavePreset,
    handleRemoteDeletePreset,
    switchRemoteTab,
    handleRemoteAddStream,
    connectWithInputCode,
    handleRemoteDragStart as handleRemoteDragStartUI,
    handleRemoteDragOver as handleRemoteDragOverUI,
    handleRemoteDragLeave as handleRemoteDragLeaveUI,
    handleRemoteDrop as handleRemoteDropUI,
    handleRemoteSlotClick as handleRemoteSlotClickUI,
    handleRemoteLibraryItemClick as handleRemoteLibraryItemClickUI,
    renderRemoteVirtualGrid,
    renderRemoteMainVirtualGrid,
    openRemoteLayoutSelector,
    closeRemoteLayoutSelector,
    closeRemoteLayoutSelectorOnOverlay,
    renderRemoteArrangeLibraryList,
    remoteTriggerTVSync,
    remoteTriggerTVDisconnect,
    handleMasterTVSync,
    cycleWeatherView,
    addDirectoryStreamFromPreview,
    addDirectoryStream
};
