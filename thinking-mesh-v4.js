/**
 * JARVIS Thinking Mesh v4 - Clean Geodesic Wireframe
 *
 * Single unified polygon shape (icosahedron → dodecahedron → sphere)
 * that gently orbits the ferrofluid blob. Clean lines, no particles,
 * no triangulation artifacts.
 *
 * Replaces v3's point cloud + constellation line approach with a
 * proper EdgesGeometry wireframe — one unified shape, clean edges.
 */

class ThinkingMeshV4 {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            enabled: true,
            morphSpeed: 0.3,       // Slow morph — gentle transition
            colorHue: 180,
            saturation: 0.7,
            brightness: 0.9,
            autoMorph: false,      // OFF by default — only morph when triggered by events
            morphInterval: 30.0,   // If auto-morph enabled: 30 seconds minimum between morphs
            orbitRadius: 3.5,      // Distance from center (around ferrofluid) — visible at camera distance 13-16
            orbitSpeed: 0.08,      // Gentle rotation speed
            breatheAmplitude: 0.06, // Subtle scale pulsing
            lineWidth: 1,          // Clean line width
            opacity: 0.9,          // Very bright — thin lines need high opacity
            detail: 1,             // Icosahedron subdivision (0=sharp, 1=smooth, 2=very smooth)
            scale: 5.0,            // Must be larger than ferrofluid blob (radius 3) to surround it
            ...options
        };

        this._group = new THREE.Group();
        this._meshGroup = new THREE.Group(); // Holds the wireframe, orbits inside _group
        this._group.add(this._meshGroup);
        this.scene.add(this._group);

        // Current wireframe mesh
        this._wireframe = null;
        this._material = null;

        // Shape queue
        this._shapes = ['icosahedron', 'dodecahedron', 'octahedron', 'icosahedron_smooth'];
        this._currentIndex = 0;
        this._nextMorphTime = 0;

        // Morph state
        this._morphing = false;
        this._morphProgress = 0;
        this._morphSpeed = 0;
        this._sourceScale = 1.0;
        this._targetScale = 1.0;

        // Audio
        this._audioIntensity = 0;

        // Time
        this._time = 0;

        // Apply scale to the group
        this._meshGroup.scale.setScalar(this.options.scale || 1.0);

        // Build initial shape — BEHIND the ferrofluid orb, bigger, always visible, never fades
        this._material = new THREE.LineBasicMaterial({
            color: this._getColor(),
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,  // Normal depth — blob renders in front, wireframe behind
        });

        // Render order BEFORE the ferrofluid — wireframe draws first, blob covers it
        this._group.renderOrder = -1;

        this._buildShape(this._shapes[0]);

        console.log('[ThinkingMeshV4] Initialized — clean geodesic wireframe');
    }

    _getColor() {
        const h = this.options.colorHue / 360;
        const s = this.options.saturation;
        const v = this.options.brightness;
        const color = new THREE.Color();
        color.setHSL(h, s, v * 0.5);
        return color;
    }

    _createGeometry(shapeName) {
        const detail = this.options.detail;
        switch (shapeName) {
            case 'icosahedron':
                return new THREE.IcosahedronGeometry(0.8, 0);
            case 'icosahedron_smooth':
                return new THREE.IcosahedronGeometry(0.8, detail);
            case 'dodecahedron':
                return new THREE.DodecahedronGeometry(0.8, 0);
            case 'octahedron':
                return new THREE.OctahedronGeometry(0.9, 0);
            case 'sphere':
                return new THREE.IcosahedronGeometry(0.8, 2);
            default:
                return new THREE.IcosahedronGeometry(0.8, detail);
        }
    }

    _buildShape(shapeName) {
        // Remove old wireframe
        if (this._wireframe) {
            this._meshGroup.remove(this._wireframe);
            this._wireframe.geometry.dispose();
        }

        const solidGeometry = this._createGeometry(shapeName);
        // Use WireframeGeometry for full triangle visibility (EdgesGeometry was too sparse)
        const wireGeo = new THREE.WireframeGeometry(solidGeometry);
        solidGeometry.dispose();

        this._wireframe = new THREE.LineSegments(wireGeo, this._material);
        this._meshGroup.add(this._wireframe);
    }

    updateAudioData(audioData) {
        if (!audioData) return;
        const bufferLength = audioData.length;
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += audioData[i];
        const target = sum / bufferLength / 255;
        this._audioIntensity = this._audioIntensity * 0.85 + target * 0.15;
    }

    morphToNextShape() {
        if (!this.options.enabled) return;
        this._currentIndex = (this._currentIndex + 1) % this._shapes.length;
        const nextShape = this._shapes[this._currentIndex];

        // Quick fade-out, rebuild, fade-in
        this._morphing = true;
        this._morphProgress = 0;
        this._morphSpeed = 1.0 / (2.0 / this.options.morphSpeed);
        this._pendingShape = nextShape;

        console.log('[ThinkingMeshV4] Morphing to', nextShape);
    }

    update(deltaTime) {
        if (!this.options.enabled) return;

        this._time += deltaTime;

        // ── Morph transition — instant shape swap, NO fade, always visible ──
        if (this._morphing) {
            this._morphProgress += this._morphSpeed * deltaTime;

            if (this._morphProgress >= 0.5 && this._pendingShape) {
                // Swap shape instantly at midpoint — no fade out/in
                this._buildShape(this._pendingShape);
                this._pendingShape = null;
            }

            if (this._morphProgress >= 1.0) {
                this._morphing = false;
            }
        }

        // ── Auto-morph timer ──
        if (this.options.autoMorph && this._time >= this._nextMorphTime && !this._morphing) {
            let interval = this.options.morphInterval;
            if (this._audioIntensity > 0.2) {
                interval *= (1 - this._audioIntensity * 0.4);
            }
            this.morphToNextShape();
            this._nextMorphTime = this._time + interval;
        }

        // ── Centered on ferrofluid blob — shared origin (0,0,0) ──
        this._meshGroup.position.x = 0;
        this._meshGroup.position.y = 0;
        this._meshGroup.position.z = 0;

        // ── Slow self-rotation (the wireframe turns gently around the blob) ──
        this._meshGroup.rotation.y += deltaTime * this.options.orbitSpeed;
        this._meshGroup.rotation.x = Math.sin(this._time * 0.1) * 0.12;
        this._meshGroup.rotation.z = Math.cos(this._time * 0.08) * 0.08;

        // ── Breathe (subtle scale pulse) — ALWAYS at least 20% bigger than blob ──
        // Blob radius = 3.0, geometry radius = 0.8
        // Minimum wireframe radius must be 3.6 (3.0 * 1.2)
        // min scale = 3.6 / 0.8 = 4.5
        const MIN_SCALE = 4.5; // Guarantees 20% bigger than blob at all times
        const breathe = 1.0 + Math.sin(this._time * 0.5) * this.options.breatheAmplitude;
        const audioScale = 1.0 + this._audioIntensity * 0.08;
        if (this._wireframe && !this._morphing) {
            // Scale with breathe + audio, but clamp to MIN_SCALE (20% bigger than blob)
            const targetScale = Math.max(MIN_SCALE, this.options.scale * breathe * audioScale);
            this._meshGroup.scale.setScalar(targetScale);
        }

        // ── Audio-reactive color shift (no opacity changes — wireframe is always fully opaque) ──
        if (!this._morphing) {
            this._material.opacity = this.options.opacity + this._audioIntensity * 0.15;
        }

        // ── Audio-reactive color shift ──
        const hueShift = this._audioIntensity * 20;
        const h = ((this.options.colorHue + hueShift) % 360) / 360;
        this._material.color.setHSL(h, this.options.saturation, this.options.brightness * 0.5);
    }

    // ── Control methods ──

    setEnabled(enabled) {
        this.options.enabled = enabled;
        if (this._wireframe) this._wireframe.visible = enabled;
    }

    setColorHue(hue) {
        this.options.colorHue = hue % 360;
        this._material.color.copy(this._getColor());
    }

    setMorphSpeed(speed) {
        this.options.morphSpeed = Math.max(0.1, Math.min(3.0, speed));
    }

    setAutoMorph(enabled) {
        this.options.autoMorph = enabled;
    }

    setDetail(detail) {
        this.options.detail = Math.max(0, Math.min(3, detail));
        this._buildShape(this._shapes[this._currentIndex]);
    }

    setOrbitRadius(r) {
        this.options.orbitRadius = r;
    }

    setOrbitSpeed(s) {
        this.options.orbitSpeed = s;
    }

    morphToShape(shapeName) {
        const index = this._shapes.indexOf(shapeName);
        if (index >= 0) this._currentIndex = index;
        this._pendingShape = shapeName;
        this._morphing = true;
        this._morphProgress = 0;
        this._morphSpeed = 0.8;
    }

    get currentShape() { return this._shapes[this._currentIndex]; }
    get isMorphing() { return this._morphing; }

    dispose() {
        if (this._wireframe) {
            this._wireframe.geometry.dispose();
            this._meshGroup.remove(this._wireframe);
        }
        if (this._material) this._material.dispose();
        this.scene.remove(this._group);
        console.log('[ThinkingMeshV4] Disposed');
    }
}

// Backward compatibility — replace v3
window.ThinkingMeshV4 = ThinkingMeshV4;
window.ThinkingMeshV3 = ThinkingMeshV4;
