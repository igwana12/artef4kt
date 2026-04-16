/**
 * Knowledge Graph Panel — InfraNodus integration for JARVIS voice interface
 *
 * Shows WHERE information came from in the Obsidian vault and how concepts connect.
 * Renders source provenance with relevance bars and a mini force-directed concept network.
 *
 * Events:
 *   knowledge_graph_show  -> show(data, prepared?)
 *   knowledge_graph_hide  -> hide()
 *
 * InfraNodus runs at localhost:3100 as an Obsidian plugin.
 */

class KnowledgeGraphPanel {
    constructor() {
        this._el = null;
        this._visible = false;
        this._prepared = false;
        this._canvas = null;
        this._animFrame = null;
    }

    init() {
        if (this._el) return;
        var el = document.createElement('div');
        el.id = 'knowledge-graph-panel';
        Object.assign(el.style, {
            position:       'fixed',
            right:          '20px',
            top:            '340px',
            width:          '280px',
            maxHeight:      '50vh',
            background:     'rgba(0,0,0,0.88)',
            border:         '2px solid rgba(124,58,237,0.55)',
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
            boxShadow:      '0 0 30px rgba(124,58,237,0.12), inset 0 0 60px rgba(0,0,0,0.3)',
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
        this._renderContent(data);
        if (prepared) {
            this._el.style.display = 'block';
            this._el.style.opacity = '0';
            this._prepared = true;
        } else {
            this._el.style.display = 'block';
            var el = this._el;
            requestAnimationFrame(function() {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
                el.style.pointerEvents = 'auto';
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
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        var el = this._el;
        setTimeout(function() { el.style.display = 'none'; }, 600);
    }

    handleMessage(msg) {
        if (msg.type === 'knowledge_graph_show') this.show(msg, msg.prepared);
        else if (msg.type === 'knowledge_graph_hide') this.hide();
    }

    get container() { this.init(); return this._el; }
    get isVisible() { return this._visible; }

    /* ── internal rendering ── */

    _renderContent(data) {
        var query = data.query || '';
        var sources = data.sources || [];
        var concepts = data.concepts || [];
        var totalFiles = data.total_files_searched || 0;
        var signal = data.signal_strength || 'unknown';

        // Clear previous content
        while (this._el.firstChild) this._el.removeChild(this._el.firstChild);

        // 1. Title
        var title = document.createElement('div');
        Object.assign(title.style, {
            fontFamily:     "'JetBrains Mono', monospace",
            fontSize:       '0.75em',
            letterSpacing:  '0.18em',
            fontWeight:     '700',
            color:          'rgba(124,58,237,0.85)',
            textTransform:  'uppercase',
            marginBottom:   '10px',
            opacity:        '0.85',
        });
        title.textContent = 'KNOWLEDGE GRAPH';
        this._el.appendChild(title);

        // 2. Query badge
        if (query) {
            var badge = document.createElement('div');
            Object.assign(badge.style, {
                background:     'rgba(124,58,237,0.15)',
                border:         '1px solid rgba(124,58,237,0.35)',
                borderRadius:   '6px',
                padding:        '6px 10px',
                marginBottom:   '12px',
                fontFamily:     "'JetBrains Mono', monospace",
                fontSize:       '0.65em',
                color:          'rgba(200,200,220,0.8)',
                letterSpacing:  '0.04em',
                wordBreak:      'break-word',
            });
            badge.textContent = query;
            this._el.appendChild(badge);
        }

        // 3. Source provenance list
        if (sources.length > 0) {
            var srcLabel = document.createElement('div');
            Object.assign(srcLabel.style, {
                fontFamily:     "'JetBrains Mono', monospace",
                fontSize:       '0.6em',
                letterSpacing:  '0.12em',
                fontWeight:     '700',
                color:          'rgba(200,200,220,0.45)',
                textTransform:  'uppercase',
                marginBottom:   '6px',
            });
            srcLabel.textContent = 'SOURCES';
            this._el.appendChild(srcLabel);

            for (var i = 0; i < sources.length; i++) {
                this._el.appendChild(this._buildSourceRow(sources[i]));
            }
        }

        // 4. Concept network canvas
        if (concepts.length > 0) {
            var netLabel = document.createElement('div');
            Object.assign(netLabel.style, {
                fontFamily:     "'JetBrains Mono', monospace",
                fontSize:       '0.6em',
                letterSpacing:  '0.12em',
                fontWeight:     '700',
                color:          'rgba(200,200,220,0.45)',
                textTransform:  'uppercase',
                marginTop:      '10px',
                marginBottom:   '6px',
            });
            netLabel.textContent = 'CONCEPT NETWORK';
            this._el.appendChild(netLabel);

            var canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 160;
            Object.assign(canvas.style, {
                width:          '240px',
                height:         '160px',
                display:        'block',
                margin:         '0 auto',
                borderRadius:   '6px',
                background:     'rgba(0,0,0,0.4)',
            });
            this._el.appendChild(canvas);
            this._canvas = canvas;
            this._runForceLayout(concepts);
        }

        // 5. Footer
        var footer = document.createElement('div');
        Object.assign(footer.style, {
            fontFamily:     "'JetBrains Mono', monospace",
            fontSize:       '0.55em',
            color:          'rgba(200,200,220,0.35)',
            letterSpacing:  '0.06em',
            marginTop:      '10px',
            textAlign:      'center',
        });
        footer.textContent = totalFiles + ' files searched | signal: ' + signal;
        this._el.appendChild(footer);
    }

    _buildSourceRow(src) {
        var file = src.file || '';
        var relevance = src.relevance || 0;
        var excerpts = src.excerpts || 0;

        // Shorten path to last 2 segments
        var segments = file.split('/');
        var shortPath = segments.length > 2
            ? segments.slice(-2).join('/')
            : file;

        // Color by relevance
        var barColor;
        if (relevance >= 0.8)      barColor = 'rgba(218,165,32,0.85)';   // gold - high
        else if (relevance >= 0.6) barColor = 'rgba(0,204,136,0.75)';    // teal - medium
        else                       barColor = 'rgba(160,160,180,0.45)';  // grey - low

        var row = document.createElement('div');
        Object.assign(row.style, {
            marginBottom: '8px',
        });

        // File path
        var pathEl = document.createElement('div');
        Object.assign(pathEl.style, {
            fontFamily:     "'JetBrains Mono', monospace",
            fontSize:       '0.62em',
            color:          'rgba(200,200,220,0.75)',
            marginBottom:   '2px',
            overflow:       'hidden',
            textOverflow:   'ellipsis',
            whiteSpace:     'nowrap',
        });
        pathEl.textContent = shortPath;
        row.appendChild(pathEl);

        // Relevance bar container
        var barBg = document.createElement('div');
        Object.assign(barBg.style, {
            width:          '100%',
            height:         '4px',
            background:     'rgba(255,255,255,0.06)',
            borderRadius:   '2px',
            overflow:       'hidden',
            position:       'relative',
        });

        var barFill = document.createElement('div');
        Object.assign(barFill.style, {
            width:          Math.round(relevance * 100) + '%',
            height:         '100%',
            background:     barColor,
            borderRadius:   '2px',
            transition:     'width 0.4s ease',
        });
        barBg.appendChild(barFill);
        row.appendChild(barBg);

        // Relevance + excerpt count
        var meta = document.createElement('div');
        Object.assign(meta.style, {
            fontFamily:     "'JetBrains Mono', monospace",
            fontSize:       '0.52em',
            color:          'rgba(200,200,220,0.4)',
            marginTop:      '1px',
        });
        meta.textContent = Math.round(relevance * 100) + '% | ' + excerpts + ' excerpt' + (excerpts !== 1 ? 's' : '');
        row.appendChild(meta);

        return row;
    }

    _runForceLayout(concepts) {
        var canvas = this._canvas;
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var W = canvas.width;
        var H = canvas.height;

        // Build node list with initial positions
        var nodes = [];
        var nodeMap = {};
        var maxWeight = 1;
        for (var i = 0; i < concepts.length; i++) {
            if (concepts[i].weight > maxWeight) maxWeight = concepts[i].weight;
        }

        for (var i = 0; i < concepts.length; i++) {
            var c = concepts[i];
            var angle = (2 * Math.PI * i) / concepts.length;
            var r = Math.min(W, H) * 0.3;
            var node = {
                name:    c.name,
                weight:  c.weight || 1,
                connections: c.connections || [],
                x:       W / 2 + r * Math.cos(angle),
                y:       H / 2 + r * Math.sin(angle),
                vx:      0,
                vy:      0,
                radius:  4 + ((c.weight || 1) / maxWeight) * 8,
            };
            nodes.push(node);
            nodeMap[c.name] = node;
        }

        // Build edge list
        var edges = [];
        var edgeSet = {};
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            for (var j = 0; j < n.connections.length; j++) {
                var target = nodeMap[n.connections[j]];
                if (!target) continue;
                var key = n.name < n.connections[j]
                    ? n.name + '|' + n.connections[j]
                    : n.connections[j] + '|' + n.name;
                if (!edgeSet[key]) {
                    edgeSet[key] = true;
                    edges.push({ source: n, target: target });
                }
            }
        }

        // Simple force simulation (no D3 dependency)
        var iteration = 0;
        var maxIter = 80;
        var self = this;

        function tick() {
            // Repulsion between all nodes
            for (var i = 0; i < nodes.length; i++) {
                for (var j = i + 1; j < nodes.length; j++) {
                    var dx = nodes[j].x - nodes[i].x;
                    var dy = nodes[j].y - nodes[i].y;
                    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    var force = 800 / (dist * dist);
                    var fx = (dx / dist) * force;
                    var fy = (dy / dist) * force;
                    nodes[i].vx -= fx;
                    nodes[i].vy -= fy;
                    nodes[j].vx += fx;
                    nodes[j].vy += fy;
                }
            }

            // Attraction along edges
            for (var i = 0; i < edges.length; i++) {
                var e = edges[i];
                var dx = e.target.x - e.source.x;
                var dy = e.target.y - e.source.y;
                var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                var force = (dist - 40) * 0.04;
                var fx = (dx / dist) * force;
                var fy = (dy / dist) * force;
                e.source.vx += fx;
                e.source.vy += fy;
                e.target.vx -= fx;
                e.target.vy -= fy;
            }

            // Center gravity
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].vx += (W / 2 - nodes[i].x) * 0.01;
                nodes[i].vy += (H / 2 - nodes[i].y) * 0.01;
            }

            // Apply velocity with damping
            var damping = 0.7;
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].vx *= damping;
                nodes[i].vy *= damping;
                nodes[i].x += nodes[i].vx;
                nodes[i].y += nodes[i].vy;
                // Clamp to canvas bounds
                nodes[i].x = Math.max(nodes[i].radius + 2, Math.min(W - nodes[i].radius - 2, nodes[i].x));
                nodes[i].y = Math.max(nodes[i].radius + 2, Math.min(H - nodes[i].radius - 2, nodes[i].y));
            }

            // Draw
            ctx.clearRect(0, 0, W, H);

            // Edges
            ctx.strokeStyle = 'rgba(124,58,237,0.25)';
            ctx.lineWidth = 1;
            for (var i = 0; i < edges.length; i++) {
                ctx.beginPath();
                ctx.moveTo(edges[i].source.x, edges[i].source.y);
                ctx.lineTo(edges[i].target.x, edges[i].target.y);
                ctx.stroke();
            }

            // Nodes
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                var intensity = 0.4 + 0.6 * (n.weight / maxWeight);
                var r = Math.round(124 * intensity);
                var g = Math.round(58 * intensity);
                var b = Math.round(237 * intensity);
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.85)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(124,58,237,0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Labels
            ctx.font = '8px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(200,200,220,0.7)';
            for (var i = 0; i < nodes.length; i++) {
                ctx.fillText(nodes[i].name, nodes[i].x, nodes[i].y + nodes[i].radius + 2);
            }

            iteration++;
            if (iteration < maxIter) {
                self._animFrame = requestAnimationFrame(tick);
            }
        }

        tick();
    }
}

window.knowledgeGraphPanel = new KnowledgeGraphPanel();
