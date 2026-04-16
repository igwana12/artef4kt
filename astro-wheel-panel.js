/**
 * Astro Wheel Panel — Celestial aspect wheel for the JARVIS voice interface
 *
 * Canvas 2D zodiac wheel with planet positions and aspect lines.
 * Message: { type: "astro_wheel_show", aspects: [...], planets_active: [...], summary: "..." }
 * Message: { type: "astro_wheel_hide" }
 */

class AstroWheelPanel {
    constructor() {
        this._el = null;
        this._visible = false;
        this._prepared = false;
        this._canvas = null;
        this._ctx = null;
    }

    init() {
        if (this._el) return;
        var el = document.createElement('div');
        el.id = 'astro-wheel-panel';
        Object.assign(el.style, {
            position:       'fixed',
            right:          '20px',
            top:            '80px',
            width:          '300px',
            background:     'rgba(0,0,0,0.88)',
            border:         '2px solid rgba(0,180,160,0.65)',
            borderRadius:   '10px',
            zIndex:         '160',
            opacity:        '0',
            transition:     'opacity 0.6s ease, transform 0.6s ease',
            transform:      'translateY(8px)',
            backdropFilter: 'blur(12px)',
            padding:        '16px',
            display:        'none',
            boxSizing:      'border-box',
            overflow:        'hidden auto',
            boxShadow:      '0 0 30px rgba(0,180,160,0.15), inset 0 0 60px rgba(0,0,0,0.3)',
            pointerEvents:  'none',
            fontFamily:     "'Inter', sans-serif",
            color:          'rgba(200,200,220,0.85)',
            fontSize:       '13px',
            lineHeight:     '1.5',
        });
        document.body.appendChild(el);
        this._el = el;
    }

    show(data, prepared) {
        this.init();
        this._render(data);
        if (prepared) {
            this._el.style.display = 'block';
            this._el.style.opacity = '0';
            this._prepared = true;
        } else {
            this._el.style.display = 'block';
            var self = this;
            requestAnimationFrame(function() {
                self._el.style.opacity = '1';
                self._el.style.transform = 'translateY(0)';
                self._el.style.pointerEvents = 'auto';
            });
            this._visible = true;
        }
    }

    reveal() {
        if (this._el && this._prepared) {
            var el = this._el;
            requestAnimationFrame(function() {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
                el.style.pointerEvents = 'auto';
            });
            this._visible = true;
            this._prepared = false;
        }
    }

    hide() {
        if (!this._el) return;
        this._el.style.opacity = '0';
        this._el.style.transform = 'translateY(8px)';
        this._el.style.pointerEvents = 'none';
        this._visible = false;
        var el = this._el;
        setTimeout(function() { el.style.display = 'none'; }, 600);
    }

    handleMessage(msg) {
        if (msg.type === 'astro_wheel_show') this.show(msg, msg.prepared);
        else if (msg.type === 'astro_wheel_hide') this.hide();
    }

    get container() { this.init(); return this._el; }
    get isVisible() { return this._visible; }

    /* ── Planet degree mapping ── */
    _planetDegree(name) {
        var map = {
            'Sun': 0, 'Moon': 30, 'Mercury': 60, 'Venus': 90,
            'Mars': 120, 'Jupiter': 150, 'Saturn': 180,
            'Uranus': 210, 'Neptune': 240, 'Pluto': 270
        };
        return map[name] !== undefined ? map[name] : 0;
    }

    /* ── Aspect line color + width ── */
    _aspectStyle(aspect) {
        var styles = {
            'Conjunction': { color: 'rgba(218,165,32,0.8)',   width: 2.5 },
            'Trine':       { color: 'rgba(0,180,160,0.6)',    width: 1.5 },
            'Square':      { color: 'rgba(255,107,107,0.5)',  width: 1.5 },
            'Opposition':  { color: 'rgba(124,58,237,0.5)',   width: 1.5 },
            'Sextile':     { color: 'rgba(0,204,136,0.5)',    width: 1.5 }
        };
        return styles[aspect] || { color: 'rgba(200,200,220,0.3)', width: 1 };
    }

    /* ── Build panel content ── */
    _render(data) {
        var aspects = data.aspects || [];
        var planetsActive = data.planets_active || [];
        var summary = data.summary || '';

        // Clear existing content
        this._el.innerHTML = '';

        // Title
        var title = document.createElement('div');
        Object.assign(title.style, {
            fontFamily:     "'JetBrains Mono', monospace",
            fontSize:       '0.75em',
            letterSpacing:  '0.18em',
            fontWeight:     '700',
            color:          'rgba(0,180,160,0.85)',
            textTransform:  'uppercase',
            marginBottom:   '10px',
            opacity:        '0.85'
        });
        title.textContent = 'CELESTIAL ASPECTS';
        this._el.appendChild(title);

        // Canvas
        var canvasSize = 260;
        var dpr = window.devicePixelRatio || 1;
        var canvas = document.createElement('canvas');
        canvas.width = canvasSize * dpr;
        canvas.height = canvasSize * dpr;
        canvas.style.width = canvasSize + 'px';
        canvas.style.height = canvasSize + 'px';
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        this._el.appendChild(canvas);
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._ctx.scale(dpr, dpr);

        this._drawWheel(canvasSize, aspects, planetsActive);

        // Summary text
        if (summary) {
            var summaryEl = document.createElement('div');
            Object.assign(summaryEl.style, {
                marginTop:      '12px',
                fontFamily:     "'Inter', sans-serif",
                fontSize:       '11px',
                lineHeight:     '1.55',
                color:          'rgba(200,200,220,0.7)',
                letterSpacing:  '0.02em'
            });
            summaryEl.textContent = summary;
            this._el.appendChild(summaryEl);
        }
    }

    /* ── Canvas drawing ── */
    _drawWheel(size, aspects, planetsActive) {
        var ctx = this._ctx;
        var cx = size / 2;
        var cy = size / 2;
        var outerR = (size / 2) - 16;
        var innerR = outerR - 22;
        var planetR = innerR - 14;

        var zodiacSymbols = [
            '\u2648', '\u2649', '\u264A', '\u264B', '\u264C', '\u264D',
            '\u264E', '\u264F', '\u2650', '\u2651', '\u2652', '\u2653'
        ];

        // ── Outer ring ──
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,180,160,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ── Inner ring ──
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,180,160,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Segment lines (12 x 30°) ──
        for (var i = 0; i < 12; i++) {
            var angle = (i * 30 - 90) * (Math.PI / 180);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
            ctx.strokeStyle = 'rgba(0,180,160,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // ── Zodiac symbols ──
        ctx.font = '12px serif';
        ctx.fillStyle = 'rgba(0,180,160,0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var symbolR = (outerR + innerR) / 2;
        for (var j = 0; j < 12; j++) {
            var symAngle = ((j * 30) + 15 - 90) * (Math.PI / 180);
            var sx = cx + Math.cos(symAngle) * symbolR;
            var sy = cy + Math.sin(symAngle) * symbolR;
            ctx.fillText(zodiacSymbols[j], sx, sy);
        }

        // ── Compute planet positions ──
        var planetPositions = {};
        var self = this;
        planetsActive.forEach(function(name) {
            var deg = self._planetDegree(name);
            var rad = (deg - 90) * (Math.PI / 180);
            planetPositions[name] = {
                x: cx + Math.cos(rad) * planetR,
                y: cy + Math.sin(rad) * planetR
            };
        });

        // ── Aspect lines ──
        aspects.forEach(function(asp) {
            var p1 = planetPositions[asp.p1];
            var p2 = planetPositions[asp.p2];
            if (!p1 || !p2) return;
            var style = self._aspectStyle(asp.aspect);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.width;
            ctx.stroke();
        });

        // ── Planet dots + labels ──
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textBaseline = 'middle';
        Object.keys(planetPositions).forEach(function(name) {
            var pos = planetPositions[name];

            // Glow
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
            var glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 10);
            glow.addColorStop(0, 'rgba(218,165,32,0.35)');
            glow.addColorStop(1, 'rgba(218,165,32,0)');
            ctx.fillStyle = glow;
            ctx.fill();

            // Dot
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(218,165,32,0.9)';
            ctx.fill();

            // Label — offset outward from center
            var deg = self._planetDegree(name);
            var labelRad = (deg - 90) * (Math.PI / 180);
            var labelR = planetR - 16;
            var lx = cx + Math.cos(labelRad) * labelR;
            var ly = cy + Math.sin(labelRad) * labelR;
            ctx.fillStyle = 'rgba(200,200,220,0.75)';
            ctx.textAlign = 'center';
            ctx.fillText(name, lx, ly);
        });
    }
}

window.astroWheelPanel = new AstroWheelPanel();
