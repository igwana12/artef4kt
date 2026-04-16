/**
 * JARVIS Voice Connector
 * Injects voice UI overlay onto the artef4kt visualizer
 * and connects to the JARVIS WebSocket backend.
 *
 * Connects to: ws://localhost:8340/ws/voice
 * Features: MIC (Web Speech API STT), text input, chat transcript,
 *           voice selection (Goddess/2501), 4-second speech consolidation
 */
(function() {
    'use strict';

    // Skip UI injection when embedded in JARVIS V2 iframe — parent page has its own controls
    if (window !== window.top) {
        console.log('[JARVIS-Connect] Running inside iframe — skipping UI injection');
        return;
    }

    const JARVIS_WS_URL = `ws://${location.hostname}:8350/ws/voice`;

    // ─── State ───
    let ws = null;
    let currentVoice = 'goddess';
    let recognition = null;
    let isRecording = false;
    let isSpeaking = false;
    let sttBuffer = '';
    let sttSendTimer = null;
    const STT_SILENCE_DELAY = 4000;

    // ─── Inject UI ───
    function injectUI() {
        const style = document.createElement('style');
        style.textContent = `
            .jarvis-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                z-index: 10000; pointer-events: none;
                display: flex; flex-direction: column; justify-content: space-between;
            }
            .jarvis-header {
                position: fixed; bottom: 20px; left: 20px;
                pointer-events: none; z-index: 10001;
            }
            .jarvis-header h1 {
                font-family: 'Cinzel', serif; font-size: 1.2em; letter-spacing: 0.2em;
                color: rgba(218,185,80,0.7);
                text-shadow: 0 0 20px rgba(218,165,32,0.3);
                margin: 0;
            }
            .jarvis-header .sub {
                font-family: sans-serif; font-size: 0.55em;
                color: rgba(124,58,237,0.5); letter-spacing: 0.2em; text-transform: uppercase; margin-top: 2px;
            }
            .jarvis-status {
                font-family: monospace; font-size: 0.55em;
                color: rgba(0,204,136,0.6); margin-top: 4px;
            }
            .jarvis-console {
                padding: 0 20px 24px; display: flex; flex-direction: column;
                align-items: center; gap: 10px; pointer-events: auto;
            }
            .jarvis-voice-controls {
                display: flex; gap: 4px; border: 1px solid rgba(218,165,32,0.3);
                border-radius: 4px; overflow: hidden;
            }
            .jarvis-voice-controls button {
                padding: 6px 14px; background: rgba(0,0,0,0.6); border: none;
                color: rgba(218,165,32,0.6); font-family: monospace;
                font-size: 0.7em; cursor: pointer; transition: all 0.2s;
            }
            .jarvis-voice-controls button.active { background: rgba(218,165,32,0.15); color: #DAA520; }
            .jarvis-voice-controls button:hover { background: rgba(218,165,32,0.1); color: #DAA520; }
            .jarvis-input-row {
                display: flex; gap: 8px; width: 100%; max-width: 700px;
            }
            .jarvis-input-row input {
                flex: 1; padding: 10px 16px; background: rgba(0,0,0,0.7);
                border: 1px solid rgba(218,165,32,0.25); border-radius: 6px;
                color: #d4d4e8; font-family: sans-serif; font-size: 0.9em;
                outline: none; backdrop-filter: blur(10px);
            }
            .jarvis-input-row input:focus { border-color: rgba(218,165,32,0.5); box-shadow: 0 0 15px rgba(218,165,32,0.1); }
            .jarvis-input-row input::placeholder { color: rgba(212,212,212,0.3); }
            .jarvis-input-row button {
                padding: 10px 20px; background: rgba(218,165,32,0.15);
                border: 1px solid rgba(218,165,32,0.3); border-radius: 6px;
                color: #DAA520; font-family: monospace; font-size: 0.8em;
                cursor: pointer; transition: all 0.2s;
            }
            .jarvis-input-row button:hover { background: rgba(218,165,32,0.25); }
            .jarvis-input-row .mic-btn { background: rgba(127,29,29,0.15); border-color: rgba(127,29,29,0.3); color: #ef4444; }
            .jarvis-input-row .mic-btn.recording { background: rgba(239,68,68,0.3); animation: jarvis-mic-pulse 1s infinite; }
            @keyframes jarvis-mic-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
                50% { box-shadow: 0 0 15px 5px rgba(239,68,68,0.15); }
            }
            .jarvis-transcript {
                position: fixed; right: 20px; top: 80px; bottom: 80px; width: 320px;
                background: rgba(0,0,0,0.75); border: 1px solid rgba(218,165,32,0.15);
                border-radius: 8px; padding: 12px; overflow-y: auto;
                font-family: sans-serif; font-size: 0.8em;
                color: rgba(212,212,212,0.7); pointer-events: auto;
                backdrop-filter: blur(10px); display: none; z-index: 10002;
            }
            .jarvis-transcript.visible { display: block; }
            .jarvis-transcript .msg { margin-bottom: 10px; padding: 8px; border-radius: 6px; }
            .jarvis-transcript .msg.user { background: rgba(124,58,237,0.1); border-left: 2px solid #7C3AED; }
            .jarvis-transcript .msg.assistant { background: rgba(218,165,32,0.08); border-left: 2px solid #DAA520; }
            .jarvis-transcript .msg.system { background: rgba(0,204,136,0.08); border-left: 2px solid rgba(0,204,136,0.4); font-size: 0.85em; color: rgba(0,204,136,0.6); }
            .jarvis-toggle-chat {
                position: fixed; right: 20px; top: 50px; padding: 6px 12px;
                background: rgba(0,0,0,0.6); border: 1px solid rgba(218,165,32,0.2);
                border-radius: 4px; color: rgba(218,165,32,0.6); font-size: 0.7em;
                cursor: pointer; z-index: 10003; pointer-events: auto; font-family: monospace;
            }
            .jarvis-stt-interim {
                position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.7); border: 1px solid rgba(239,68,68,0.3);
                border-radius: 8px; padding: 8px 16px; color: rgba(239,68,68,0.7);
                font-family: sans-serif; font-size: 0.85em;
                pointer-events: none; z-index: 10004; display: none;
                backdrop-filter: blur(10px); max-width: 600px; text-align: center;
            }
            .jarvis-stt-interim.visible { display: block; }
        `;
        document.head.appendChild(style);

        // Load Cinzel font
        const font = document.createElement('link');
        font.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap';
        font.rel = 'stylesheet';
        document.head.appendChild(font);

        const html = `
            <div class="jarvis-header">
                <h1>JARVIS</h1>
                <div class="sub">Autonomous Intelligence Interface</div>
                <div class="jarvis-status" id="jarvis-status">Connecting to :8340...</div>
            </div>
            <div class="jarvis-overlay">
                <div></div>
                <div class="jarvis-console">
                    <div class="jarvis-voice-controls">
                        <button id="jarvis-btn-2501" onclick="window._jarvis.setVoice('2501')">2501</button>
                        <button id="jarvis-btn-goddess" class="active" onclick="window._jarvis.setVoice('goddess')">Goddess</button>
                    </div>
                    <div class="jarvis-input-row">
                        <button class="mic-btn" id="jarvis-btn-mic" onclick="window._jarvis.toggleMic()">MIC</button>
                        <input type="text" id="jarvis-chat-input" placeholder="Speak or type..."
                               onkeydown="if(event.key==='Enter')window._jarvis.sendText()">
                        <button onclick="window._jarvis.sendText()">Send</button>
                    </div>
                </div>
            </div>
            <button class="jarvis-toggle-chat" onclick="window._jarvis.toggleChat()" style="right:20px;">Chat</button>
            <button class="jarvis-toggle-chat" onclick="window._jarvis.togglePanel()" style="right:80px;">Layers</button>
            <div class="jarvis-transcript" id="jarvis-transcript"></div>
            <div class="jarvis-stt-interim" id="jarvis-stt-interim"></div>

            <div id="jarvis-layer-panel" style="
                position:fixed; left:20px; top:80px; width:280px; max-height:calc(100vh - 160px);
                overflow-y:auto; background:rgba(0,0,0,0.88); border:1px solid rgba(218,165,32,0.2);
                border-radius:8px; padding:14px; z-index:10005; pointer-events:auto;
                font-family:monospace; font-size:0.65em; color:rgba(218,165,32,0.7);
                backdrop-filter:blur(12px); display:none;
            ">
                <div style="font-size:1.2em;color:#DAA520;letter-spacing:0.1em;margin-bottom:10px;">ENTITY CONTROLS</div>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Orbit / Skeleton</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Orbit Speed</span><input type="range" min="0.1" max="15" step="0.5" value="6" style="width:90px" oninput="window._jarvis.ce('skeletonSpeed',+this.value)"><span id="jp-v30" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">6.0</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Orbit Complexity</span><input type="range" min="1" max="10" step="1" value="5" style="width:90px" oninput="window._jarvis.ce('skeletonLoops',+this.value)"><span id="jp-v31" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">5</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Surface Attachment</div>
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0"><input type="checkbox" id="jp-surfaceAttach" onchange="window._jarvis.ce('surfaceAttach',this.checked)"> Surface Attach</label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Attach Strength</span><input type="range" min="0" max="1" step="0.05" value="0.3" style="width:90px" oninput="window._jarvis.ce('surfaceAttachStrength',+this.value)"><span id="jp-v1" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.3</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Surface Offset</span><input type="range" min="0" max="1" step="0.02" value="0.15" style="width:90px" oninput="window._jarvis.ce('surfaceOffset',+this.value)"><span id="jp-v2" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.15</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Vibration</span><input type="range" min="0" max="0.2" step="0.005" value="0.03" style="width:90px" oninput="window._jarvis.ce('surfaceVibration',+this.value)"><span id="jp-v3" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.03</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Particles</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Size</span><input type="range" min="0.02" max="1.5" step="0.02" value="0.45" style="width:90px" oninput="window._jarvis.ce('particleBaseSize',+this.value)"><span id="jp-v4" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.45</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Glow</span><input type="range" min="0" max="1" step="0.05" value="0.95" style="width:90px" oninput="window._jarvis.ce('particleGlow',+this.value)"><span id="jp-v5" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.95</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Opacity</span><input type="range" min="0" max="1" step="0.05" value="0.9" style="width:90px" oninput="window._jarvis.ce('particleOpacity',+this.value)"><span id="jp-v6" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.9</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Cloud Shape</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Radius</span><input type="range" min="0.2" max="6" step="0.1" value="2.2" style="width:90px" oninput="window._jarvis.ce('cloudRadius',+this.value)"><span id="jp-v7" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">2.2</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Max Radius</span><input type="range" min="1" max="12" step="0.5" value="5" style="width:90px" oninput="window._jarvis.ce('cloudMaxRadius',+this.value)"><span id="jp-v8" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">5.0</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Spread</span><input type="range" min="0.1" max="3" step="0.1" value="1.2" style="width:90px" oninput="window._jarvis.ce('cloudSpread',+this.value)"><span id="jp-v9" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">1.2</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Physics</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Viscosity</span><input type="range" min="0.8" max="0.99" step="0.01" value="0.92" style="width:90px" oninput="window._jarvis.ce('viscosity',+this.value)"><span id="jp-v10" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.92</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Cohesion</span><input type="range" min="0" max="0.2" step="0.005" value="0.04" style="width:90px" oninput="window._jarvis.ce('cohesion',+this.value)"><span id="jp-v11" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.04</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Turbulence</span><input type="range" min="0" max="2" step="0.05" value="0.5" style="width:90px" oninput="window._jarvis.ce('turbulence',+this.value)"><span id="jp-v12" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.5</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Return Speed</span><input type="range" min="0.01" max="0.3" step="0.01" value="0.08" style="width:90px" oninput="window._jarvis.ce('returnSpeed',+this.value)"><span id="jp-v13" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.08</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Speed</span><input type="range" min="0.1" max="3" step="0.1" value="1" style="width:90px" oninput="window._jarvis.ce('speed',+this.value)"><span id="jp-v14" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">1.0</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Flicker & Trails</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Flicker Speed</span><input type="range" min="1" max="30" step="1" value="12" style="width:90px" oninput="window._jarvis.ce('flickerSpeed',+this.value)"><span id="jp-v15" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">12</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Flicker Intensity</span><input type="range" min="0" max="1" step="0.05" value="0.5" style="width:90px" oninput="window._jarvis.ce('flickerIntensity',+this.value)"><span id="jp-v16" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.5</span></label>
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0"><input type="checkbox" id="jp-trails" checked onchange="window._jarvis.ce('trailsEnabled',this.checked)"> Trails</label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Trail Length</span><input type="range" min="0" max="0.99" step="0.01" value="0.93" style="width:90px" oninput="window._jarvis.ce('trailLength',+this.value)"><span id="jp-v17" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.93</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Glow & Haze</div>
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0"><input type="checkbox" id="jp-glow" checked onchange="window._jarvis.ce('glowEnabled',this.checked)"> Central Glow</label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Glow Size</span><input type="range" min="0.5" max="12" step="0.5" value="4" style="width:90px" oninput="window._jarvis.ce('glowSize',+this.value)"><span id="jp-v18" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">4.0</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Glow Intensity</span><input type="range" min="0" max="1" step="0.05" value="0.6" style="width:90px" oninput="window._jarvis.ce('glowIntensity',+this.value)"><span id="jp-v19" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.6</span></label>
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0"><input type="checkbox" id="jp-haze" checked onchange="window._jarvis.ce('hazeEnabled',this.checked)"> Haze</label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Haze Size</span><input type="range" min="1" max="20" step="0.5" value="9" style="width:90px" oninput="window._jarvis.ce('hazeSize',+this.value)"><span id="jp-v20" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">9.0</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Electric Arcs</div>
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0"><input type="checkbox" id="jp-arcs" checked onchange="window._jarvis.ce('arcsEnabled',this.checked)"> Arcs</label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Arc Count</span><input type="range" min="0" max="20" step="1" value="6" style="width:90px" oninput="window._jarvis.ce('arcCount',+this.value)"><span id="jp-v21" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">6</span></label>

                <div style="color:rgba(124,58,237,0.8);margin:8px 0 4px;text-transform:uppercase;font-size:0.9em;">Ferrofluid Core</div>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Sensitivity</span><input type="range" min="0.2" max="3" step="0.1" value="1.8" style="width:90px" oninput="window._jarvis.ferro('sensitivity',+this.value)"><span id="jp-v22" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">1.8</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Morph Intensity</span><input type="range" min="0.1" max="2" step="0.05" value="0.5" style="width:90px" oninput="window._jarvis.ferro('morphIntensity',+this.value)"><span id="jp-v23" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.5</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Scale</span><input type="range" min="0.3" max="2" step="0.1" value="1" style="width:90px" oninput="window._jarvis.ferroScale(+this.value)"><span id="jp-v24" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">1.0</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Metalness</span><input type="range" min="0" max="1" step="0.05" value="0.9" style="width:90px" oninput="window._jarvis.ferroMat('metalness',+this.value)"><span id="jp-v25" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.9</span></label>
                <label style="display:flex;justify-content:space-between;margin:3px 0"><span>Roughness</span><input type="range" min="0" max="1" step="0.05" value="0.1" style="width:90px" oninput="window._jarvis.ferroMat('roughness',+this.value)"><span id="jp-v26" style="width:28px;text-align:right;color:rgba(0,204,136,0.7)">0.1</span></label>
            </div>
        `;

        const container = document.createElement('div');
        container.innerHTML = html;
        while (container.firstChild) document.body.appendChild(container.firstChild);
    }

    // ─── WebSocket ───
    function connect() {
        ws = new WebSocket(JARVIS_WS_URL);
        ws.onopen = () => {
            document.getElementById('jarvis-status').textContent = '● Online — Goddess Voice';
            document.getElementById('jarvis-status').style.color = 'rgba(0,204,136,0.8)';
            ws.send(JSON.stringify({ type: 'set_voice', voice: 'goddess' }));
            console.log('[JARVIS] Connected to :8340');
        };
        ws.onerror = () => {
            document.getElementById('jarvis-status').textContent = '● Connection error';
            document.getElementById('jarvis-status').style.color = 'rgba(239,68,68,0.8)';
        };
        ws.onclose = () => {
            document.getElementById('jarvis-status').textContent = '○ Reconnecting...';
            document.getElementById('jarvis-status').style.color = 'rgba(239,68,68,0.6)';
            setTimeout(connect, 3000);
        };
        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'response') addMessage('assistant', msg.text);
            if (msg.type === 'audio_chunk') playAudio(msg.audio);
            if (msg.type === 'state') {
                const states = {
                    thinking: '◉ Thinking...',
                    speaking: '◉ Speaking...',
                    idle: '● Online — ' + (currentVoice === 'goddess' ? 'Goddess Voice' : '2501 Protocol'),
                    handing_off: '◈ Handing off...'
                };
                document.getElementById('jarvis-status').textContent = states[msg.state] || msg.state;
                if (msg.state === 'speaking') pauseSTT();
                else if (msg.state === 'idle') resumeSTT();
            }

            // ─── Reading panels (transit, monomyth, simulation, prediction, signal, pattern, menu, reveal) ───
            if (msg.type === 'transit_show' && window.transitPanel) window.transitPanel.handleMessage(msg);
            if (msg.type === 'transit_hide' && window.transitPanel) window.transitPanel.hide();
            if (msg.type === 'monomyth_show' && window.monomythPanel) window.monomythPanel.handleMessage(msg);
            if (msg.type === 'monomyth_hide' && window.monomythPanel) window.monomythPanel.hide();
            if (msg.type === 'simulation_show' && window.simulationPanel) window.simulationPanel.handleMessage(msg);
            if (msg.type === 'simulation_hide' && window.simulationPanel) window.simulationPanel.hide();
            if (msg.type === 'prediction_show' && window.predictionPanel) window.predictionPanel.handleMessage(msg);
            if (msg.type === 'prediction_hide' && window.predictionPanel) window.predictionPanel.hide();
            if (msg.type === 'signal_show' && window.signalPanel) window.signalPanel.handleMessage(msg);
            if (msg.type === 'signal_hide' && window.signalPanel) window.signalPanel.hide();
            if (msg.type === 'pattern_show' && window.patternPanel) window.patternPanel.handleMessage(msg);
            if (msg.type === 'pattern_hide' && window.patternPanel) window.patternPanel.hide();
            if (msg.type === 'reading_menu' && window.readingMenuPanel) {
                console.log('[ReadingMenu] Menu event received, wiring submit callback');
                // Wire the submit callback to send selection back via WebSocket
                window.readingMenuPanel._onSubmit = function(selected, context) {
                    console.log('[ReadingMenu] Submit clicked! Selected:', selected, 'Context:', context);
                    if (ws && ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'reading_selection',
                            selected: selected,
                            context: context
                        }));
                        console.log('[ReadingMenu] Selection sent via WebSocket');
                    } else {
                        console.error('[ReadingMenu] WebSocket not connected! State:', ws ? ws.readyState : 'null');
                    }
                };
                window.readingMenuPanel.handleMessage(msg);
                console.log('[ReadingMenu] Panel shown');
            }
            if (msg.type === 'reading_menu_hide' && window.readingMenuPanel) window.readingMenuPanel.hide();
            if (msg.type === 'panel_reveal' && window.panelReveal) window.panelReveal.handleMessage(msg);

            // ─── New detail panels (hexagram detail, astro wheel, knowledge graph, wolfram) ───
            if (msg.type === 'hexagram_detail_show' && window.hexagramDetailPanel) window.hexagramDetailPanel.handleMessage(msg);
            if (msg.type === 'hexagram_detail_hide' && window.hexagramDetailPanel) window.hexagramDetailPanel.hide();
            if (msg.type === 'astro_wheel_show' && window.astroWheelPanel) window.astroWheelPanel.handleMessage(msg);
            if (msg.type === 'astro_wheel_hide' && window.astroWheelPanel) window.astroWheelPanel.hide();
            if (msg.type === 'knowledge_graph_show' && window.knowledgeGraphPanel) window.knowledgeGraphPanel.handleMessage(msg);
            if (msg.type === 'knowledge_graph_hide' && window.knowledgeGraphPanel) window.knowledgeGraphPanel.hide();
            if (msg.type === 'wolfram_show' && window.wolframPanel) window.wolframPanel.handleMessage(msg);
            if (msg.type === 'wolfram_hide' && window.wolframPanel) window.wolframPanel.hide();

            // ─── Mapbox 3D flyover ───
            if (msg.type === 'mapbox_show' && window.mapboxPanel) window.mapboxPanel.handleMessage(msg);
            if (msg.type === 'mapbox_flythrough' && window.mapboxPanel) window.mapboxPanel.handleMessage(msg);
            if (msg.type === 'mapbox_hide' && window.mapboxPanel) window.mapboxPanel.hide();

            // ─── Existing oracle panels ───
            if (msg.type === 'hexagram_show' && window.hexagramPanel) window.hexagramPanel.handleMessage(msg);
            if (msg.type === 'hexagram_hide' && window.hexagramPanel) window.hexagramPanel.hide();
            if (msg.type === 'archetype_show' && window.archetypePanel) window.archetypePanel.handleMessage(msg);
            if (msg.type === 'archetype_hide' && window.archetypePanel) window.archetypePanel.hide();
        };
    }

    function playAudio(b64) {
        isSpeaking = true;
        pauseSTT();
        const audio = new Audio('data:audio/mp3;base64,' + b64);
        audio.onended = () => { isSpeaking = false; resumeSTT(); };
        audio.onerror = () => { isSpeaking = false; resumeSTT(); };
        audio.play().catch(() => { isSpeaking = false; resumeSTT(); });
    }

    // ─── Text Input ───
    function sendText() {
        const input = document.getElementById('jarvis-chat-input');
        const text = input.value.trim();
        if (!text) return;
        if (!ws || ws.readyState !== 1) { addMessage('system', 'Not connected'); connect(); return; }
        addMessage('user', text);
        ws.send(JSON.stringify({ type: 'transcript', text }));
        input.value = '';
    }

    function addMessage(role, text) {
        const el = document.getElementById('jarvis-transcript');
        const div = document.createElement('div');
        div.className = `msg ${role}`;
        div.textContent = text;
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
        if (!el.classList.contains('visible')) el.classList.add('visible');
    }

    // ─── Voice Controls ───
    function setVoice(v) {
        currentVoice = v;
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'set_voice', voice: v }));
        document.getElementById('jarvis-btn-2501').classList.toggle('active', v === '2501');
        document.getElementById('jarvis-btn-goddess').classList.toggle('active', v === 'goddess');
    }

    function toggleChat() {
        document.getElementById('jarvis-transcript').classList.toggle('visible');
    }

    // ─── STT with 4-second consolidation ───
    function flushSTTBuffer() {
        if (!sttBuffer.trim()) return;
        const text = sttBuffer.trim();
        sttBuffer = '';
        document.getElementById('jarvis-stt-interim').classList.remove('visible');
        if (ws && ws.readyState === 1) {
            addMessage('user', text);
            ws.send(JSON.stringify({ type: 'transcript', text }));
        }
    }

    function resetSTTTimer() {
        if (sttSendTimer) clearTimeout(sttSendTimer);
        sttSendTimer = setTimeout(flushSTTBuffer, STT_SILENCE_DELAY);
    }

    function initSTT() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            document.getElementById('jarvis-btn-mic').style.opacity = '0.3';
            return;
        }
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            if (isSpeaking) return;
            const interim = document.getElementById('jarvis-stt-interim');
            let finalTranscript = '', interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
                else interimTranscript += event.results[i][0].transcript;
            }

            if (interimTranscript) {
                interim.textContent = (sttBuffer + ' ' + interimTranscript).trim();
                interim.classList.add('visible');
            }

            if (finalTranscript.trim()) {
                sttBuffer += (sttBuffer ? ' ' : '') + finalTranscript.trim();
                interim.textContent = sttBuffer;
                interim.classList.add('visible');
                resetSTTTimer();
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                addMessage('system', 'Microphone access denied.');
                stopRecording();
            }
        };

        recognition.onend = () => {
            if (isRecording && !isSpeaking) {
                setTimeout(() => {
                    if (isRecording && !isSpeaking) {
                        try { recognition.start(); } catch(e) {}
                    }
                }, 300);
            }
        };
    }

    function toggleMic() {
        if (isRecording) stopRecording(); else startRecording();
    }

    function startRecording() {
        if (!recognition || isSpeaking) return;
        isRecording = true;
        document.getElementById('jarvis-btn-mic').classList.add('recording');
        document.getElementById('jarvis-btn-mic').textContent = 'STOP';
        try { recognition.start(); } catch(e) {
            isRecording = false;
            document.getElementById('jarvis-btn-mic').classList.remove('recording');
            document.getElementById('jarvis-btn-mic').textContent = 'MIC';
        }
    }

    function stopRecording() {
        isRecording = false;
        if (recognition) try { recognition.abort(); } catch(e) {}
        document.getElementById('jarvis-btn-mic').classList.remove('recording');
        document.getElementById('jarvis-btn-mic').textContent = 'MIC';
        if (sttSendTimer) clearTimeout(sttSendTimer);
        flushSTTBuffer();
    }

    function pauseSTT() {
        if (recognition && isRecording) try { recognition.abort(); } catch(e) {}
        if (sttSendTimer) clearTimeout(sttSendTimer);
        if (sttBuffer.trim()) flushSTTBuffer();
    }

    function resumeSTT() {
        if (isRecording && !isSpeaking) {
            setTimeout(() => {
                if (isRecording && !isSpeaking) try { recognition.start(); } catch(e) {}
            }, 500);
        }
    }

    // ─── Panel toggle ───
    function togglePanel() {
        const p = document.getElementById('jarvis-layer-panel');
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }

    // ─── Cosmic Entity param setter (updates UI value display too) ───
    function ceParam(key, value) {
        if (window.visualizer && window.visualizer.cosmicEntity) {
            window.visualizer.cosmicEntity.setParam(key, value);
        }
        // Update value display
        const labels = document.querySelectorAll('#jarvis-layer-panel label');
        for (const label of labels) {
            const input = label.querySelector('input[type="range"]');
            if (input) {
                const handler = input.getAttribute('oninput');
                if (handler && handler.includes(`'${key}'`)) {
                    const valSpan = label.querySelector('span:last-child');
                    if (valSpan) valSpan.textContent = typeof value === 'number' ? value.toFixed(2) : value;
                }
            }
        }
    }

    // ─── Ferrofluid direct property setter ───
    function ferroParam(key, value) {
        if (window.visualizer) window.visualizer[key] = value;
    }
    function ferroScale(value) {
        if (window.visualizer && window.visualizer.ferrofluid) {
            window.visualizer.ferrofluid.scale.setScalar(value);
            if (window.visualizer.ferrofluidInner) window.visualizer.ferrofluidInner.scale.setScalar(value);
        }
    }
    function ferroMat(key, value) {
        if (window.visualizer && window.visualizer.ferrofluid && window.visualizer.ferrofluid.material) {
            window.visualizer.ferrofluid.material[key] = value;
        }
    }

    // ─── Public API ───
    window._jarvis = {
        sendText, setVoice, toggleMic, toggleChat, togglePanel,
        connect, addMessage,
        ce: ceParam, ferro: ferroParam, ferroScale, ferroMat,
    };

    // ─── Cosmic Entity Setup ───
    function initCosmicEntity() {
        if (window.visualizer && window.visualizer.cosmicEntity) {
            const ce = window.visualizer.cosmicEntity;
            if (!ce.active) ce.toggle();

            // === NEBULA AURA MODE ===
            // Fast-orbiting squiggles that create a glowing aura around the blob
            // Like electrons around a nucleus — so fast they become a cloud

            // Skeleton: fast, complex orbits that pass through/around the blob
            ce.setParam('skeletonSpeed', 6.0);           // FAST orbiting
            ce.setParam('skeletonLoops', 5);             // Complex orbital paths

            // Cloud shape: wraps the blob
            ce.setParam('cloudRadius', 2.5);             // Matches blob radius
            ce.setParam('cloudMaxRadius', 5.0);          // Expands when loud
            ce.setParam('cloudSpread', 1.0);

            // Trails: HIGH persistence creates the nebula glow effect
            ce.setParam('trailsEnabled', true);
            ce.setParam('trailLength', 0.93);            // Long trails = nebula haze
            ce.setParam('trailOpacity', 0.5);

            // Particles: LARGE, glowy
            ce.setParam('particleBaseSize', 0.45);       // Big points
            ce.setParam('particleSizeRange', 0.2);
            ce.setParam('particleGlow', 0.98);           // Max glow
            ce.setParam('particleOpacity', 0.85);

            // Physics: fast, fluid, cohesive
            ce.setParam('cohesion', 0.06);               // Pulls toward skeleton path
            ce.setParam('turbulence', 0.6);              // Swirl adds nebula character
            ce.setParam('viscosity', 0.88);              // Less damping = faster motion
            ce.setParam('returnSpeed', 0.1);             // Snaps back when quiet
            ce.setParam('speed', 1.5);                   // Overall animation speed

            // Flicker: fast shimmer adds to the nebula sparkle
            ce.setParam('flickerEnabled', true);
            ce.setParam('flickerSpeed', 15);
            ce.setParam('flickerIntensity', 0.4);

            // Glow: central glow enhances the nebula core
            ce.setParam('glowEnabled', true);
            ce.setParam('glowSize', 5.0);
            ce.setParam('glowIntensity', 0.7);

            // Haze: outer atmosphere
            ce.setParam('hazeEnabled', true);
            ce.setParam('hazeSize', 10.0);
            ce.setParam('hazeIntensity', 0.25);

            // Surface attach OFF — we want free-orbiting, not surface-stuck
            ce.setParam('surfaceAttach', false);

            // Arcs: electric discharge adds energy
            ce.setParam('arcsEnabled', true);
            ce.setParam('arcCount', 8);

            console.log('[JARVIS] Cosmic Entity: NEBULA AURA mode — fast orbiting squiggles');
        } else {
            setTimeout(initCosmicEntity, 1000);
        }
    }

    // ─── Planet with Clouds Auto-Loader ───
    function applyPlanetPreset() {
        if (!window.visualizer || !window.visualizer.ferrofluid) {
            setTimeout(applyPlanetPreset, 500);
            return;
        }
        const p = localStorage.getItem('jarvis-default-preset');
        if (!p || localStorage.getItem('jarvis-preset-autoload') !== 'true') return;
        try {
            const preset = JSON.parse(p);
            const r = preset.artef4kt.ranges;
            for (const id in r) {
                const el = document.getElementById(id);
                if (el) { el.value = r[id]; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }
            const c = preset.artef4kt.checkboxes;
            for (const id in c) {
                const el = document.getElementById(id);
                if (el && el.checked !== c[id]) { el.checked = c[id]; el.dispatchEvent(new Event('change', { bubbles: true })); }
            }
            const col = preset.artef4kt.colors;
            for (const id in col) {
                const el = document.getElementById(id);
                if (el) { el.value = col[id]; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }
            window.visualizer.morphIntensity = 0.3;
            console.log('[JARVIS] Planet preset auto-applied');
        } catch (e) {
            console.warn('[JARVIS] Planet preset parse error:', e);
        }
    }

    // ─── Auto-connect ferrofluid audio input ───
    function autoConnectAudio() {
        if (!window.visualizer) { setTimeout(autoConnectAudio, 1000); return; }

        // Switch to Input tab and click Connect
        const inputTab = document.querySelector('[data-tab="input"]');
        if (inputTab) inputTab.click();

        setTimeout(() => {
            const btn = document.getElementById('input-connect');
            if (btn && !btn.classList.contains('connected')) {
                btn.click();
                console.log('[JARVIS] Auto-connected audio input');
            }
            // Simulate space keypress to start the visualization
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
            console.log('[JARVIS] Simulated space to start visualization');

            // Hide the "press space" status message
            const statusEl = document.getElementById('status-message');
            if (statusEl) statusEl.style.display = 'none';
        }, 500);
    }

    // ─── Voice-to-Blob Ripple Engine ───
    // Monitors audio and injects synthetic ripples into the ferrofluid wave system
    let voiceRippleActive = false;
    let voiceRippleAngle = 0;
    let lastRippleTime = 0;

    function startVoiceRippleLoop() {
        if (voiceRippleActive) return;
        voiceRippleActive = true;

        function tick() {
            if (!voiceRippleActive) return;
            requestAnimationFrame(tick);

            const viz = window.visualizer;
            if (!viz || !viz.createVoiceRipple) return;

            // Use the visualizer's own audio analysis (bass/mid/high intensity)
            const bass = viz.bassIntensity || 0;
            const mid = viz.midIntensity || 0;
            const high = viz.highIntensity || 0;
            const energy = bass * 0.4 + mid * 0.35 + high * 0.25;

            if (energy < 0.03) return;

            const now = performance.now();
            // Ripple frequency scales with energy — more energy = more frequent
            const cooldown = Math.max(60, 300 - energy * 500);
            if (now - lastRippleTime < cooldown) return;
            lastRippleTime = now;

            // Rotate the ripple point around the sphere for variety
            voiceRippleAngle += 0.7 + Math.random() * 1.5;
            viz.createVoiceRipple(energy, voiceRippleAngle);
        }

        requestAnimationFrame(tick);
        console.log('[JARVIS] Voice ripple engine started');
    }

    // ─── Init ───
    injectUI();
    initSTT();
    connect();
    setTimeout(initCosmicEntity, 2000);
    setTimeout(applyPlanetPreset, 2500);
    setTimeout(autoConnectAudio, 3000);
    setTimeout(startVoiceRippleLoop, 3500);

    console.log('[JARVIS] Voice connector loaded — connecting to :8340');
})();
