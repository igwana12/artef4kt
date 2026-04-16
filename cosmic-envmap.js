/**
 * CosmicEnvMap — Dynamic Environment Map System
 *
 * Loads nano-banana generated images as equirectangular environment maps
 * and crossfades between them based on audio energy levels.
 *
 * States:
 *   idle     → dark sphere, sacred geometry, calm (energy < 0.2)
 *   active   → metaball liquid metal, cyan highlights (energy 0.2-0.5)
 *   excited  → Venom symbiote splatter, tendrils (energy 0.5-0.8)
 *   storm    → nebula clouds, lightning, purple/cyan (energy 0.8-1.2)
 *   supernova → full explosion, white-hot core, shockwaves (energy > 1.2)
 *
 * Also sets the scene background to the cosmic image for the nebula/storm feel.
 */

class CosmicEnvMap {
    constructor(visualizer) {
        this.visualizer = visualizer;
        this.scene = visualizer.scene;
        this.renderer = visualizer.renderer;

        this.active = false;
        this.smoothedEnergy = 0;
        this.currentStateIdx = 0;
        this.transitionProgress = 0;

        // State definitions (ordered by energy threshold)
        this.states = [
            { name: 'idle',      file: 'images/envmaps/idle.jpg',      threshold: 0 },
            { name: 'active',    file: 'images/envmaps/active.jpg',    threshold: 0.2 },
            { name: 'cosmic',    file: 'images/envmaps/cosmic.jpg',    threshold: 0.5 },
            { name: 'excited',   file: 'images/envmaps/excited.jpg',   threshold: 0.8 },
            { name: 'storm',     file: 'images/envmaps/storm.jpg',     threshold: 1.2 },
            { name: 'supernova', file: 'images/envmaps/supernova.jpg', threshold: 1.8 },
        ];

        // Loaded textures
        this.envTextures = [];
        this.bgTextures = [];
        this.pmremGenerator = null;
        this.loaded = false;

        // Parameters
        this.params = {
            envIntensity: 2.0,       // Environment map reflection intensity
            bgOpacity: 0.3,          // Background image opacity (0=black, 1=full image)
            transitionSpeed: 0.08,   // How fast states blend
            colorTint: true,         // Tint material color based on state
            pulseWithBass: true,     // Pulse envMapIntensity with bass
            bassIntensityMult: 1.5,  // Bass → envMap intensity multiplier
        };

        this._loadTextures();
    }

    _loadTextures() {
        const loader = new THREE.TextureLoader();
        let loadCount = 0;
        const total = this.states.length;

        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();

        for (let i = 0; i < this.states.length; i++) {
            const state = this.states[i];
            loader.load(state.file, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.encoding = THREE.sRGBEncoding;

                // Generate PMREM environment map for reflections
                const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                this.envTextures[i] = envMap;

                // Also keep original for background use
                this.bgTextures[i] = texture;

                loadCount++;
                console.log(`🌌 Loaded envmap: ${state.name} (${loadCount}/${total})`);

                if (loadCount === total) {
                    this.loaded = true;
                    console.log('🌌 All cosmic environment maps loaded');
                    // Apply initial state
                    if (this.active) this._applyState(0);
                }
            }, undefined, (err) => {
                console.warn(`Failed to load envmap: ${state.file}`, err);
                loadCount++;
            });
        }
    }

    activate() {
        this.active = true;
        if (this.loaded) {
            this._applyState(0);
        }

        // Hide the artef4kt environment sphere
        if (this.visualizer.envSphere) {
            this.visualizer.envSphere.visible = false;
        }
        if (this.visualizer.envMaterial) {
            this.visualizer.envMaterial.visible = false;
        }

        // Set renderer background to black
        this.renderer.setClearColor(0x000000, 1);

        console.log('🌌 CosmicEnvMap activated');
    }

    deactivate() {
        this.active = false;

        // Restore original environment
        if (this.visualizer.envSphere) {
            this.visualizer.envSphere.visible = true;
        }

        // Remove envMap from materials
        if (this.visualizer.ferrofluid) {
            this.visualizer.ferrofluid.material.envMap = null;
            this.visualizer.ferrofluid.material.needsUpdate = true;
        }

        // Clear scene background
        this.scene.background = null;

        console.log('🌌 CosmicEnvMap deactivated');
    }

    toggle() {
        if (this.active) this.deactivate();
        else this.activate();
        return this.active;
    }

    _applyState(stateIdx) {
        if (!this.loaded || stateIdx >= this.envTextures.length) return;
        if (!this.envTextures[stateIdx]) return;

        const envMap = this.envTextures[stateIdx];

        // Apply to main ferrofluid
        if (this.visualizer.ferrofluid && this.visualizer.ferrofluid.material) {
            const mat = this.visualizer.ferrofluid.material;
            mat.envMap = envMap;
            mat.envMapIntensity = this.params.envIntensity;
            mat.needsUpdate = true;
        }

        // Apply to floating blob material
        if (this.visualizer.floatingBlobMaterial) {
            this.visualizer.floatingBlobMaterial.envMap = envMap;
            this.visualizer.floatingBlobMaterial.envMapIntensity = this.params.envIntensity * 0.7;
            this.visualizer.floatingBlobMaterial.needsUpdate = true;
        }

        // Set scene background (dimmed) for nebula/storm atmosphere
        if (this.params.bgOpacity > 0 && this.bgTextures[stateIdx]) {
            this.scene.background = this.envTextures[stateIdx];
        } else {
            this.scene.background = null;
        }

        this.currentStateIdx = stateIdx;
    }

    update(deltaTime) {
        if (!this.active || !this.loaded) return;

        // Get audio energy
        const bass = this.visualizer.bassIntensity || 0;
        const mid = this.visualizer.midIntensity || 0;
        const high = this.visualizer.highIntensity || 0;
        const total = bass + mid + high;

        // Smooth energy
        this.smoothedEnergy += (total - this.smoothedEnergy) * 0.1;

        // Determine target state based on energy
        let targetState = 0;
        for (let i = this.states.length - 1; i >= 0; i--) {
            if (this.smoothedEnergy >= this.states[i].threshold) {
                targetState = i;
                break;
            }
        }

        // Transition to new state
        if (targetState !== this.currentStateIdx) {
            this.transitionProgress += this.params.transitionSpeed;
            if (this.transitionProgress >= 1.0) {
                this.transitionProgress = 0;
                this._applyState(targetState);
            }
        }

        // Pulse envMapIntensity with bass
        if (this.params.pulseWithBass && this.visualizer.ferrofluid) {
            const mat = this.visualizer.ferrofluid.material;
            const bassPulse = 1 + bass * this.params.bassIntensityMult;
            mat.envMapIntensity = this.params.envIntensity * bassPulse;
        }

        // Color tinting based on state
        if (this.params.colorTint && this.visualizer.ferrofluid) {
            const mat = this.visualizer.ferrofluid.material;
            const energy = this.smoothedEnergy;

            // indigo(rest) → cyan(speaking) → white(peak) → gold(aftermath)
            if (energy < 0.2) {
                // Dark rest state
                mat.color.setRGB(0.08, 0.06, 0.12); // Dark indigo
            } else if (energy < 0.5) {
                // Cyan transmission
                const t = (energy - 0.2) / 0.3;
                mat.color.setRGB(
                    0.08 + t * 0.02,
                    0.06 + t * 0.15,
                    0.12 + t * 0.15
                );
            } else if (energy < 1.0) {
                // Brightening toward white
                const t = (energy - 0.5) / 0.5;
                mat.color.setRGB(
                    0.1 + t * 0.25,
                    0.21 + t * 0.2,
                    0.27 + t * 0.15
                );
            } else {
                // Gold aftermath
                const t = Math.min(1, (energy - 1.0) / 0.5);
                mat.color.setRGB(
                    0.35 + t * 0.3,
                    0.41 - t * 0.1,
                    0.42 - t * 0.2
                );
            }
        }
    }

    // Parameter API
    setParam(key, value) { if (key in this.params) this.params[key] = value; }
    getParam(key) { return this.params[key]; }

    dispose() {
        for (const tex of this.envTextures) { if (tex) tex.dispose(); }
        for (const tex of this.bgTextures) { if (tex) tex.dispose(); }
        if (this.pmremGenerator) this.pmremGenerator.dispose();
    }
}
