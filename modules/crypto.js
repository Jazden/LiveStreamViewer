import { showInsecureRemoteWarning } from './ui.js';

export function base64urlEncode(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function generateHmacSecret() {
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

export function base64urlDecode(str) {
    let base64 = str
        .replace(/-/g, '+')
        .replace(/_/g, '/');
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

export async function sha256Hex(message) {
    const msgBuffer = new TextEncoder().encode(message);
    if (window.crypto && crypto.subtle) {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[Crypto] Web Crypto digest failed, falling back to pure JS SHA-256', e);
        }
    }
    const hash = sha256Pure(msgBuffer);
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pure JS fallback helper functions
function sha256Pure(bytes) {
    function sha256(words) {
        var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
            h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
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
        var w = new Array(64);
        for (var i = 0; i < words.length; i += 16) {
            var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (var j = 0; j < 64; j++) {
                if (j < 16) w[j] = words[i + j];
                else {
                    var s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
                    var s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
                    w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
                }
                var ch = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
                var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
                var temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
                var temp2 = (S0 + maj) | 0;
                h = g; g = f; f = e; e = (d + temp1) | 0;
                d = c; c = b; b = a; a = (temp1 + temp2) | 0;
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

    return new Uint8Array(wordsToBytes(sha256(padWords(bytesToWords(bytes), bytes.length))));
}

export function pureJsHmacSha256(msgBytes, keyBytes) {
    function sha256(words) {
        var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
            h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
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
        var w = new Array(64);
        for (var i = 0; i < words.length; i += 16) {
            var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (var j = 0; j < 64; j++) {
                if (j < 16) w[j] = words[i + j];
                else {
                    var s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
                    var s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
                    w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
                }
                var ch = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
                var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
                var temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
                var temp2 = (S0 + maj) | 0;
                h = g; g = f; f = e; e = (d + temp1) | 0;
                d = c; c = b; b = a; a = (temp1 + temp2) | 0;
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

export async function hmacSha256(message, secret) {
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

export let tvHmacSecret = '';
export function setTvHmacSecret(val) { tvHmacSecret = val; }

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

export async function signMessage(payloadObj, secret) {
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

export async function verifyMessage(rawStr, secret) {
    try {
        const envelope = JSON.parse(rawStr);
        if (!envelope || typeof envelope !== 'object' || !envelope.p || !envelope.s || !envelope.n || !envelope.t) {
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
        if (Math.abs(now - envelope.t) > 30000) {
            console.warn("[Crypto] Message timestamp expired: " + envelope.t + " (current: " + now + ")");
            return null;
        }

        const signatureInput = `${envelope.p}|${envelope.n}|${envelope.t}`;
        const calculatedSig = await hmacSha256(signatureInput, secret);
        if (calculatedSig !== envelope.s) {
            console.warn("[Crypto] Invalid signature");
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
