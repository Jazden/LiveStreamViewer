import { 
    appState, 
    activePlayers, 
    cycleInterval, 
    tvSyncMasterCode, 
    setTvSyncMasterCode,
    tvSyncMasterSecret, 
    setTvSyncMasterSecret,
    tvOriginalStateBackup, 
    setTvOriginalStateBackup,
    lastSyncedMasterJson, 
    setLastSyncedMasterJson,
    getCookie, 
    setCookie, 
    deleteCookie 
} from './state.js';

import { 
    sha256Hex, 
    signMessage, 
    verifyMessage, 
    tvHmacSecret, 
    setTvHmacSecret 
} from './crypto.js';

import { 
    togglePlay, 
    toggleMute, 
    setStreamVolume 
} from './player.js';

import {
    closePairingModal,
    handleLayoutChange,
    toggleStreamActive,
    loadPreset,
    savePreset,
    deletePreset,
    toggleCycle,
    toggleFS,
    moveStream,
    swapStreams,
    placeStream,
    cycleStreamLayoutPreset,
    cycleWeatherView,
    persistState,
    populateSidebarCategories,
    populateSettings,
    renderActiveStreams,
    renderSidebarStreams,
    updateTVSyncUI,
    initMobileRemoteUI,
    getPresets,
    generateHmacSecret,
    handleMasterTVSync
} from './ui.js';

export const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
export const MQTT_TOPIC_PREFIX = 'livestreamviewer/pair/';

export let tvMqttClient = null;
export let tvPairingCode = '';
export let remoteMqttClient = null;
export let remotePairCode = '';

export function setTvMqttClient(val) { tvMqttClient = val; }
export function setTvPairingCode(val) { tvPairingCode = val; }
export function setRemoteMqttClient(val) { remoteMqttClient = val; }
export function setRemotePairCode(val) { remotePairCode = val; }

export function getMqttTopic(code) {
    const str = "ls_salt_" + code;
    return MQTT_TOPIC_PREFIX + sha256Hex(str);
}

export function initTVPairing() {
    tvPairingCode = getCookie('pairing_code');
    if (!tvPairingCode || tvPairingCode.length !== 6) {
        tvPairingCode = Math.floor(100000 + Math.random() * 900000).toString();
        setCookie('pairing_code', tvPairingCode, 365);
    }

    let currentSecret = getCookie('pairing_hmac_secret');
    if (!currentSecret) {
        currentSecret = generateHmacSecret();
        setCookie('pairing_hmac_secret', currentSecret, 365);
    }
    setTvHmacSecret(currentSecret);

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

export async function sendMqttSync() {
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
            cycleActive: !cycleInterval, // check cycles
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

export function handleRemoteCommand(msg) {
    const now = Date.now();
    remoteCommandTimestamps = remoteCommandTimestamps.filter(t => now - t < 1000);
    if (remoteCommandTimestamps.length >= 10) {
        console.warn("[Rate Limit] Rate limit exceeded. Dropping remote command:", msg.action);
        return;
    }
    remoteCommandTimestamps.push(now);

    console.log('[TV Pairing] Received remote command:', msg.action);
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
                togglePlay(msg.data.streamId); // Fallback mapping or toggle
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
                const newStream = {
                    id: 'custom-' + Date.now(),
                    name: s.name,
                    url: s.url,
                    type: s.type,
                    category: s.category || 'General',
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
        case 'cyclePreset':
            cycleStreamLayoutPreset();
            break;
        case 'cycleWeather':
            cycleWeatherView();
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

export function connectTVSync(masterCode, masterSecret) {
    if (!masterCode) {
        const inputEl = document.getElementById('tv-sync-code-input');
        if (!inputEl) return;
        masterCode = inputEl.value.trim();
        if (masterCode.length !== 6 || isNaN(masterCode)) {
            alert('Please enter a valid 6-digit Master TV pairing code.');
            return;
        }
    }

    if (masterCode === tvPairingCode) {
        alert('Cannot sync a TV to itself. Please enter another TV\'s pairing code.');
        return;
    }

    setTvSyncMasterCode(masterCode);
    setTvSyncMasterSecret(masterSecret || '');
    setCookie('tv_sync_master_code', masterCode, 365);
    setCookie('tv_sync_master_secret', masterSecret || '', 365);
    
    // Save original state backup
    setTvOriginalStateBackup(JSON.stringify({
        layout: appState.layout,
        streams: appState.streams
    }));

    const masterTopic = getMqttTopic(masterCode);
    console.log(`[TV Sync] Connecting to Master topic: ${masterTopic}`);

    if (tvMqttClient && tvMqttClient.connected) {
        tvMqttClient.subscribe(masterTopic, async (err) => {
            if (!err) {
                console.log(`[TV Sync] Subscribed to Master TV: ${masterCode}`);
                updateTVSyncUI();
                
                // Ping Master to request state sync immediately
                const signedPing = await signMessage({ from: 'tv', type: 'ping' }, tvSyncMasterSecret);
                tvMqttClient.publish(masterTopic, signedPing);
            } else {
                console.error('[TV Sync] Subscription failed:', err);
            }
        });
    }
}

export function disconnectTVSync() {
    if (tvSyncMasterCode) {
        const masterTopic = getMqttTopic(tvSyncMasterCode);
        if (tvMqttClient && tvMqttClient.connected) {
            tvMqttClient.unsubscribe(masterTopic);
        }
    }

    setTvSyncMasterCode('');
    setTvSyncMasterSecret('');
    deleteCookie('tv_sync_master_code');
    deleteCookie('tv_sync_master_secret');

    // Restore backup
    if (tvOriginalStateBackup) {
        try {
            const orig = JSON.parse(tvOriginalStateBackup);
            appState.layout = orig.layout;
            appState.streams = orig.streams;
            persistState();
            renderActiveStreams();
        } catch (e) {
            console.error('[TV Sync] Error restoring original backup state:', e);
        }
        setTvOriginalStateBackup(null);
    }

    updateTVSyncUI();
}
