import {
    appState,
    remoteState,
    pairedDisplays,
    streamUptimeStatuses,
    activePlayers,
    tvSyncMasterCode,
    tvSyncMasterSecret,
    tvOriginalStateBackup,
    lastSyncedMasterJson,
    activeWeatherAnimations,
    cinemaActiveStreamId,
    cycleInterval,
    dragSourceId,
    youtubeAPIReady,
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
} from './modules/state.js';

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
} from './modules/crypto.js';

import {
    initializePlayer,
    destroyPlayer,
    clearAllPlayers,
    togglePlay,
    toggleMute,
    setStreamVolume,
    getYouTubeId,
    getTwitchChannel
} from './modules/player.js';

import {
    tvMqttClient,
    tvPairingCode,
    remoteMqttClient,
    remotePairCode,
    getMqttTopic,
    initTVPairing,
    sendMqttSync,
    handleRemoteCommand,
    connectTVSync,
    disconnectTVSync
} from './modules/mqtt.js';

import {
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
    handleRemoteDragStartUI,
    handleRemoteDragOverUI,
    handleRemoteDragLeaveUI,
    handleRemoteDropUI,
    handleRemoteSlotClickUI,
    handleRemoteLibraryItemClickUI,
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
} from './modules/ui.js';


        // Initialize App
        function initApp() {
            // Check query parameters to route to TV view or Mobile Remote view
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            const pairCode = urlParams.get('pair');
            
            if (view === 'mobile' || (!view && pairCode)) {
                initMobileRemote(pairCode);
                return;
            }

            // Load layout
            const savedLayout = getCookie('stream_layout');
            if (savedLayout) appState.layout = savedLayout;
            
            // Load rotator configuration
            const savedRotator = getCookie('rotator_config');
            if (savedRotator) {
                try {
                    const rot = JSON.parse(savedRotator);
                    appState.rotatorMode = rot.mode || 'streams';
                    appState.rotatorInterval = rot.interval || 30;
                } catch (e) {}
            }
            
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
            
            // Populate presets list in the header dropdown
            updatePresetDropdown();

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
            
            // Asynchronously verify directory streams in the background
            verifyPublicDirectoryStreams();

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

        window.openPairingModal = openPairingModal;
        window.closePairingModal = closePairingModal;
        window.closePairingOnOverlay = closePairingOnOverlay;
        window.copyPairingURL = copyPairingURL;
        window.regeneratePairingCode = regeneratePairingCode;
        window.switchRemoteTab = switchRemoteTab;
        window.sendRemoteCommand = sendRemoteCommand;
        window.handleRemoteAddStream = handleRemoteAddStream;
        window.sendMqttSync = sendMqttSync;
        window.connectWithInputCode = connectWithInputCode;

        window.handleRemoteDragStart = handleRemoteDragStart;
        window.handleRemoteDragOver = handleRemoteDragOver;
        window.handleRemoteDragLeave = handleRemoteDragLeave;
        window.handleRemoteDrop = handleRemoteDrop;
        window.handleRemoteSlotClick = handleRemoteSlotClick;
        window.handleRemoteLibraryItemClick = handleRemoteLibraryItemClick;
        window.renderRemoteVirtualGrid = renderRemoteVirtualGrid;
        window.renderRemoteArrangeLibraryList = renderRemoteArrangeLibraryList;
        window.promptRemoteSavePreset = promptRemoteSavePreset;
        window.handleRemoteDeletePreset = handleRemoteDeletePreset;
        window.renderRemoteMainVirtualGrid = renderRemoteMainVirtualGrid;
        window.openRemoteLayoutSelector = openRemoteLayoutSelector;
        window.closeRemoteLayoutSelector = closeRemoteLayoutSelector;
        window.closeRemoteLayoutSelectorOnOverlay = closeRemoteLayoutSelectorOnOverlay;
        window.connectTVSync = connectTVSync;
        window.disconnectTVSync = disconnectTVSync;
        window.updateTVSyncUI = updateTVSyncUI;
        window.renamePairing = renamePairing;
        window.removePairing = removePairing;
        window.addNewPairingFromSettings = addNewPairingFromSettings;
        window.remoteTriggerTVSync = remoteTriggerTVSync;
        window.remoteTriggerTVDisconnect = remoteTriggerTVDisconnect;
        window.switchRemotePairing = switchRemotePairing;
        window.openRemoteSwitcherPopup = openRemoteSwitcherPopup;
        window.closeRemoteSwitcherPopup = closeRemoteSwitcherPopup;
        window.closeRemoteSwitcherOnOverlay = closeRemoteSwitcherOnOverlay;
        window.selectDisplayFromSwitcher = selectDisplayFromSwitcher;

        // Run application
        initApp();
