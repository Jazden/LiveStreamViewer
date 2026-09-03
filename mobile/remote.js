// LiveStreamViewer - Standalone Mobile Remote Controller
(function() {
    'use strict';

    const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

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

    // Helper: HTML escaping
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>"']/g, function(m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return m;
            }
        });
    }

    // Cryptographic Helpers: HMAC-SHA256 & Base64URL
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
        if (!secret) return '';
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

    async function verifyMessage(rawMessageStr, secret) {
        let envelope;
        try {
            envelope = JSON.parse(rawMessageStr);
        } catch (e) {
            return null;
        }

        if (!envelope || typeof envelope !== 'object') {
            return null;
        }

        // If not envelope format, return raw parsed message
        if (!envelope.p || !envelope.s || !envelope.n || !envelope.t) {
            return envelope;
        }

        // If remote has no secret stored (manual pairing code entry), unpack payload directly
        if (!secret) {
            try {
                return JSON.parse(envelope.p);
            } catch (e) {
                return null;
            }
        }

        // Check timestamp (within 300s / 5 min)
        const now = Date.now();
        if (Math.abs(now - envelope.t) > 300000) {
            console.warn("[Crypto] TV message timestamp expired: " + envelope.t + " (current: " + now + "). Unpacking in unverified mode.");
            try {
                const unverified = JSON.parse(envelope.p);
                unverified._unverified = true;
                return unverified;
            } catch (e) {
                return null;
            }
        }

        const signatureInput = `${envelope.p}|${envelope.n}|${envelope.t}`;
        const calculatedSig = await hmacSha256(signatureInput, secret);
        if (calculatedSig !== envelope.s) {
            console.warn('[Crypto] HMAC signature mismatch. Unpacking in unverified mode.');
            // Clear any stale key from this display in pairedDisplays to prevent repeated mismatches
            const currentDisplay = pairedDisplays.find(d => d.code === remotePairCode);
            if (currentDisplay) {
                currentDisplay.hmacKey = '';
                savePairedDisplays();
                renderDisplaySwitcherHeader();
            }
            try {
                const unverified = JSON.parse(envelope.p);
                unverified._unverified = true;
                return unverified;
            } catch (e) {
                return null;
            }
        }

        try {
            return JSON.parse(envelope.p);
        } catch (e) {
            return null;
        }
    }

    const MQTT_TOPIC_PREFIX = 'livestreamviewer/pair/';

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

    // --- STATE MANAGEMENT ---
    let pairedDisplays = [];
    let remoteMqttClient = null;
    let remotePairCode = '';
    let remoteState = null;
    let remoteDragSourceId = null;
    let selectedRemoteStreamId = null;
    let remotePingInterval = null;

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

    function initMobileRemote(code) {
        document.body.classList.add('remote-mode');

        if (remotePingInterval) {
            clearInterval(remotePingInterval);
            remotePingInterval = null;
        }

        if (remoteMqttClient) {
            try {
                remoteMqttClient.end(true);
            } catch (e) {}
            remoteMqttClient = null;
        }

        loadPairedDisplays(code);

        if ((!code || code.trim() === '') && pairedDisplays.length > 0) {
            code = pairedDisplays[0].code;
        }

        remotePairCode = code || '';

        renderDisplaySwitcherHeader();
        renderPairedDisplaysSettings();
        updateTVSyncDropdowns();

        const entryCard = document.getElementById('remote-pairing-entry-card');
        const disOverlay = document.getElementById('remote-disconnected-overlay');
        const ctrlDeck = document.getElementById('remote-control-deck');

        if (!remotePairCode || remotePairCode.trim() === '') {
            if (entryCard) entryCard.classList.remove('hidden');
            if (disOverlay) disOverlay.classList.add('hidden');
            if (ctrlDeck) ctrlDeck.classList.add('hidden');
            return;
        }

        if (entryCard) entryCard.classList.add('hidden');
        if (disOverlay) disOverlay.classList.remove('hidden');
        if (ctrlDeck) ctrlDeck.classList.add('hidden');

        const overlayTitle = document.getElementById('remote-status-title');
        const overlayDesc = document.getElementById('remote-status-desc');
        if (overlayTitle) overlayTitle.innerText = `Connecting to TV #${remotePairCode}...`;
        if (overlayDesc) overlayDesc.innerText = 'Connecting to communication broker...';

        const topic = getMqttTopic(remotePairCode);
        console.log(`[Mobile Remote] Connecting. Code: ${code}, Topic: ${topic}`);

        try {
            if (typeof mqtt === 'undefined') {
                throw new Error('MQTT library failed to load from CDN. Check network connection.');
            }

            remoteMqttClient = mqtt.connect(MQTT_BROKER, {
                clientId: 'livestreamviewer_remote_' + Math.random().toString(16).substring(2, 8),
                keepalive: 60,
                reconnectPeriod: 5000
            });

            remoteMqttClient.on('connect', () => {
                console.log('[Mobile Remote] Connected to MQTT broker');
                if (overlayDesc) overlayDesc.innerText = `Connected to broker. Pinging TV #${remotePairCode}...`;
                remoteMqttClient.subscribe(topic, (err) => {
                    if (!err) {
                        console.log(`[Mobile Remote] Subscribed to topic: ${topic}`);
                        updateRemoteStatus(true);
                        sendRemoteCommand('ping');

                        if (remotePingInterval) clearInterval(remotePingInterval);
                        remotePingInterval = setInterval(() => {
                            if (!remoteState && remoteMqttClient && remoteMqttClient.connected) {
                                console.log('[Mobile Remote] Retrying ping to TV...');
                                sendRemoteCommand('ping');
                            } else if (remoteState) {
                                clearInterval(remotePingInterval);
                                remotePingInterval = null;
                            }
                        }, 2000);
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
                if (overlayTitle) overlayTitle.innerText = 'Disconnected from Display';
                if (overlayDesc) overlayDesc.innerText = `Connection lost. Waiting to reconnect to TV #${remotePairCode}...`;
            });

            remoteMqttClient.on('error', (err) => {
                console.error('[Mobile Remote] MQTT Error:', err);
                updateRemoteStatus(false);
                if (overlayTitle) overlayTitle.innerText = 'Connection Error';
                if (overlayDesc) overlayDesc.innerText = `Broker communication error. Retrying...`;
            });
        } catch (e) {
            console.error('[Mobile Remote] MQTT init failed:', e);
            if (overlayTitle) overlayTitle.innerText = 'Connection Failed';
            if (overlayDesc) overlayDesc.innerText = `${e.message || e}. Please reload.`;
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
        if (remotePingInterval) {
            clearInterval(remotePingInterval);
            remotePingInterval = null;
        }
        remoteState = data;

        const disOverlay = document.getElementById('remote-disconnected-overlay');
        if (disOverlay) disOverlay.classList.add('hidden');

        const ctrlDeck = document.getElementById('remote-control-deck');
        if (ctrlDeck) ctrlDeck.classList.remove('hidden');

        updateRemoteStatus(true);

        document.querySelectorAll('.remote-grid-2col .remote-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeLayoutBtn = document.getElementById('remote-layout-' + data.layout);
        if (activeLayoutBtn) activeLayoutBtn.classList.add('active');

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
                <button class="remote-action-btn" data-action="move-up" data-stream-id="${escId}" title="Move Up" style="font-size: 0.75rem;">▲</button>
                <button class="remote-action-btn" data-action="move-down" data-stream-id="${escId}" title="Move Down" style="font-size: 0.75rem;">▼</button>
                <button class="remote-action-btn ${isPlaying ? 'active' : ''}" data-action="toggle-play" data-stream-id="${escId}" title="Play / Pause">${isPlaying ? '⏸️' : '▶️'}</button>
                <button class="remote-action-btn ${isMuted ? 'active' : ''}" data-action="toggle-mute" data-stream-id="${escId}" title="Mute / Unmute">${isMuted ? '🔇' : '🔊'}</button>
                <button class="remote-action-btn" data-action="fullscreen" data-stream-id="${escId}" title="Fullscreen">🖥️</button>
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
            if (stream.hidden || stream.hiddenFromPicker) return;
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

        const name = nameEl.value.trim().substring(0, 100);
        const rawUrl = urlEl.value.trim();
        const type = typeEl.value.toLowerCase().trim();

        if (!name) {
            alert('Please enter a stream name.');
            return;
        }

        const VALID_TYPES = ['hls', 'youtube', 'twitch', 'iframe', 'weather', 'notes'];
        if (!VALID_TYPES.includes(type)) {
            alert('Invalid stream type selected.');
            return;
        }

        // Client-side URL format validation
        let isValidUrl = false;
        if (type === 'weather' || type === 'notes') {
            isValidUrl = true;
        } else if (type === 'twitch' && /^[a-zA-Z0-9_]{2,35}$/.test(rawUrl)) {
            isValidUrl = true;
        } else {
            try {
                const parsed = new URL(rawUrl);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    isValidUrl = true;
                }
            } catch (e) {
                isValidUrl = false;
            }
        }

        if (!isValidUrl) {
            alert('Please enter a valid HTTP or HTTPS stream URL (or a valid channel handle for Twitch).');
            return;
        }

        sendRemoteCommand('addStream', {
            stream: {
                name: name,
                url: rawUrl,
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
        if (window.location.hash) {
            window.location.hash = '';
        }
        // For manual entry without URL hash, clear any stale HMAC key in pairedDisplays
        const existingIndex = pairedDisplays.findIndex(d => d.code === code);
        if (existingIndex !== -1) {
            pairedDisplays[existingIndex].hmacKey = '';
            savePairedDisplays();
        }
        if (window.history && window.history.pushState) {
            window.history.pushState({ pair: code }, '', window.location.pathname + "?pair=" + code);
        }
        initMobileRemote(code);
    }

    function showEntryScreen() {
        const entryCard = document.getElementById('remote-pairing-entry-card');
        const disOverlay = document.getElementById('remote-disconnected-overlay');
        const ctrlDeck = document.getElementById('remote-control-deck');
        if (entryCard) entryCard.classList.remove('hidden');
        if (disOverlay) disOverlay.classList.add('hidden');
        if (ctrlDeck) ctrlDeck.classList.add('hidden');
        const inputEl = document.getElementById('remote-pairing-input');
        if (inputEl) {
            inputEl.value = '';
            inputEl.focus();
        }
    }

    function handleRemoteDragStart(e, streamId) {
        remoteDragSourceId = streamId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', streamId);
        
        const item = e.currentTarget;
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

        document.querySelectorAll('.remote-draggable-item, .remote-virtual-slot').forEach(item => {
            item.classList.remove('dragging');
        });

        if (!remoteDragSourceId) return false;

        if (targetStreamId) {
            if (remoteDragSourceId !== targetStreamId) {
                sendRemoteCommand('swapStreams', { id1: remoteDragSourceId, id2: targetStreamId });
            }
        } else {
            sendRemoteCommand('placeStream', { streamId: remoteDragSourceId, slotIndex: slotIndex });
        }
        remoteDragSourceId = null;
        return false;
    }

    function handleRemoteSlotClick(slotIndex, streamId) {
        if (selectedRemoteStreamId) {
            if (streamId) {
                if (selectedRemoteStreamId !== streamId) {
                    sendRemoteCommand('swapStreams', { id1: selectedRemoteStreamId, id2: streamId });
                }
            } else {
                sendRemoteCommand('placeStream', { streamId: selectedRemoteStreamId, slotIndex: slotIndex });
            }
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

    // Expose functions for inline HTML event handlers
    window.switchRemoteTab = switchRemoteTab;
    window.sendRemoteCommand = sendRemoteCommand;
    window.handleRemoteAddStream = handleRemoteAddStream;
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
    window.showEntryScreen = showEntryScreen;
    window.initMobileRemote = initMobileRemote;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const pairCode = urlParams.get('pair');
            initMobileRemote(pairCode);
        });
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const pairCode = urlParams.get('pair');
        initMobileRemote(pairCode);
    }

})();
