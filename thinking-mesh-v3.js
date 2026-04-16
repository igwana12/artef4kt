/**
 * JARVIS Thinking Mesh v3 - PointCloudMorph Controller
 *
 * Controls the PointCloudMorph system to create a beautiful, audio-reactive
 * particle cloud that morphs between platonic solids. Represents JARVIS's 
 * neural network thinking process.
 *
 * Features:
 * - Cycles through platonic solids (tetrahedron, cube, octahedron, dodecahedron, icosahedron)
 * - Audio-reactive morphing speed and intensity
 * - Dynamic color shifts based on audio frequency bands
 * - Organic breathing and pulsing animations
 */

class ThinkingMeshV3 {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            enabled: true,
            morphSpeed: 1.0,
            colorHue: 180, // cyan-blue base
            saturation: 0.8,
            brightness: 0.9,
            autoMorph: true,
            morphInterval: 8.0, // seconds between auto morphs
            ...options
        };

        // Platonic solids queue
        this.solidQueue = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
        this.currentSolidIndex = 0;
        this.nextMorphTime = 0;

        // Audio reactivity
        this.audioData = null;
        this.bassLevel = 0;
        this.midLevel = 0;
        this.trebleLevel = 0;
        this.overallLevel = 0;

        // Initialize the morph engine
        this.morph = new PointCloudMorph(scene, {
            pointCount: 3000,
            color: this._getColor(),
            particleSize: 0.01,
            lineColor: this._getColor(),
            maxLineDistance: 0.18,
            maxLines: 5000
        });

        // Pre-generate platonic solid geometries
        this.geometries = this._createPlatonicSolids();

        // Start with tetrahedron
        this.morph.setGeometry(this.geometries.tetrahedron);
        
        this.time = 0;
        
        console.log('[ThinkingMeshV3] Initialized with PointCloudMorph system');
    }

    _createPlatonicSolids() {
        const geometries = {};

        // Tetrahedron
        geometries.tetrahedron = new THREE.TetrahedronGeometry(1.0, 0);

        // Cube
        geometries.cube = new THREE.BoxGeometry(1.2, 1.2, 1.2);

        // Octahedron
        geometries.octahedron = new THREE.OctahedronGeometry(1.1, 0);

        // Dodecahedron
        geometries.dodecahedron = new THREE.DodecahedronGeometry(1.0, 0);

        // Icosahedron
        geometries.icosahedron = new THREE.IcosahedronGeometry(1.0, 0);

        console.log('[ThinkingMeshV3] Generated', Object.keys(geometries).length, 'platonic solids');
        return geometries;
    }

    _getColor() {
        const hue = this.options.colorHue / 360;
        const sat = this.options.saturation;
        const brightness = this.options.brightness;
        
        // Convert HSV to RGB
        const c = brightness * sat;
        const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
        const m = brightness - c;
        
        let r, g, b;
        if (hue < 1/6) { r = c; g = x; b = 0; }
        else if (hue < 2/6) { r = x; g = c; b = 0; }
        else if (hue < 3/6) { r = 0; g = c; b = x; }
        else if (hue < 4/6) { r = 0; g = x; b = c; }
        else if (hue < 5/6) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        
        return (r << 16) | (g << 8) | b;
    }

    updateAudioData(audioData) {
        if (!audioData) return;
        
        this.audioData = audioData;
        
        // Calculate frequency band levels
        const bufferLength = audioData.length;
        const bassEnd = Math.floor(bufferLength * 0.1);
        const midEnd = Math.floor(bufferLength * 0.4);
        
        let bassSum = 0, midSum = 0, trebleSum = 0;
        
        // Bass (0-10% of spectrum)
        for (let i = 0; i < bassEnd; i++) {
            bassSum += audioData[i];
        }
        this.bassLevel = bassSum / bassEnd / 255;
        
        // Mid (10-40% of spectrum) 
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += audioData[i];
        }
        this.midLevel = midSum / (midEnd - bassEnd) / 255;
        
        // Treble (40-100% of spectrum)
        for (let i = midEnd; i < bufferLength; i++) {
            trebleSum += audioData[i];
        }
        this.trebleLevel = trebleSum / (bufferLength - midEnd) / 255;
        
        // Overall level
        this.overallLevel = (bassSum + midSum + trebleSum) / bufferLength / 255;
        
        // Update colors based on frequency content
        this._updateColors();
    }

    _updateColors() {
        // Shift hue based on frequency dominance
        let hueShift = 0;
        
        // Bass makes it more red/warm
        hueShift -= this.bassLevel * 30;
        
        // Treble makes it more blue/cool  
        hueShift += this.trebleLevel * 30;
        
        // Mid frequencies add green tinge
        if (this.midLevel > this.bassLevel && this.midLevel > this.trebleLevel) {
            hueShift += this.midLevel * 15;
        }
        
        const newHue = (this.options.colorHue + hueShift + 360) % 360;
        const newColor = this._getColorFromHue(newHue);
        
        this.morph.setColor(newColor);
    }

    _getColorFromHue(hue) {
        const hueNorm = hue / 360;
        const sat = this.options.saturation;
        const brightness = this.options.brightness;
        
        const c = brightness * sat;
        const x = c * (1 - Math.abs((hueNorm * 6) % 2 - 1));
        const m = brightness - c;
        
        let r, g, b;
        if (hueNorm < 1/6) { r = c; g = x; b = 0; }
        else if (hueNorm < 2/6) { r = x; g = c; b = 0; }
        else if (hueNorm < 3/6) { r = 0; g = c; b = x; }
        else if (hueNorm < 4/6) { r = 0; g = x; b = c; }
        else if (hueNorm < 5/6) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        
        return (r << 16) | (g << 8) | b;
    }

    morphToNextSolid() {
        if (!this.options.enabled) return;
        
        this.currentSolidIndex = (this.currentSolidIndex + 1) % this.solidQueue.length;
        const nextSolid = this.solidQueue[this.currentSolidIndex];
        const geometry = this.geometries[nextSolid];
        
        // Dynamic morph duration based on audio intensity
        let baseDuration = 3.0 / this.options.morphSpeed;
        
        // Faster morphs during intense audio
        if (this.overallLevel > 0.3) {
            baseDuration *= (1 - this.overallLevel * 0.5);
        }
        
        this.morph.morphToGeometry(geometry, baseDuration);
        
        console.log('[ThinkingMeshV3] Morphing to', nextSolid, 'over', baseDuration.toFixed(1), 's');
    }

    triggerScatter() {
        if (!this.options.enabled) return;
        
        // Scatter with intensity based on audio
        const radius = 1.5 + this.overallLevel * 1.0;
        this.morph.scatter(radius);
        
        console.log('[ThinkingMeshV3] Triggered scatter with radius', radius.toFixed(2));
    }

    update(deltaTime) {
        if (!this.options.enabled) return;
        
        this.time += deltaTime;
        
        // Auto-morph logic
        if (this.options.autoMorph && this.time >= this.nextMorphTime) {
            // Dynamic morph interval based on audio activity
            let interval = this.options.morphInterval;
            
            // Morph faster during active audio
            if (this.overallLevel > 0.2) {
                interval *= (1 - this.overallLevel * 0.6);
            }
            
            this.morphToNextSolid();
            this.nextMorphTime = this.time + interval;
        }
        
        // Audio-triggered morphs for high intensity spikes
        if (this.overallLevel > 0.7 && this.bassLevel > 0.6) {
            // Random chance for beat-synced morphs
            if (Math.random() < 0.1) {
                this.morphToNextSolid();
                this.nextMorphTime = this.time + 2.0; // Prevent rapid triggers
            }
        }
        
        // Update the morph engine with audio intensity
        this.morph.update(deltaTime, this.time, this.overallLevel);
    }

    // Control methods
    setEnabled(enabled) {
        this.options.enabled = enabled;
        this.morph.setVisible(enabled);
    }

    setMorphSpeed(speed) {
        this.options.morphSpeed = Math.max(0.1, Math.min(3.0, speed));
    }

    setColorHue(hue) {
        this.options.colorHue = hue % 360;
        this.morph.setColor(this._getColor());
    }

    setAutoMorph(enabled) {
        this.options.autoMorph = enabled;
        if (enabled && this.nextMorphTime < this.time) {
            this.nextMorphTime = this.time + this.options.morphInterval;
        }
    }

    setMorphInterval(interval) {
        this.options.morphInterval = Math.max(2.0, Math.min(30.0, interval));
    }

    // Manual solid selection
    morphToSolid(solidName) {
        if (!this.geometries[solidName]) {
            console.warn('[ThinkingMeshV3] Unknown solid:', solidName);
            return;
        }
        
        const index = this.solidQueue.indexOf(solidName);
        if (index >= 0) {
            this.currentSolidIndex = index;
        }
        
        this.morph.morphToGeometry(this.geometries[solidName]);
        console.log('[ThinkingMeshV3] Manual morph to', solidName);
    }

    // Getters
    get currentSolid() {
        return this.solidQueue[this.currentSolidIndex];
    }

    get isMorphing() {
        return this.morph.isMorphing;
    }

    get morphProgress() {
        return this.morph.progress;
    }

    get audioLevels() {
        return {
            bass: this.bassLevel,
            mid: this.midLevel,
            treble: this.trebleLevel,
            overall: this.overallLevel
        };
    }

    // Cleanup
    dispose() {
        if (this.morph) {
            this.morph.setVisible(false);
        }
        
        // Dispose geometries
        Object.values(this.geometries).forEach(geo => {
            if (geo.dispose) geo.dispose();
        });
        
        console.log('[ThinkingMeshV3] Disposed');
    }
}

window.ThinkingMeshV3 = ThinkingMeshV3;