/**
 * Reading Panels — Dynamic data overlays for the Oracle Reading Router
 * 8 new panels following the oracle-panels.js pattern
 */

function _createPanelShell(id, opts = {}) {
    const el = document.createElement('div');
    el.id = id;
    Object.assign(el.style, {
        position: 'fixed',
        right: opts.right || '', left: opts.left || '',
        top: opts.top || '80px', bottom: opts.bottom || '',
        width: opts.width || '280px', maxHeight: opts.maxHeight || '60vh',
        background: 'rgba(0,0,0,0.88)',
        border: '2px solid ' + (opts.borderColor || 'rgba(218,165,32,0.65)'),
        borderRadius: '10px', zIndex: '160',
        opacity: '0', transition: 'opacity 0.6s ease, transform 0.6s ease',
        transform: 'translateY(8px)', backdropFilter: 'blur(12px)',
        padding: '16px', display: 'none', boxSizing: 'border-box',
        overflow: 'hidden auto',
        boxShadow: '0 0 30px ' + (opts.glowColor || 'rgba(218,165,32,0.15)') + ', inset 0 0 60px rgba(0,0,0,0.3)',
        pointerEvents: 'none',
        fontFamily: "'Inter', sans-serif", color: 'rgba(200,200,220,0.85)',
        fontSize: '13px', lineHeight: '1.5',
    });
    document.body.appendChild(el);
    return el;
}

function _showPanel(el) {
    el.style.display = 'block';
    requestAnimationFrame(function() {
        el.style.opacity = '1'; el.style.transform = 'translateY(0)'; el.style.pointerEvents = 'auto';
    });
}

function _hidePanel(el) {
    if (!el) return;
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.pointerEvents = 'none';
    setTimeout(function() { el.style.display = 'none'; }, 600);
}

function _title(text, color) {
    return '<div style="font-family:JetBrains Mono,monospace;font-size:0.75em;letter-spacing:0.18em;font-weight:700;color:' +
        (color || 'rgba(218,165,32,0.85)') + ';text-transform:uppercase;margin-bottom:10px;">' + text + '</div>';
}

// ═══ 1. TransitPanel ═══
class TransitPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) this._el = _createPanelShell('transit-panel', { right:'20px', top:'80px', width:'300px', borderColor:'rgba(0,180,160,0.65)', glowColor:'rgba(0,180,160,0.15)' }); }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { _showPanel(this._el); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { _showPanel(this._el); this._visible=true; this._prepared=false; } }
    hide() { _hidePanel(this._el); this._visible=false; }
    handleMessage(msg) { if (msg.type==='transit_show') this.show(msg.transits, msg.prepared); else if (msg.type==='transit_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        if (!data || !data.aspects || !data.aspects.length)
            return _title('PLANETARY TRANSITS','rgba(0,180,160,0.85)') + '<div style="color:rgba(180,180,200,0.5);font-style:italic;">The stars are obscured...</div>';
        var aspects = data.aspects.map(function(a) {
            var orb = a.orb ? ' (' + a.orb.toFixed(1) + '\u00B0)' : '';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(0,180,160,0.1);"><span style="color:rgba(218,165,32,0.9);font-weight:600;">' + a.p1 + '</span><span style="color:rgba(0,180,160,0.7);font-size:0.85em;font-family:Cinzel,serif;">' + a.aspect + orb + '</span><span style="color:rgba(218,165,32,0.9);font-weight:600;">' + a.p2 + '</span></div>';
        }).join('');
        var planets = (data.planets_active||[]).map(function(p) {
            return '<span style="display:inline-block;padding:2px 8px;margin:2px;background:rgba(0,180,160,0.15);border-radius:12px;font-size:0.75em;color:rgba(0,180,160,0.8);">' + p + '</span>';
        }).join('');
        return _title('PLANETARY TRANSITS','rgba(0,180,160,0.85)') + aspects + (planets ? '<div style="margin-top:10px;">' + planets + '</div>' : '');
    }
}

// ═══ 2. MonomythPanel ═══
class MonomythPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) this._el = _createPanelShell('monomyth-panel', { right:'20px', top:'420px', width:'240px', borderColor:'rgba(218,165,32,0.35)', glowColor:'rgba(218,165,32,0.06)' }); }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { _showPanel(this._el); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { _showPanel(this._el); this._visible=true; this._prepared=false; } }
    hide() { _hidePanel(this._el); this._visible=false; }
    handleMessage(msg) { if (msg.type==='monomyth_show') this.show(msg.monomyth, msg.prepared); else if (msg.type==='monomyth_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var stage = data.stage || 'Unknown', conf = data.confidence || 0;
        var stages = ['Ordinary World','Call to Adventure','Refusal','Meeting the Mentor','Crossing Threshold','Tests & Allies','Approach','Ordeal','Reward','Road Back','Resurrection','Return'];
        var idx = -1; for (var i=0;i<stages.length;i++) { if (stages[i].toLowerCase().indexOf(stage.toLowerCase())>=0||stage.toLowerCase().indexOf(stages[i].toLowerCase())>=0) { idx=i; break; } }
        var dots = stages.map(function(s,i) {
            var active = i===idx, past = i<idx;
            var c = active ? 'rgba(218,165,32,0.95)' : past ? 'rgba(218,165,32,0.3)' : 'rgba(100,100,120,0.3)';
            var sz = active ? '10px' : '6px';
            return '<div style="width:'+sz+';height:'+sz+';border-radius:50%;background:'+c+';'+(active?'box-shadow:0 0 12px rgba(218,165,32,0.85);':'')+'" title="'+s+'"></div>';
        }).join('');
        return _title("HERO'S JOURNEY",'rgba(218,165,32,0.85)') +
            '<div style="font-family:JetBrains Mono,monospace;font-size:1.0em;font-weight:600;color:rgba(218,165,32,0.95);margin-bottom:8px;text-align:center;">'+stage+'</div>' +
            '<div style="display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:10px;">'+dots+'</div>' +
            '<div style="text-align:center;font-size:0.7em;color:rgba(180,180,200,0.4);">Confidence: '+Math.round(conf*100)+'%</div>';
    }
}

// ═══ 3. SimulationPanel ═══
class SimulationPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) this._el = _createPanelShell('simulation-panel', { left:'20px', top:'380px', width:'320px', maxHeight:'45vh', borderColor:'rgba(255,107,107,0.55)', glowColor:'rgba(255,107,107,0.12)' }); }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { _showPanel(this._el); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { _showPanel(this._el); this._visible=true; this._prepared=false; } }
    hide() { _hidePanel(this._el); this._visible=false; }
    handleMessage(msg) { if (msg.type==='simulation_show') this.show(msg.simulation, msg.prepared); else if (msg.type==='simulation_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var engine = data.engine || 'MiroFish', n = data.archetype_interviews || 0, raw = data.raw_text || '';
        var blocks = raw.split(/\n\n+/).filter(function(b){return b.trim();}).map(function(block) {
            var m = block.match(/^\[(\w+)\]:\s*([\s\S]*)/);
            if (m) return '<div style="margin-bottom:10px;padding:8px;background:rgba(255,107,107,0.12);border-left:3px solid rgba(255,107,107,0.4);border-radius:0 6px 6px 0;"><div style="font-family:JetBrains Mono,monospace;font-size:0.78em;font-weight:500;color:rgba(255,107,107,0.8);margin-bottom:4px;letter-spacing:0.05em;">'+m[1]+'</div><div style="font-size:0.82em;color:rgba(200,200,220,0.75);">'+m[2].slice(0,200)+(m[2].length>200?'...':'')+'</div></div>';
            return '<div style="font-size:0.82em;color:rgba(200,200,220,0.6);margin-bottom:6px;">'+block.slice(0,200)+'</div>';
        }).join('');
        return _title(engine.toUpperCase()+' SIMULATION','rgba(255,107,107,0.85)') +
            '<div style="font-size:0.7em;color:rgba(255,107,107,0.85);margin-bottom:8px;">'+n+' archetype'+(n!==1?'s':'')+' interviewed</div>' + blocks;
    }
}

// ═══ 4. PredictionPanel ═══
class PredictionPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) this._el = _createPanelShell('prediction-panel', { right:'340px', top:'80px', width:'280px', borderColor:'rgba(0,204,136,0.55)', glowColor:'rgba(0,204,136,0.12)' }); }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { _showPanel(this._el); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { _showPanel(this._el); this._visible=true; this._prepared=false; } }
    hide() { _hidePanel(this._el); this._visible=false; }
    handleMessage(msg) { if (msg.type==='prediction_show') this.show(msg.predictions, msg.prepared); else if (msg.type==='prediction_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var src = data.source || 'Prediction Markets', raw = data.raw_text || '';
        var lines = raw.split('\n').filter(function(l){return l.trim() && l.indexOf('POLYMARKET')<0;});
        var cards = lines.map(function(line) {
            var m = line.match(/^\s*(.+?)\s*\u2014\s*Yes:\s*([\d.]+%),\s*No:\s*([\d.]+%)\s*\(volume:\s*([^)]+)\)/);
            if (m) {
                var y = parseFloat(m[2]);
                return '<div style="margin-bottom:10px;padding:8px;background:rgba(0,204,136,0.05);border-radius:6px;"><div style="font-size:0.82em;color:rgba(200,200,220,0.85);margin-bottom:6px;">'+m[1].trim()+'</div><div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;"><div style="flex:'+y+';height:6px;background:rgba(0,204,136,0.7);border-radius:3px;"></div><div style="flex:'+(100-y)+';height:6px;background:rgba(255,107,107,0.4);border-radius:3px;"></div></div><div style="display:flex;justify-content:space-between;font-size:0.7em;"><span style="color:rgba(0,204,136,0.8);">Yes: '+m[2]+'</span><span style="color:rgba(255,107,107,0.6);">No: '+m[3]+'</span><span style="color:rgba(180,180,200,0.4);">'+m[4]+'</span></div></div>';
            }
            return '<div style="font-size:0.8em;color:rgba(200,200,220,0.6);margin-bottom:4px;">'+line.trim()+'</div>';
        }).join('');
        return _title(src.toUpperCase(),'rgba(0,204,136,0.85)') + cards;
    }
}

// ═══ 5. SignalPanel ═══
class SignalPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) { this._el = _createPanelShell('signal-panel', { left:'50%', bottom:'80px', top:'', width:'400px', borderColor:'rgba(218,165,32,0.3)', glowColor:'rgba(218,165,32,0.04)' }); this._el.style.transform='translateX(-50%) translateY(8px)'; this._el.style.maxHeight='120px'; this._el.style.padding='12px 20px'; } }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { this._el.style.display='block'; requestAnimationFrame(function() { this._el.style.opacity='1'; this._el.style.transform='translateX(-50%) translateY(0)'; this._el.style.pointerEvents='auto'; }.bind(this)); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { var el=this._el; requestAnimationFrame(function() { el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; el.style.pointerEvents='auto'; }); this._visible=true; this._prepared=false; } }
    hide() { if (!this._el) return; this._el.style.opacity='0'; this._el.style.transform='translateX(-50%) translateY(8px)'; this._el.style.pointerEvents='none'; this._visible=false; var el=this._el; setTimeout(function(){el.style.display='none';},600); }
    handleMessage(msg) { if (msg.type==='signal_show') this.show(msg.signal, msg.prepared); else if (msg.type==='signal_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var level = data.level||'whisper', conf = data.confidence||0, active = data.sources_active||0, total = data.sources_total||0;
        var levels = data.fibonacci_levels || {whisper:0.236,echo:0.382,balance:0.500,resonance:0.618,convergence:0.786};
        var markers = Object.keys(levels).map(function(name) {
            var val = levels[name], isActive = name===level, left = (val*100).toFixed(1);
            var c = isActive ? 'rgba(218,165,32,0.95)' : 'rgba(100,100,120,0.4)';
            var sz = isActive ? '10' : '6';
            return '<div style="position:absolute;left:'+left+'%;transform:translateX(-50%);text-align:center;"><div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+c+';margin:0 auto 3px;'+(isActive?'box-shadow:0 0 12px rgba(218,165,32,0.85);':'')+'"></div><div style="font-size:'+(isActive?'0.7':'0.6')+'em;color:'+c+';white-space:nowrap;font-family:Cinzel,serif;letter-spacing:0.05em;">'+name+'</div></div>';
        }).join('');
        var pct = (conf*100).toFixed(1);
        return '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;"><span style="font-family:JetBrains Mono,monospace;font-size:0.75em;letter-spacing:0.18em;font-weight:700;color:rgba(218,165,32,0.85);text-transform:uppercase;">FIBONACCI SIGNAL</span><span style="font-size:0.7em;color:rgba(180,180,200,0.4);">'+active+'/'+total+' sources</span></div><div style="position:relative;height:6px;background:rgba(100,100,120,0.15);border-radius:3px;margin-bottom:24px;"><div style="position:absolute;left:0;top:0;height:100%;width:'+pct+'%;background:linear-gradient(90deg,rgba(0,180,160,0.65),rgba(218,165,32,0.8));border-radius:3px;transition:width 1.5s ease;"></div></div><div style="position:relative;height:30px;">'+markers+'</div>';
    }
}

// ═══ 6. PatternPanel ═══
class PatternPanel {
    constructor() { this._el = null; this._visible = false; this._prepared = false; }
    init() { if (!this._el) this._el = _createPanelShell('pattern-panel', { left:'20px', bottom:'80px', top:'', width:'280px', maxHeight:'200px', borderColor:'rgba(124,58,237,0.55)', glowColor:'rgba(124,58,237,0.12)' }); }
    show(data, prepared) { this.init(); this._el.innerHTML = this._build(data); if (prepared) { this._el.style.display='block'; this._el.style.opacity='0'; this._prepared=true; } else { _showPanel(this._el); this._visible=true; } }
    reveal() { if (this._el && this._prepared) { _showPanel(this._el); this._visible=true; this._prepared=false; } }
    hide() { _hidePanel(this._el); this._visible=false; }
    handleMessage(msg) { if (msg.type==='pattern_show') this.show(msg.patterns, msg.prepared); else if (msg.type==='pattern_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var text = data.raw_text || '';
        var lines = text.split('\n').filter(function(l){return l.trim();}).map(function(line) {
            return '<div style="font-size:0.82em;color:rgba(200,200,220,0.7);padding:3px 0;border-bottom:1px solid rgba(124,58,237,0.08);">'+line.trim()+'</div>';
        }).join('');
        return _title('PATTERN HISTORY','rgba(124,58,237,0.85)') + lines;
    }
}

// ═══ 7. ReadingMenuPanel ═══
class ReadingMenuPanel {
    constructor() { this._el = null; this._visible = false; this._onSubmit = null; }
    init() { if (!this._el) { this._el = _createPanelShell('reading-menu-panel', { left:'50%', top:'10vh', width:'520px', maxHeight:'80vh', borderColor:'rgba(218,165,32,0.85)', glowColor:'rgba(218,165,32,0.12)' }); this._el.style.transform='translateX(-50%) translateY(8px)'; this._el.style.pointerEvents='auto'; } }
    show(data) {
        this.init();
        this._el.innerHTML = this._build(data);
        this._el.style.display = 'block';
        var el = this._el;
        requestAnimationFrame(function() { el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; el.style.pointerEvents='auto'; });
        this._visible = true;
        // Wire toggles
        el.querySelectorAll('.rm-toggle').forEach(function(t) { t.addEventListener('click', function() { t.classList.toggle('active'); }); });
        // Wire submit via global function (onclick attribute on button — more reliable than addEventListener)
        var self = this;
        window._rmSubmit = function() {
            console.log('[ReadingMenu] Begin Reading clicked!');
            var selected = Array.from(el.querySelectorAll('.rm-toggle.active')).map(function(t){return t.dataset.id;});
            var ctx = (el.querySelector('#rm-context')||{}).value || '';
            console.log('[ReadingMenu] Selected:', selected, 'Context:', ctx);
            self.hide();
            if (self._onSubmit) self._onSubmit(selected, ctx);
            else console.error('[ReadingMenu] _onSubmit is null!');
        };
    }
    hide() { if (!this._el) return; this._el.style.opacity='0'; this._el.style.transform='translateX(-50%) translateY(8px)'; this._el.style.pointerEvents='none'; this._visible=false; var el=this._el; setTimeout(function(){el.style.display='none';},600); }
    handleMessage(msg) { if (msg.type==='reading_menu') this.show(msg); else if (msg.type==='reading_menu_hide') this.hide(); }
    get isVisible() { return this._visible; }
    _build(data) {
        var title = data.title || 'Choose Your Instruments';
        var sections = (data.sections||[]).map(function(section) {
            if (section.type === 'text_input') {
                return '<div style="margin-bottom:16px;"><div style="font-family:JetBrains Mono,monospace;font-size:0.72em;font-weight:600;letter-spacing:0.15em;color:rgba(218,165,32,0.6);text-transform:uppercase;margin-bottom:8px;">'+(section.label||'Additional Context')+'</div><textarea id="rm-context" placeholder="'+(section.placeholder||'Speak your intention...')+'" style="width:100%;min-height:60px;background:rgba(255,255,255,0.04);border:1px solid rgba(218,165,32,0.2);border-radius:8px;padding:10px;color:rgba(200,200,220,0.85);font-family:Inter,sans-serif;font-size:0.85em;resize:vertical;outline:none;"></textarea></div>';
            }
            var opts = (section.options||[]).map(function(opt) {
                return '<div class="rm-toggle" data-id="'+opt.id+'" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(218,165,32,0.15);border-radius:8px;cursor:pointer;transition:all 0.25s;user-select:none;"><div style="font-size:1.4em;width:32px;text-align:center;">'+(opt.icon||'\u25C6')+'</div><div style="flex:1;"><div style="font-family:JetBrains Mono,monospace;font-size:0.82em;font-weight:500;color:rgba(218,165,32,0.9);letter-spacing:0.03em;">'+opt.name+'</div><div style="font-size:0.72em;color:rgba(180,180,200,0.5);margin-top:2px;">'+(opt.description||'')+'</div></div><div class="rm-check" style="width:20px;height:20px;border:2px solid rgba(218,165,32,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all 0.25s;font-size:0.7em;"></div></div>';
            }).join('');
            return '<div style="margin-bottom:16px;"><div style="font-family:JetBrains Mono,monospace;font-size:0.72em;font-weight:600;letter-spacing:0.15em;color:rgba(218,165,32,0.6);text-transform:uppercase;margin-bottom:8px;">'+(section.label||'')+'</div><div style="display:flex;flex-direction:column;gap:6px;">'+opts+'</div></div>';
        }).join('');
        return '<div style="text-align:center;margin-bottom:16px;"><div style="font-family:JetBrains Mono,monospace;font-size:1.1em;font-weight:700;color:rgba(218,165,32,0.95);letter-spacing:0.1em;">'+title+'</div><div style="width:60px;height:1px;background:rgba(218,165,32,0.3);margin:8px auto;"></div></div>'+sections+'<button id="rm-submit" onclick="window._rmSubmit()" style="width:100%;padding:12px;background:rgba(218,165,32,0.15);border:2px solid rgba(218,165,32,0.65);border-radius:8px;color:rgba(218,165,32,0.95);font-family:JetBrains Mono,monospace;font-size:0.85em;font-weight:600;letter-spacing:0.1em;cursor:pointer;transition:all 0.3s;text-transform:uppercase;">Begin Reading</button><style>.rm-toggle.active{border-color:rgba(218,165,32,0.6)!important;background:rgba(218,165,32,0.15)!important}.rm-toggle.active .rm-check{border-color:rgba(218,165,32,0.8);background:rgba(218,165,32,0.7)}.rm-toggle.active .rm-check::after{content:"\\2713";color:rgba(0,0,0,0.8)}</style>';
    }
}

// ═══ 8. PanelRevealController ═══
class PanelRevealController {
    constructor() { this._panels = {}; }
    register(type, inst) { this._panels[type] = inst; }
    handleMessage(msg) {
        if (msg.type === 'panel_reveal') {
            var p = this._panels[msg.panel];
            if (p && p.reveal) { p.reveal(); console.log('[PanelReveal] Revealed: ' + msg.panel); }
            else console.warn('[PanelReveal] Unknown: ' + msg.panel);
        }
    }
}

// ═══ Initialize ═══
var transitPanel = new TransitPanel();
var monomythPanel = new MonomythPanel();
var simulationPanel = new SimulationPanel();
var predictionPanel = new PredictionPanel();
var signalPanel = new SignalPanel();
var patternPanel = new PatternPanel();
var readingMenuPanel = new ReadingMenuPanel();
var panelReveal = new PanelRevealController();

panelReveal.register('transit_show', transitPanel);
panelReveal.register('monomyth_show', monomythPanel);
panelReveal.register('simulation_show', simulationPanel);
panelReveal.register('prediction_show', predictionPanel);
panelReveal.register('signal_show', signalPanel);
panelReveal.register('pattern_show', patternPanel);

window.transitPanel = transitPanel;
window.monomythPanel = monomythPanel;
window.simulationPanel = simulationPanel;
window.predictionPanel = predictionPanel;
window.signalPanel = signalPanel;
window.patternPanel = patternPanel;
window.readingMenuPanel = readingMenuPanel;
window.panelReveal = panelReveal;

console.log('[ReadingPanels] 8 panels initialized');
