import { 
    activePlayers, 
    activeWeatherAnimations, 
    youtubeAPIReady, 
    setYoutubeAPIReady, 
    escapeHtml 
} from './state.js';

import { 
    updateFloatingTabVolume, 
    updatePlayBtnIcon, 
    initializeWeatherCam, 
    initializeNotesWidget 
} from './ui.js';

// Initialize players
export function initializePlayer(stream) {
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
        if (!container) return;
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
        if (!container) return;
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
        if (!container) return;
        container.appendChild(iframe);
        
        activePlayers[stream.id] = {
            type: 'iframe',
            instance: iframe,
            muted: true,
            volume: 50
        };
    }
    else if (stream.type === 'weather') {
        initializeWeatherCam(stream);
    }
    else if (stream.type === 'notes') {
        initializeNotesWidget(stream);
    }
}

// Helper to extract YouTube ID
export function getYouTubeId(url) {
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
export function getTwitchChannel(url) {
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

export function createYTPlayer(stream, divId, videoId) {
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
        updateFloatingTabVolume(stream.id);
    } catch (e) {
        console.error('Error creating YouTube player instance: ', e);
    }
}

export function createTwitchPlayer(stream, divId, channel) {
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

export function destroyPlayer(id) {
    const pObj = activePlayers[id];
    if (!pObj) return;
    try {
        if (pObj.type === 'hls' && pObj.instance) {
            pObj.instance.dispose();
        } else if (pObj.type === 'youtube' && pObj.instance && typeof pObj.instance.destroy === 'function') {
            pObj.instance.destroy();
        } else if (pObj.type === 'twitch' && pObj.instance) {
            try {
                pObj.instance.pause();
            } catch(err) {}
        }
    } catch (e) {
        console.error('Error disposing player instance for ID ' + id, e);
    }
    
    // Clear weather animation loops if they exist for this stream
    if (activeWeatherAnimations[id]) {
        try {
            if (typeof activeWeatherAnimations[id].stop === 'function') {
                activeWeatherAnimations[id].stop();
            }
        } catch(err) {}
        delete activeWeatherAnimations[id];
    }
    
    // Clean DOM container
    const containerEl = document.getElementById(`player-container-${id}`);
    if (containerEl) {
        containerEl.innerHTML = '';
    }
    
    delete activePlayers[id];
}

// Clean up resources
export function clearAllPlayers() {
    for (const id in activePlayers) {
        destroyPlayer(id);
    }
    // Note: since activePlayers is a reference we shouldn't completely reassign it
    // because other modules hold the reference. Instead, we can delete all keys.
    for (const key in activePlayers) {
        delete activePlayers[key];
    }
    for (const key in activeWeatherAnimations) {
        delete activeWeatherAnimations[key];
    }
}

// Unified Playback Controls
export function togglePlay(streamId) {
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
            } else {
                yt.playVideo();
            }
        }
    } else if (pObj.type === 'twitch') {
        const tw = pObj.instance;
        if (tw.isPaused()) {
            tw.play();
        } else {
            tw.pause();
        }
    }
}

export function toggleMute(streamId) {
    const pObj = activePlayers[streamId];
    if (!pObj) return;
    
    const slider = document.querySelector(`#card-${streamId} .volume-slider`);
    const btn = document.querySelector(`#card-${streamId} .volume-mute-btn`);
    
    if (pObj.type === 'hls') {
        const isMuted = pObj.instance.muted();
        pObj.instance.muted(!isMuted);
        pObj.muted = !isMuted;
        
        if (slider) slider.value = !isMuted ? 0 : pObj.volume;
        updateVolumeIcon(btn, !isMuted, !isMuted ? 0 : pObj.volume);
    } else if (pObj.type === 'youtube') {
        const yt = pObj.instance;
        if (typeof yt.isMuted === 'function') {
            const isMuted = yt.isMuted();
            if (isMuted) {
                yt.unMute();
                pObj.muted = false;
                if (slider) slider.value = pObj.volume;
                updateVolumeIcon(btn, false, pObj.volume);
            } else {
                yt.mute();
                pObj.muted = true;
                if (slider) slider.value = 0;
                updateVolumeIcon(btn, true, 0);
            }
        }
    } else if (pObj.type === 'twitch') {
        const tw = pObj.instance;
        const isMuted = tw.getMuted();
        tw.setMuted(!isMuted);
        pObj.muted = !isMuted;
        
        if (slider) slider.value = !isMuted ? 0 : pObj.volume;
        updateVolumeIcon(btn, !isMuted, !isMuted ? 0 : pObj.volume);
    }
    
    updateFloatingTabVolume(streamId);
    
    // Sync master coordinates to slaves if active
    if (window.sendMqttSync) {
        window.sendMqttSync();
    }
}

export function setStreamVolume(streamId, val) {
    const pObj = activePlayers[streamId];
    if (!pObj) return;
    
    const volume = parseInt(val, 10);
    pObj.volume = volume;
    pObj.muted = volume === 0;
    
    const btn = document.querySelector(`#card-${streamId} .volume-mute-btn`);
    
    if (pObj.type === 'hls') {
        pObj.instance.volume(volume / 100);
        pObj.instance.muted(volume === 0);
        updateVolumeIcon(btn, volume === 0, volume);
    } else if (pObj.type === 'youtube') {
        const yt = pObj.instance;
        if (typeof yt.setVolume === 'function') {
            yt.setVolume(volume);
            if (volume === 0) {
                yt.mute();
            } else {
                yt.unMute();
            }
            updateVolumeIcon(btn, volume === 0, volume);
        }
    } else if (pObj.type === 'twitch') {
        const tw = pObj.instance;
        tw.setVolume(volume / 100);
        tw.setMuted(volume === 0);
        updateVolumeIcon(btn, volume === 0, volume);
    }
    
    updateFloatingTabVolume(streamId);
    
    // Sync master coordinates to slaves if active
    if (window.sendMqttSync) {
        window.sendMqttSync();
    }
}

function updateVolumeIcon(btn, isMuted, volume) {
    if (!btn) return;
    
    const volumeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
    const muteSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;
    
    if (isMuted || volume === 0) {
        btn.innerHTML = muteSvg;
        btn.classList.add('muted');
    } else {
        btn.innerHTML = volumeSvg;
        btn.classList.remove('muted');
    }
}
