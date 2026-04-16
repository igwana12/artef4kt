/**
 * Hexagram Detail Panel — Rich I Ching hexagram overlay for JARVIS voice interface
 *
 * Full-detail panel showing all Wilhelm translation data for a cast hexagram:
 *   - Header with number, Chinese character, Unicode glyph, pinyin
 *   - SVG hexagram visualization with changing line indicators
 *   - Upper/lower trigram breakdown
 *   - Full Judgment and Image texts (scrollable)
 *   - Changing lines with position highlights
 *   - Relating and opposite hexagram references
 *   - Binary representation as visual dots
 *
 * Follows .viz-panel CSS convention (z-index 160, glass-dark aesthetic, gold border).
 * Driven by hexagram_detail_show / hexagram_detail_hide WS events.
 */

class HexagramDetailPanel {
    constructor() {
        this._el      = null;
        this._visible = false;
        this._prepared = false;
    }

    init() {
        if (this._el) return;
        const el = document.createElement('div');
        el.id = 'hexagram-detail-panel';
        Object.assign(el.style, {
            position:       'fixed',
            left:           '20px',
            top:            '80px',
            width:          '320px',
            maxHeight:      '75vh',
            background:     'rgba(0,0,0,0.88)',
            border:         '2px solid rgba(218,165,32,0.65)',
            borderRadius:   '10px',
            zIndex:         '160',
            opacity:        '0',
            transition:     'opacity 0.6s ease',
            backdropFilter: 'blur(12px)',
            padding:        '18px',
            display:        'none',
            boxSizing:      'border-box',
            overflowY:      'auto',
            overflowX:      'hidden',
            boxShadow:      '0 0 30px rgba(218,165,32,0.08), inset 0 0 60px rgba(0,0,0,0.3)',
            pointerEvents:  'none',
        });

        /* Scrollbar styling */
        const style = document.createElement('style');
        style.textContent = `
            #hexagram-detail-panel::-webkit-scrollbar { width: 4px; }
            #hexagram-detail-panel::-webkit-scrollbar-track { background: transparent; }
            #hexagram-detail-panel::-webkit-scrollbar-thumb { background: rgba(218,165,32,0.3); border-radius: 2px; }
            #hexagram-detail-panel::-webkit-scrollbar-thumb:hover { background: rgba(218,165,32,0.5); }
        `;
        document.head.appendChild(style);
        document.body.appendChild(el);
        this._el = el;
    }

    /**
     * Show the panel with hexagram data.
     * @param {Object} data       - Hexagram data from iching_wilhelm.json
     * @param {boolean} prepared  - If true, render hidden and wait for reveal()
     */
    show(data, prepared) {
        this.init();
        this._el.innerHTML = this._buildContent(data);
        this._el.style.display = 'block';

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

    /** Reveal a prepared panel */
    reveal() {
        if (!this._el || !this._prepared) return;
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

    /** VisualStageController interface: route WS message to show/hide */
    handleMessage(msg) {
        if (msg.type === 'hexagram_detail_show') this.show(msg.hexagram || msg.data || msg);
        else if (msg.type === 'hexagram_detail_hide') this.hide();
    }

    /** VisualStageController interface: container element */
    get container() { this.init(); return this._el; }

    /** VisualStageController interface: visibility check */
    get isVisible() { return this._visible; }

    /* ─────────────────────────────────────────────
       SVG Hexagram Builder (reuses oracle-panels pattern)
       ───────────────────────────────────────────── */

    _buildHexagramSVG(lines, changingLines) {
        const LINE_WIDTH      = 140;
        const LINE_HEIGHT     = 8;
        const LINE_GAP        = 20;
        const BREAK_GAP       = 16;
        const PANEL_CX        = 150;
        const CHANGING_RADIUS = 5;

        const x1 = PANEL_CX - LINE_WIDTH / 2;
        const x2 = PANEL_CX + LINE_WIDTH / 2;

        const changingSet = new Set(changingLines || []);
        let paths = '';

        for (let i = 0; i < 6; i++) {
            const lineNum = i + 1;
            const value   = lines[i];
            const y       = 160 - (i * LINE_GAP);
            const isYang  = (value === 7 || value === 9);
            const isChanging = changingSet.has(lineNum);

            const stroke = 'rgba(218,165,32,0.9)';
            const strokeAttrs = `stroke="${stroke}" stroke-width="${LINE_HEIGHT}" stroke-linecap="round"`;

            if (isYang) {
                paths += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${strokeAttrs} />`;
            } else {
                const halfBreak = BREAK_GAP / 2;
                paths += `<line x1="${x1}" y1="${y}" x2="${PANEL_CX - halfBreak}" y2="${y}" ${strokeAttrs} />`;
                paths += `<line x1="${PANEL_CX + halfBreak}" y1="${y}" x2="${x2}" y2="${y}" ${strokeAttrs} />`;
            }

            if (isChanging) {
                const fillColor = isYang
                    ? 'rgba(124,58,237,0.9)'
                    : 'rgba(88,28,135,0.9)';
                paths += `<circle cx="${PANEL_CX}" cy="${y}" r="${CHANGING_RADIUS}" fill="${fillColor}" stroke="rgba(218,165,32,0.8)" stroke-width="1.5" />`;
            }

            /* Line number labels */
            paths += `<text x="${x1 - 14}" y="${y + 4}" fill="rgba(180,180,200,0.3)" font-size="9" font-family="'JetBrains Mono',monospace" text-anchor="end">${lineNum}</text>`;
        }

        /* Trigram divider — subtle dashed line between lines 3 and 4 */
        const divY = 160 - (2.5 * LINE_GAP);
        paths += `<line x1="${x1 - 8}" y1="${divY}" x2="${x2 + 8}" y2="${divY}" stroke="rgba(218,165,32,0.15)" stroke-width="1" stroke-dasharray="4,4" />`;

        return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">${paths}</svg>`;
    }

    /* ─────────────────────────────────────────────
       Binary Visualization (filled/empty circles)
       ───────────────────────────────────────────── */

    _buildBinaryDots(binary) {
        if (!binary) return '';
        let dots = '';
        for (let i = 0; i < binary.length; i++) {
            const bit = binary[i];
            const cx = 16 + i * 22;
            if (bit === '1') {
                dots += `<circle cx="${cx}" cy="10" r="7" fill="rgba(218,165,32,0.7)" stroke="rgba(218,165,32,0.9)" stroke-width="1" />`;
            } else {
                dots += `<circle cx="${cx}" cy="10" r="7" fill="none" stroke="rgba(218,165,32,0.4)" stroke-width="1.5" />`;
            }
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="20" viewBox="0 0 160 20">${dots}</svg>`;
    }

    /* ─────────────────────────────────────────────
       Content Builder
       ───────────────────────────────────────────── */

    _buildContent(data) {
        const num            = data.num || '';
        const name           = data.name || '';
        const hexFont        = data.hex_font || '';
        const tradChinese    = data.trad_chinese || '';
        const pinyin         = data.pinyin || '';
        const lines          = data.lines || [7,7,7,7,7,7];
        const changingLines  = data.changing_lines || [];
        const changingTexts  = data.changing_texts || [];
        const relatingNum    = data.relating_num || null;
        const relatingName   = data.relating_name || '';
        const judgment       = data.judgment || '';
        const judgmentComm   = data.judgment_comments || '';
        const imageText      = data.image_text || '';
        const imageComm      = data.image_comments || '';
        const upperTrigram   = data.upper_trigram || {};
        const lowerTrigram   = data.lower_trigram || {};
        const binary         = data.binary || '';
        const oppositeHex    = data.opposite_hex || null;

        /* Section divider helper */
        const divider = `<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(218,165,32,0.25),transparent);margin:12px 0;"></div>`;

        /* ── 1. Header ── */
        const header = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.65em;font-weight:700;
                    letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);">
                    HEXAGRAM ${num}
                </div>
                <div style="font-size:1.8em;color:rgba(218,165,32,0.7);line-height:1;">
                    ${tradChinese}
                </div>
                <div style="font-size:2.2em;color:rgba(218,165,32,0.5);line-height:1;">
                    ${hexFont}
                </div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.6em;
                    color:rgba(180,180,200,0.5);font-style:italic;">
                    ${pinyin}
                </div>
            </div>
        `;

        /* ── 2. English Name ── */
        const nameBlock = `
            <div style="font-family:'Cinzel',serif;font-size:1.3em;color:rgba(218,165,32,0.95);
                letter-spacing:0.08em;margin-bottom:10px;">
                ${name}
            </div>
        `;

        /* ── 3. SVG Hexagram ── */
        const hexSvg = `
            <div style="display:flex;justify-content:center;margin-bottom:4px;">
                ${this._buildHexagramSVG(lines, changingLines)}
            </div>
        `;

        /* ── 4. Trigram Info (two columns) ── */
        const trigramBlock = `
            <div style="display:flex;gap:8px;margin-bottom:4px;">
                <div style="flex:1;background:rgba(218,165,32,0.04);border:1px solid rgba(218,165,32,0.12);
                    border-radius:6px;padding:8px;">
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;font-weight:700;
                        letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);margin-bottom:4px;">
                        UPPER
                    </div>
                    <div style="font-family:'Cinzel',serif;font-size:0.75em;color:rgba(218,165,32,0.8);">
                        ${upperTrigram.chinese || ''}
                    </div>
                    <div style="font-family:'Inter',sans-serif;font-size:0.6em;color:rgba(180,180,200,0.6);margin-top:2px;">
                        ${upperTrigram.symbolic || ''}
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;
                        color:rgba(124,58,237,0.6);margin-top:2px;letter-spacing:0.05em;">
                        ${upperTrigram.alchemical || ''}
                    </div>
                </div>
                <div style="flex:1;background:rgba(218,165,32,0.04);border:1px solid rgba(218,165,32,0.12);
                    border-radius:6px;padding:8px;">
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;font-weight:700;
                        letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);margin-bottom:4px;">
                        LOWER
                    </div>
                    <div style="font-family:'Cinzel',serif;font-size:0.75em;color:rgba(218,165,32,0.8);">
                        ${lowerTrigram.chinese || ''}
                    </div>
                    <div style="font-family:'Inter',sans-serif;font-size:0.6em;color:rgba(180,180,200,0.6);margin-top:2px;">
                        ${lowerTrigram.symbolic || ''}
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;
                        color:rgba(124,58,237,0.6);margin-top:2px;letter-spacing:0.05em;">
                        ${lowerTrigram.alchemical || ''}
                    </div>
                </div>
            </div>
        `;

        /* ── 5. Judgment Section ── */
        const judgmentBlock = judgment ? `
            ${divider}
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;font-weight:700;
                letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);margin-bottom:6px;">
                THE JUDGMENT
            </div>
            <div style="font-family:'Cinzel',serif;font-size:0.78em;color:rgba(218,165,32,0.75);
                line-height:1.6;margin-bottom:6px;font-style:italic;">
                ${judgment}
            </div>
            ${judgmentComm ? `
                <div style="font-family:'Inter',sans-serif;font-size:0.65em;color:rgba(180,180,200,0.55);
                    line-height:1.55;">
                    ${judgmentComm}
                </div>
            ` : ''}
        ` : '';

        /* ── 6. Image Section ── */
        const imageBlock = imageText ? `
            ${divider}
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;font-weight:700;
                letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);margin-bottom:6px;">
                THE IMAGE
            </div>
            <div style="font-family:'Cinzel',serif;font-size:0.78em;color:rgba(218,165,32,0.75);
                line-height:1.6;margin-bottom:6px;font-style:italic;">
                ${imageText}
            </div>
            ${imageComm ? `
                <div style="font-family:'Inter',sans-serif;font-size:0.65em;color:rgba(180,180,200,0.55);
                    line-height:1.55;">
                    ${imageComm}
                </div>
            ` : ''}
        ` : '';

        /* ── 7. Changing Lines Section ── */
        let changingBlock = '';
        if (changingTexts.length > 0) {
            const changingCards = changingTexts.map(cl => `
                <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.2);
                    border-radius:6px;padding:8px;margin-bottom:6px;">
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;font-weight:700;
                        letter-spacing:0.18em;text-transform:uppercase;color:rgba(124,58,237,0.85);margin-bottom:4px;">
                        LINE ${cl.position}
                    </div>
                    <div style="font-family:'Inter',sans-serif;font-size:0.65em;color:rgba(180,180,200,0.7);
                        line-height:1.55;">
                        ${cl.text || ''}
                    </div>
                </div>
            `).join('');

            changingBlock = `
                ${divider}
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;font-weight:700;
                    letter-spacing:0.18em;text-transform:uppercase;color:rgba(124,58,237,0.85);margin-bottom:8px;">
                    CHANGING LINES
                </div>
                ${changingCards}
            `;
        }

        /* ── 8. Relating Hexagram ── */
        const relatingBlock = relatingNum ? `
            ${divider}
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;font-weight:700;
                    letter-spacing:0.18em;text-transform:uppercase;color:rgba(124,58,237,0.85);">
                    RELATING
                </div>
                <div style="font-family:'Cinzel',serif;font-size:0.8em;color:rgba(124,58,237,0.7);">
                    ${relatingNum}. ${relatingName}
                </div>
            </div>
        ` : '';

        /* ── 9. Binary Representation ── */
        const binaryBlock = binary ? `
            ${divider}
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;font-weight:700;
                    letter-spacing:0.18em;text-transform:uppercase;color:rgba(218,165,32,0.85);">
                    BINARY
                </div>
                <div>${this._buildBinaryDots(binary)}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.55em;
                    color:rgba(180,180,200,0.35);">
                    ${binary}
                </div>
            </div>
        ` : '';

        /* ── 10. Opposite Hexagram ── */
        const oppositeBlock = oppositeHex ? `
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.5em;font-weight:700;
                    letter-spacing:0.18em;text-transform:uppercase;color:rgba(180,180,200,0.5);">
                    OPPOSITE
                </div>
                <div style="font-family:'Cinzel',serif;font-size:0.75em;color:rgba(180,180,200,0.4);">
                    Hexagram ${oppositeHex}
                </div>
            </div>
        ` : '';

        return header + nameBlock + hexSvg + trigramBlock
             + judgmentBlock + imageBlock + changingBlock
             + relatingBlock + binaryBlock + oppositeBlock;
    }
}

window.hexagramDetailPanel = new HexagramDetailPanel();
