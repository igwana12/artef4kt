/**
 * Wolfram Alpha Rich Results Panel
 *
 * Displays multi-pod Wolfram Alpha results with collapsible cards,
 * text answers, and image URLs. Replaces the single-line Short Answers
 * display with a richer, scrollable panel on the left side.
 *
 * Events:
 *   wolfram_show  -> show(data)       data = { query, pods[], source, computation_time }
 *   wolfram_hide  -> hide()
 *
 * Data shape per pod:
 *   { title: string, text: string|null, image_url: string|null }
 *
 * Design: glass-dark aesthetic, orange computational accent,
 *         JetBrains Mono titles, monospace content.
 */
class WolframPanel {
    constructor() {
        this._el      = null;
        this._visible = false;
        this._prepared = false;
    }

    init() {
        if (this._el) return;
        const el = document.createElement('div');
        el.id = 'wolfram-panel';
        Object.assign(el.style, {
            position:       'fixed',
            left:           '20px',
            top:            '380px',
            width:          '320px',
            maxHeight:      '50vh',
            overflowY:      'auto',
            overflowX:      'hidden',
            background:     'rgba(0,0,0,0.88)',
            border:         '2px solid rgba(255,165,0,0.55)',
            borderRadius:   '10px',
            zIndex:         '160',
            opacity:        '0',
            transition:     'opacity 0.6s ease',
            backdropFilter: 'blur(12px)',
            padding:        '16px',
            display:        'none',
            boxSizing:      'border-box',
            boxShadow:      '0 0 30px rgba(255,165,0,0.08), inset 0 0 60px rgba(0,0,0,0.3)',
            pointerEvents:  'none',
        });

        /* Custom scrollbar — thin, orange-tinted */
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            #wolfram-panel::-webkit-scrollbar { width: 4px; }
            #wolfram-panel::-webkit-scrollbar-track { background: transparent; }
            #wolfram-panel::-webkit-scrollbar-thumb {
                background: rgba(255,165,0,0.3);
                border-radius: 2px;
            }
        `;
        document.head.appendChild(styleTag);
        document.body.appendChild(el);
        this._el = el;
    }

    /**
     * Show the panel with Wolfram data.
     * @param {Object} data   - { query, pods, source, computation_time }
     * @param {boolean} prepared - If true, render hidden; call reveal() later.
     */
    show(data, prepared) {
        this.init();
        this._el.innerHTML = this._buildContent(data || {});
        this._el.style.display = 'block';
        this._el.scrollTop = 0;

        if (prepared) {
            this._prepared = true;
            this._visible = false;
            return;
        }

        this._visible = true;
        this._prepared = false;
        requestAnimationFrame(() => {
            this._el.style.opacity = '1';
            this._el.style.pointerEvents = 'auto';
        });
    }

    /** Reveal a previously prepared (hidden-rendered) panel. */
    reveal() {
        if (!this._el) return;
        this._prepared = false;
        this._visible = true;
        requestAnimationFrame(() => {
            this._el.style.opacity = '1';
            this._el.style.pointerEvents = 'auto';
        });
    }

    hide() {
        if (!this._el) return;
        this._el.style.opacity = '0';
        this._el.style.pointerEvents = 'none';
        this._visible = false;
        this._prepared = false;
        setTimeout(() => {
            if (this._el) this._el.style.display = 'none';
        }, 600);
    }

    /** VisualStageController interface */
    handleMessage(msg) {
        if (msg.type === 'wolfram_show') this.show(msg.data || msg, msg.prepared);
        else if (msg.type === 'wolfram_hide') this.hide();
    }

    /** VisualStageController interface */
    get container() { this.init(); return this._el; }

    /** VisualStageController interface */
    get isVisible() { return this._visible; }

    /* ── private builders ─────────────────────── */

    _buildContent(data) {
        const query           = data.query || '';
        const pods            = data.pods || [];
        const source          = data.source || 'Wolfram Alpha';
        const computationTime = data.computation_time || '';

        const isSinglePod = pods.length === 1;
        const isLatex     = this._looksLikeLatex(query) ||
                            pods.some(p => this._looksLikeLatex(p.text || ''));

        /* Title */
        let html = `
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.72em;font-weight:700;
                letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,165,0,0.85);
                margin-bottom:10px;opacity:0.85;">
                WOLFRAM ALPHA
            </div>
        `;

        /* Query badge */
        if (query) {
            html += `
                <div style="background:rgba(255,165,0,0.08);border:1px solid rgba(255,165,0,0.25);
                    border-radius:6px;padding:6px 10px;margin-bottom:14px;
                    font-family:'JetBrains Mono',monospace;font-size:0.72em;
                    color:rgba(255,200,100,0.9);word-break:break-word;line-height:1.4;">
                    ${this._esc(query)}
                </div>
            `;
        }

        /* Pods */
        if (isSinglePod) {
            html += this._buildSinglePod(pods[0], isLatex);
        } else {
            pods.forEach((pod, idx) => {
                html += this._buildPodCard(pod, idx, isLatex);
            });
        }

        /* Footer */
        if (computationTime || source) {
            const parts = [];
            if (source) parts.push(this._esc(source));
            if (computationTime) parts.push(this._esc(computationTime));
            html += `
                <div style="margin-top:12px;padding-top:8px;
                    border-top:1px solid rgba(255,165,0,0.15);
                    font-family:'JetBrains Mono',monospace;font-size:0.55em;
                    color:rgba(255,165,0,0.35);letter-spacing:0.08em;text-transform:uppercase;">
                    ${parts.join(' &middot; ')}
                </div>
            `;
        }

        return html;
    }

    /**
     * Single-pod layout: large centered answer.
     */
    _buildSinglePod(pod, isLatex) {
        const title = pod.title || '';
        const text  = pod.text  || '';
        const img   = pod.image_url || null;

        const fontSize = isLatex ? '1.6em' : '1.3em';
        let html = '';

        if (title) {
            html += `
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.65em;font-weight:700;
                    letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,165,0,0.6);
                    margin-bottom:6px;opacity:0.85;">
                    ${this._esc(title)}
                </div>
            `;
        }

        if (text) {
            html += `
                <div style="font-family:'JetBrains Mono',monospace;font-size:${fontSize};
                    color:rgba(255,220,140,0.95);text-align:center;padding:12px 0;
                    line-height:1.5;word-break:break-word;">
                    ${this._formatText(text)}
                </div>
            `;
        }

        if (img) {
            html += this._buildImage(img);
        }

        return html;
    }

    /**
     * Multi-pod card with orange left-border accent and collapse toggle.
     */
    _buildPodCard(pod, index, isLatex) {
        const title = pod.title || 'Result';
        const text  = pod.text  || '';
        const img   = pod.image_url || null;
        const id    = 'wolfram-pod-' + index;

        /* Determine if this is a "primary" result pod (show expanded) */
        const titleLower = title.toLowerCase();
        const isPrimary  = titleLower === 'result' || titleLower === 'solution' ||
                           titleLower === 'answer' || index === 0;

        let html = `
            <div style="border-left:3px solid rgba(255,165,0,0.45);margin-bottom:10px;
                padding-left:10px;">
                <div onclick="(function(){
                    var b=document.getElementById('${id}');
                    var a=document.getElementById('${id}-arrow');
                    if(b.style.display==='none'){b.style.display='block';a.textContent='\\u25BE';}
                    else{b.style.display='none';a.textContent='\\u25B8';}
                })()" style="cursor:pointer;display:flex;align-items:center;gap:6px;
                    margin-bottom:4px;user-select:none;">
                    <span id="${id}-arrow" style="font-size:0.7em;color:rgba(255,165,0,0.5);">
                        ${isPrimary ? '\u25BE' : '\u25B8'}
                    </span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:0.78em;
                        font-weight:700;letter-spacing:0.14em;text-transform:uppercase;
                        color:rgba(255,165,0,0.7);opacity:0.85;">
                        ${this._esc(title)}
                    </span>
                </div>
                <div id="${id}" style="display:${isPrimary ? 'block' : 'none'};">
        `;

        if (text) {
            const fs = isLatex ? '1.1em' : '0.78em';
            html += `
                    <div style="font-family:'JetBrains Mono',monospace;font-size:${fs};
                        color:rgba(200,200,220,0.85);line-height:1.55;padding:4px 0;
                        word-break:break-word;">
                        ${this._formatText(text)}
                    </div>
            `;
        }

        if (img) {
            html += this._buildImage(img);
        }

        html += `
                </div>
            </div>
        `;
        return html;
    }

    _buildImage(url) {
        return `
            <div style="margin:6px 0;text-align:center;">
                <img src="${this._esc(url)}" alt="Wolfram result"
                    style="max-width:100%;border-radius:6px;
                    border:1px solid rgba(255,165,0,0.2);
                    background:rgba(255,255,255,0.95);"
                    onerror="this.style.display='none';" />
            </div>
        `;
    }

    /**
     * Format text: escape HTML, convert newlines to <br>, detect LaTeX-ish.
     */
    _formatText(text) {
        let s = this._esc(text);
        s = s.replace(/\n/g, '<br>');
        return s;
    }

    /** Rough check for LaTeX-like content. */
    _looksLikeLatex(text) {
        if (!text) return false;
        return /\\(frac|sqrt|sum|int|partial|left|right|begin|end|alpha|beta|gamma|delta|theta|pi|infty|mathrm|mathbb)/.test(text)
            || /\$\$.+\$\$/.test(text);
    }

    /** HTML-escape */
    _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(String(str)));
        return d.innerHTML;
    }
}

window.wolframPanel = new WolframPanel();
