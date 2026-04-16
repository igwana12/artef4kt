/**
 * LiquidBlob — MarchingCubes Metaball System
 *
 * Replaces the static SphereGeometry ferrofluid with true liquid physics.
 * Multiple metaballs merge/split/flow driven by audio, creating the
 * Venom-symbiote / chewing-gum / living-organism aesthetic.
 *
 * States: WHISPER → PULSE → STORM → SUPERNOVA → AFTERGLOW
 *
 * Hooks into FerrofluidVisualizer via:
 *   - this.visualizer.bassIntensity / midIntensity / highIntensity
 *   - this.visualizer.isPlaying
 *   - this.visualizer.noise3D(x, y, z)
 *
 * The existing ferrofluid mesh + inner core are hidden when this is active.
 * All existing layers (particles, HUD, cosmic entity) remain untouched.
 */

// ═══════════════════════════════════════════════════════════
// FACE EMITTER SYSTEM — particles emanating from face features
// Smoke from nostrils, light from eyes, water from mouth, bubbles from surface
// Each god can have a different element palette
// ═══════════════════════════════════════════════════════════

class FaceEmitterSystem {
    constructor(scene, parentBlob) {
        this.scene = scene;
        this.parentBlob = parentBlob;
        this.particles = [];
        this.maxParticles = 200;
        this.time = 0;

        // Emitter anchor points (relative to face center, in blob local coords)
        // These match the procedural face SDF feature positions
        this.anchors = {
            leftEye:   { pos: [-0.28, 0.12, -0.65], element: 'light', rate: 0.3 },
            rightEye:  { pos: [0.28, 0.12, -0.65],  element: 'light', rate: 0.3 },
            leftNostril:  { pos: [-0.06, -0.05, -0.85], element: 'smoke', rate: 0.5 },
            rightNostril: { pos: [0.06, -0.05, -0.85],  element: 'smoke', rate: 0.5 },
            mouth:     { pos: [0, -0.25, -0.6],     element: 'water', rate: 0.4 },
            crown:     { pos: [0, 0.55, 0],          element: 'bubbles', rate: 0.2 },
        };

        // Element visual configs
        this.elements = {
            light: {
                color: 0x44ddff,   // Cyan glow
                emissive: 0x22aacc,
                size: [0.02, 0.06],
                speed: [1.5, 3.0],
                life: [0.4, 0.8],
                gravity: 0.2,      // Rises slightly
                spread: 0.3,
            },
            smoke: {
                color: 0x222233,   // Dark smoke
                emissive: 0x111122,
                size: [0.03, 0.08],
                speed: [0.5, 1.5],
                life: [0.8, 1.5],
                gravity: -0.1,     // Rises
                spread: 0.5,
            },
            water: {
                color: 0x2244aa,   // Deep blue
                emissive: 0x112255,
                size: [0.015, 0.04],
                speed: [1.0, 2.5],
                life: [0.5, 1.0],
                gravity: 0.8,      // Falls
                spread: 0.6,
            },
            bubbles: {
                color: 0x88aaff,   // Light blue translucent
                emissive: 0x4466cc,
                size: [0.01, 0.03],
                speed: [0.3, 1.0],
                life: [1.0, 2.0],
                gravity: -0.3,     // Floats up
                spread: 0.8,
            },
        };

        // Shared geometry + materials (instanced rendering)
        this._meshPool = [];
        this._geo = new THREE.SphereGeometry(1, 6, 6); // Unit sphere, scaled per particle
        this._materials = {};
        for (const [name, cfg] of Object.entries(this.elements)) {
            this._materials[name] = new THREE.MeshBasicMaterial({
                color: cfg.color,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
        }
    }

    update(dt, audioInfluence, melt, faceBlend) {
        this.time += dt;

        // Only emit when face is partially visible
        if (faceBlend < 0.2) {
            this._fadeAll(dt);
            return;
        }

        const excitement = Math.min(1, audioInfluence * 2);
        const blobPos = this.parentBlob.mcMesh ? this.parentBlob.mcMesh.position : new THREE.Vector3();
        const blobScale = this.parentBlob.params.baseSize;

        // Spawn particles from each anchor
        for (const [name, anchor] of Object.entries(this.anchors)) {
            const cfg = this.elements[anchor.element];
            const spawnRate = anchor.rate * (0.3 + excitement * 1.5) * faceBlend;

            if (Math.random() < spawnRate * dt * 60 && this.particles.length < this.maxParticles) {
                const spread = cfg.spread * (0.5 + excitement * 0.5);
                const speed = cfg.speed[0] + Math.random() * (cfg.speed[1] - cfg.speed[0]);
                const size = cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]);
                const life = cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]);

                // Spawn position: anchor point scaled to blob size + parent position
                const px = blobPos.x + anchor.pos[0] * blobScale;
                const py = blobPos.y + anchor.pos[1] * blobScale;
                const pz = blobPos.z + anchor.pos[2] * blobScale;

                // Velocity: outward from face + spread + element gravity
                const dirX = anchor.pos[0] * 0.5 + (Math.random() - 0.5) * spread;
                const dirY = anchor.pos[1] * 0.3 + (Math.random() - 0.5) * spread - cfg.gravity * 0.5;
                const dirZ = anchor.pos[2] * 0.8 + (Math.random() - 0.5) * spread; // Forward bias

                // Get or create mesh
                let mesh;
                if (this._meshPool.length > 0) {
                    mesh = this._meshPool.pop();
                    mesh.visible = true;
                } else {
                    mesh = new THREE.Mesh(this._geo, this._materials[anchor.element]);
                    this.scene.add(mesh);
                }

                mesh.material = this._materials[anchor.element];
                mesh.position.set(px, py, pz);
                mesh.scale.setScalar(size * blobScale);

                this.particles.push({
                    mesh,
                    vx: dirX * speed, vy: dirY * speed, vz: dirZ * speed,
                    life, maxLife: life,
                    size: size * blobScale,
                    gravity: cfg.gravity,
                    element: anchor.element,
                });
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;

            if (p.life <= 0) {
                p.mesh.visible = false;
                this._meshPool.push(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            // Physics
            p.vy -= p.gravity * dt;
            p.vx *= 0.98; p.vy *= 0.98; p.vz *= 0.98; // Air resistance
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;

            // Fade + shrink as life decays
            const lifeFrac = p.life / p.maxLife;
            p.mesh.material.opacity = lifeFrac * 0.7;
            p.mesh.scale.setScalar(p.size * (0.5 + lifeFrac * 0.5));

            // Bubbles wobble
            if (p.element === 'bubbles') {
                p.mesh.position.x += Math.sin(this.time * 8 + i) * 0.01;
                p.mesh.position.z += Math.cos(this.time * 6 + i * 1.3) * 0.01;
            }

            // Smoke expands
            if (p.element === 'smoke') {
                p.mesh.scale.setScalar(p.size * (0.5 + (1 - lifeFrac) * 1.5));
            }
        }
    }

    _fadeAll(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * 2; // Fast fade when face is hidden
            if (p.life <= 0) {
                p.mesh.visible = false;
                this._meshPool.push(p.mesh);
                this.particles.splice(i, 1);
            } else {
                p.mesh.material.opacity = (p.life / p.maxLife) * 0.5;
            }
        }
    }

    /**
     * Set the element palette for a specific god.
     * @param {object} palette - Maps anchor names to element types
     * Example: { leftEye: 'fire', rightEye: 'fire', mouth: 'water', crown: 'smoke' }
     */
    setGodPalette(palette) {
        for (const [anchorName, element] of Object.entries(palette)) {
            if (this.anchors[anchorName] && this.elements[element]) {
                this.anchors[anchorName].element = element;
            }
        }
    }

    dispose() {
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
        }
        for (const m of this._meshPool) {
            this.scene.remove(m);
        }
        this._geo.dispose();
        for (const mat of Object.values(this._materials)) mat.dispose();
    }
}

class LiquidBlob {
    constructor(visualizer) {
        this.visualizer = visualizer;
        this.scene = visualizer.scene;
        this.active = false;
        this.time = 0;

        // ═══ ADJUSTABLE PARAMETERS ═══
        this.params = {
            // Metaball geometry
            resolution: 48,            // MarchingCubes grid (32=fast, 64=smooth, 48=balanced)
            blobCount: 14,             // More sub-bodies for richer liquid breakup
            baseSize: 3.0,             // Scale to match main ferrofluid sphere (radius 3.0)
            isolation: 80,             // Isosurface threshold

            // Liquid physics
            viscosity: 0.7,            // Movement damping (0=water, 1=honey)
            surfaceTension: 0.4,       // Smooth-min k value — how much shapes merge (lower=more blobby)
            fluidity: 0.8,             // How easily it deforms
            splashiness: 1.2,          // Audio reaction intensity
            cohesion: 0.5,             // How much it wants to stay round
            turbulence: 0.4,           // Internal chaos / curl noise
            gravity: 0.05,             // Settling behavior

            // Audio reactivity
            sensitivity: 1.8,          // Global audio multiplier
            bassInfluence: 0.8,        // Bass → blob orbit radius
            midInfluence: 1.2,         // Mid → tendril extension
            highInfluence: 1.1,        // High → spike/splash generation

            // Tendril / Venom behavior
            tendrilStrength: 0.6,      // How far tendrils extend
            tendrilSpeed: 2.0,         // Tendril animation speed
            tendrilCount: 4,           // Max tendrils on excitement
            elasticity: 0.85,          // Chewing-gum stretch factor

            // Visual
            metalness: 0.9,
            roughness: 0.1,
            clearcoat: 0.8,
            envMapIntensity: 1.5,
        };

        // ─── Internal state ───
        this.blobs = [];              // Array of metaball objects {pos, vel, radius, baseRadius, phase}
        this.tendrils = [];           // Active tendrils stretching between blobs
        this.splashParticles = [];    // Temporary splash blobs
        this.smoothedEnergy = 0;
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedHigh = 0;
        this.onsetFlash = 0;
        this.excitementLevel = 0;     // 0=whisper, 1=supernova

        // MarchingCubes mesh
        this.mcMesh = null;
        this.mcMaterial = null;

        // Field evaluation buffer (for the isosurface)
        this.fieldSize = this.params.resolution;
        this.field = null;

        this._initMarchingCubes();
        this._initBlobs();

        // Face emitter system — particles from eyes, mouth, nostrils, crown
        this.faceEmitters = new FaceEmitterSystem(this.scene, this);

        console.log('🫧 LiquidBlob system initialized (with face emitters)');
    }

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    _initMarchingCubes() {
        const p = this.params;
        const size = p.resolution;

        // Material matching the main ferrofluid's dark chrome aesthetic
        this.mcMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x222222,           // Match original ferrofluid color exactly
            metalness: 0.9,
            roughness: 0.1,
            reflectivity: 0.8,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2,
            envMapIntensity: 1.5,
        });

        // We'll build the isosurface geometry manually each frame
        // using a simple MarchingCubes implementation
        this.field = new Float32Array(size * size * size);

        // Create initial geometry (will be rebuilt each frame)
        const geometry = new THREE.BufferGeometry();
        // Pre-allocate buffers for max possible triangles
        // MC can generate at most 5 triangles per cell, 3 verts each, 3 floats each
        const maxVerts = size * size * size * 5 * 3 * 3;
        this.vertexBuffer = new Float32Array(Math.min(maxVerts, 500000 * 3)); // Cap at 500k verts
        this.normalBuffer = new Float32Array(this.vertexBuffer.length);
        this.vertCount = 0;

        geometry.setAttribute('position', new THREE.BufferAttribute(this.vertexBuffer, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(this.normalBuffer, 3));

        this.mcMesh = new THREE.Mesh(geometry, this.mcMaterial);
        this.mcMesh.castShadow = true;
        this.mcMesh.receiveShadow = true;
        this.mcMesh.visible = false;
        this.mcMesh.frustumCulled = false;
        this.scene.add(this.mcMesh);
    }

    _initBlobs() {
        const p = this.params;
        this.blobs = [];

        // ═══ CORE A — bass-dominant, larger, central ═══
        this.blobs.push({
            pos: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(0, 0, 0),
            radius: 0.6,
            baseRadius: 0.6,
            phase: 0,
            isCore: true,
            coreGroup: 'bass',  // Responds primarily to bass
        });

        // Sub-blobs orbiting Core A
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            this.blobs.push({
                pos: new THREE.Vector3(Math.cos(angle) * 0.4, (Math.random() - 0.5) * 0.3, Math.sin(angle) * 0.4),
                vel: new THREE.Vector3(0, 0, 0),
                radius: 0.15 + Math.random() * 0.1,
                baseRadius: 0.15 + Math.random() * 0.1,
                phase: Math.random() * Math.PI * 2,
                orbitSpeed: 0.3 + Math.random() * 0.5,
                orbitRadius: 0.25 + Math.random() * 0.3,
                orbitTilt: (Math.random() - 0.5) * 0.8,
                noiseOffset: Math.random() * 100,
                parentCore: 'bass',
            });
        }

        // ═══ CORE B — mid/high-dominant, smaller, orbits behind ═══
        this.blobs.push({
            pos: new THREE.Vector3(0, 0, 0.6),
            vel: new THREE.Vector3(0, 0, 0),
            radius: 0.4,
            baseRadius: 0.4,
            phase: Math.PI,  // Opposite phase
            isCore: true,
            coreGroup: 'treble',  // Responds primarily to mid + high
            orbitSpeed: 0.15,
            orbitRadius: 0.5,     // How far it orbits from Core A
        });

        // Sub-blobs orbiting Core B
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI * 0.5;
            this.blobs.push({
                pos: new THREE.Vector3(Math.cos(angle) * 0.3 + 0.5, (Math.random() - 0.5) * 0.2, Math.sin(angle) * 0.3),
                vel: new THREE.Vector3(0, 0, 0),
                radius: 0.1 + Math.random() * 0.08,
                baseRadius: 0.1 + Math.random() * 0.08,
                phase: Math.random() * Math.PI * 2,
                orbitSpeed: 0.4 + Math.random() * 0.6,
                orbitRadius: 0.2 + Math.random() * 0.25,
                orbitTilt: (Math.random() - 0.5) * 1.0,
                noiseOffset: Math.random() * 100,
                parentCore: 'treble',
            });
        }
    }

    // ═══════════════════════════════════════════
    // UPDATE LOOP
    // ═══════════════════════════════════════════

    update(deltaTime) {
        if (!this.active) return;

        const dt = Math.min(deltaTime, 0.05);
        this.time += dt;

        // ═══ MC SYSTEM — secondary overlay, only at extreme melt ═══
        // The original vertex-deformed spheres are the primary visual.
        // MC only fades in at very high excitement for amorphous merge/split effects.
        const melt = this.visualizer.meltLevel || 0;
        const mcOpacity = Math.max(0, Math.min(1, (melt - 0.7) / 0.3)); // Only above melt 0.7
        this.mcMaterial.opacity = mcOpacity;
        this.mcMaterial.transparent = mcOpacity < 0.99;
        this.mcMesh.visible = mcOpacity > 0.01;

        // Original spheres stay visible — MC overlays on top at extreme states
        if (this.visualizer.ferrofluid) {
            this.visualizer.ferrofluid.visible = true;
            this.visualizer.ferrofluid.material.transparent = false;
            this.visualizer.ferrofluid.material.opacity = 1.0;
        }
        if (this.visualizer.ferrofluidInner) {
            this.visualizer.ferrofluidInner.visible = true;
        }

        // Don't compute MC field if not visible
        if (mcOpacity < 0.01) {
            // Still update face emitters if active
            const audioInfl = Math.max(0, (this.visualizer.bassIntensity + this.visualizer.midIntensity + this.visualizer.highIntensity));
            if (this.faceEmitters) this.faceEmitters.update(dt, audioInfl, melt, this._coreShapeBlend || 0);
            return;
        }

        // Get audio data
        const bass = (this.visualizer.bassIntensity || 0) * this.params.sensitivity;
        const mid = (this.visualizer.midIntensity || 0) * this.params.sensitivity;
        const high = (this.visualizer.highIntensity || 0) * this.params.sensitivity;
        const total = bass + mid + high;

        // Smooth audio values
        this.smoothedBass += (bass - this.smoothedBass) * 0.15;
        this.smoothedMid += (mid - this.smoothedMid) * 0.12;
        this.smoothedHigh += (high - this.smoothedHigh) * 0.18;
        this.smoothedEnergy += (total - this.smoothedEnergy) * 0.1;

        // Onset detection for flashes
        if (total > this.smoothedEnergy * 1.5 + 0.3) {
            this.onsetFlash = Math.min(1.0, this.onsetFlash + 0.6);
        }
        this.onsetFlash *= 0.9;

        // Excitement level (drives state transitions)
        const targetExcitement = Math.min(1.0, this.smoothedEnergy / 2.0);
        this.excitementLevel += (targetExcitement - this.excitementLevel) * 0.08;

        // Update physics
        this._updateBlobPhysics(dt);
        this._updateSplashes(dt);
        this._updateTendrils(dt);

        // ═══ AUTO-MORPH: at high excitement, face emerges from the liquid ═══
        // When excitement > 0.6 AND melt > 0.5, start morphing toward face
        // This creates the effect of a god's face appearing in the ferrofluid
        if (this.excitementLevel > 0.6 && melt > 0.5 && !this._shapeLockedByUser) {
            const faceTarget = Math.min(1, (this.excitementLevel - 0.6) / 0.3); // 0 at 0.6, 1 at 0.9
            this._coreShape = this._coreShape || 'face';
            if (this._coreShape === 'face') {
                this._coreShapeBlend = Math.min(faceTarget, (this._coreShapeBlend || 0) + 1.5 * dt);
            }
        } else if (!this._shapeLockedByUser) {
            // Morph back to sphere when calming down
            this._coreShapeBlend = Math.max(0, (this._coreShapeBlend || 0) - 0.8 * dt);
            if (this._coreShapeBlend < 0.01) this._coreShape = 'sphere';
        }

        // Rebuild isosurface
        this._evaluateField();
        this._marchCubes();

        // ═══ FACE EMITTERS — particles from face features ═══
        const audioInfl = Math.max(0, total / this.params.sensitivity);
        const faceBlend = this._coreShapeBlend || 0;
        if (this.faceEmitters) {
            this.faceEmitters.update(dt, audioInfl, melt, faceBlend);
        }

        // Sync position with the main ferrofluid blob so they overlap during crossfade
        if (this.visualizer.ferrofluid) {
            this.mcMesh.position.copy(this.visualizer.ferrofluid.position);
        } else {
            const t = this.time;
            const audioInfluence = Math.max(0.15, total / this.params.sensitivity);
            const floatIntensity = 0.3 + audioInfluence * 0.5;
            this.mcMesh.position.y = Math.sin(t * 0.4) * floatIntensity;
            this.mcMesh.position.x = Math.cos(t * 0.35) * (floatIntensity * 0.7);
            this.mcMesh.position.z = Math.sin(t * 0.45) * (floatIntensity * 0.5);
        }
        this.mcMesh.rotation.y += 0.003;
    }

    // ─── BLOB PHYSICS ───

    _updateBlobPhysics(dt) {
        const p = this.params;
        const t = this.time;
        const excitement = this.excitementLevel;
        const noise3D = this.visualizer.noise3D ? this.visualizer.noise3D.bind(this.visualizer) : this._fallbackNoise;

        // Find the two cores for interaction
        const coreA = this.blobs.find(b => b.coreGroup === 'bass');
        const coreB = this.blobs.find(b => b.coreGroup === 'treble');

        for (let i = 0; i < this.blobs.length; i++) {
            const blob = this.blobs[i];

            if (blob.isCore && blob.coreGroup === 'bass') {
                // ═══ CORE A (bass) — stays near center, pulses with bass ═══
                const pulse = 1.0 + this.smoothedBass * p.bassInfluence * 0.5;
                blob.radius = blob.baseRadius * pulse * (1 + this.onsetFlash * 0.3);

                // Gentle wander
                blob.pos.x += (noise3D(t * 0.5, 0, 0) * 0.08 * this.smoothedMid - blob.pos.x * 0.03) * dt * 60;
                blob.pos.y += (noise3D(0, t * 0.4, 0) * 0.08 * this.smoothedMid - blob.pos.y * 0.03) * dt * 60;
                blob.pos.z += (noise3D(0, 0, t * 0.6) * 0.08 * this.smoothedMid - blob.pos.z * 0.03) * dt * 60;

                // Attract toward Core B when audio is quiet (they merge)
                if (coreB) {
                    const dx = coreB.pos.x - blob.pos.x;
                    const dy = coreB.pos.y - blob.pos.y;
                    const dz = coreB.pos.z - blob.pos.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.01;
                    // Quiet = strong pull (merge), loud = weak pull (separate)
                    const mergeForce = 0.02 * (1.0 - excitement * 0.8);
                    blob.pos.x += (dx / dist) * mergeForce * dt * 60;
                    blob.pos.y += (dy / dist) * mergeForce * dt * 60;
                    blob.pos.z += (dz / dist) * mergeForce * dt * 60;
                }
                continue;
            }

            if (blob.isCore && blob.coreGroup === 'treble') {
                // ═══ CORE B (treble) — orbits Core A, pulses with mid+high ═══
                const midHighPulse = 1.0 + (this.smoothedMid * 0.6 + this.smoothedHigh * 0.8);
                blob.radius = blob.baseRadius * midHighPulse * (1 + this.onsetFlash * 0.2);

                // Orbit around Core A — orbit expands with excitement
                blob.phase = (blob.phase || 0) + dt * (blob.orbitSpeed || 0.15) * (1 + excitement * 3);
                const orbitR = (blob.orbitRadius || 0.5) * (0.3 + excitement * 2.0);
                // When quiet: orbitR is tiny → cores merge
                // When excited: orbitR is large → cores separate into two distinct entities

                const coreAPos = coreA ? coreA.pos : new THREE.Vector3(0,0,0);
                const targetX = coreAPos.x + Math.cos(blob.phase) * orbitR;
                const targetY = coreAPos.y + Math.sin(blob.phase * 0.7) * orbitR * 0.5;
                const targetZ = coreAPos.z + Math.sin(blob.phase) * orbitR;

                // Spring toward orbit target
                const springK = 0.8;
                blob.vel.x += (targetX - blob.pos.x) * springK;
                blob.vel.y += (targetY - blob.pos.y) * springK;
                blob.vel.z += (targetZ - blob.pos.z) * springK;

                // Turbulence
                blob.vel.x += noise3D(blob.pos.x * 0.5 + t * 0.3, blob.pos.y * 0.5, blob.pos.z * 0.5) * 0.1 * excitement;
                blob.vel.y += noise3D(blob.pos.x * 0.5, blob.pos.y * 0.5 + t * 0.2, blob.pos.z * 0.5) * 0.1 * excitement;
                blob.vel.z += noise3D(blob.pos.x * 0.5, blob.pos.y * 0.5, blob.pos.z * 0.5 + t * 0.4) * 0.1 * excitement;

                blob.vel.multiplyScalar(0.85);
                blob.pos.x += blob.vel.x * dt * 60;
                blob.pos.y += blob.vel.y * dt * 60;
                blob.pos.z += blob.vel.z * dt * 60;
                continue;
            }

            // ─── Orbiting blobs — orbit around their parent core ───
            // Find parent core position
            const parent = blob.parentCore === 'treble' ? coreB : coreA;
            const parentPos = parent ? parent.pos : new THREE.Vector3(0,0,0);

            blob.phase += dt * blob.orbitSpeed * (1 + excitement * 2);

            // Target orbit position (relative to parent core, expands with excitement)
            const orbitR = blob.orbitRadius * (1 + excitement * 1.5 + this.smoothedBass * p.bassInfluence);
            const targetX = parentPos.x + Math.cos(blob.phase) * orbitR;
            const targetY = parentPos.y + Math.sin(blob.phase * 0.7 + blob.orbitTilt) * orbitR * 0.6;
            const targetZ = parentPos.z + Math.sin(blob.phase) * orbitR;

            // Turbulence (curl noise)
            const turbScale = p.turbulence * (0.5 + excitement * 1.5);
            const nx = noise3D(blob.pos.x * 0.8 + t * 0.3, blob.pos.y * 0.8, blob.pos.z * 0.8) * turbScale;
            const ny = noise3D(blob.pos.x * 0.8, blob.pos.y * 0.8 + t * 0.2, blob.pos.z * 0.8) * turbScale;
            const nz = noise3D(blob.pos.x * 0.8, blob.pos.y * 0.8, blob.pos.z * 0.8 + t * 0.4) * turbScale;

            // Spring force toward orbit target
            const springK = p.cohesion * (1.5 - excitement * 0.8);
            blob.vel.x += (targetX - blob.pos.x) * springK + nx;
            blob.vel.y += (targetY - blob.pos.y) * springK + ny;
            blob.vel.z += (targetZ - blob.pos.z) * springK + nz;

            // Gravity
            blob.vel.y -= p.gravity * (1 - excitement * 0.5);

            // Onset burst: push blobs outward
            if (this.onsetFlash > 0.3) {
                const dist = blob.pos.length() || 0.01;
                const burstForce = this.onsetFlash * p.splashiness * 0.3;
                blob.vel.x += (blob.pos.x / dist) * burstForce;
                blob.vel.y += (blob.pos.y / dist) * burstForce;
                blob.vel.z += (blob.pos.z / dist) * burstForce;

                // Spawn splash on strong onsets
                if (this.onsetFlash > 0.3 && this.splashParticles.length < 20) {
                    this._spawnSplash(blob.pos, blob.vel);
                }
            }

            // Damping (viscosity)
            const damp = p.viscosity + (1 - p.viscosity) * excitement * 0.3;
            blob.vel.multiplyScalar(damp);

            // Integrate
            blob.pos.x += blob.vel.x * dt * 60;
            blob.pos.y += blob.vel.y * dt * 60;
            blob.pos.z += blob.vel.z * dt * 60;

            // Radius: pulses with audio + excitement
            const audioPulse = 1 + this.smoothedMid * p.midInfluence * 0.3 + this.onsetFlash * 0.2;
            blob.radius = blob.baseRadius * audioPulse * (0.8 + excitement * 0.6);
        }
    }

    // ─── SPLASHES (temporary blobs on onset) ───

    _spawnSplash(origin, vel) {
        const dir = vel.clone().normalize().multiplyScalar(0.3);
        dir.x += (Math.random() - 0.5) * 0.4;
        dir.y += (Math.random() - 0.5) * 0.4;
        dir.z += (Math.random() - 0.5) * 0.4;

        this.splashParticles.push({
            pos: origin.clone().add(dir),
            vel: dir.multiplyScalar(3),           // Faster ejection
            radius: 0.12 + Math.random() * 0.15,  // Bigger splashes
            life: 1.0,
            decay: 0.3 + Math.random() * 0.3,     // Slower decay — persists longer
        });
    }

    _updateSplashes(dt) {
        for (let i = this.splashParticles.length - 1; i >= 0; i--) {
            const sp = this.splashParticles[i];
            sp.life -= dt * sp.decay;

            if (sp.life <= 0) {
                this.splashParticles.splice(i, 1);
                continue;
            }

            // Pull back toward center (surface tension)
            const dist = sp.pos.length() || 0.01;
            const pull = 0.5 * (1 - sp.life); // Stronger pull as life decreases
            sp.vel.x -= (sp.pos.x / dist) * pull * dt * 60;
            sp.vel.y -= (sp.pos.y / dist) * pull * dt * 60;
            sp.vel.z -= (sp.pos.z / dist) * pull * dt * 60;

            sp.vel.multiplyScalar(0.95);
            sp.pos.x += sp.vel.x * dt * 60;
            sp.pos.y += sp.vel.y * dt * 60;
            sp.pos.z += sp.vel.z * dt * 60;

            sp.radius *= (0.98 + sp.life * 0.02); // Shrink as life fades
        }
    }

    // ─── TENDRILS (Venom-like stretchy connections) ───

    _updateTendrils(dt) {
        const excitement = this.excitementLevel;
        const p = this.params;

        // Only generate tendrils at higher excitement
        if (excitement < 0.3) {
            this.tendrils = [];
            return;
        }

        // Tendrils are virtual — they're extra metaballs placed between
        // separating blobs to create the "chewing gum stretch" effect
        this.tendrils = [];

        const maxTendrils = Math.floor(p.tendrilCount * excitement);
        let tendrilIdx = 0;

        for (let i = 0; i < this.blobs.length && tendrilIdx < maxTendrils; i++) {
            for (let j = i + 1; j < this.blobs.length && tendrilIdx < maxTendrils; j++) {
                const a = this.blobs[i];
                const b = this.blobs[j];
                const dist = a.pos.distanceTo(b.pos);
                const mergeThreshold = (a.radius + b.radius) * 2.5 * p.elasticity;

                // Create tendril between blobs that are stretching apart
                if (dist > (a.radius + b.radius) * 1.2 && dist < mergeThreshold) {
                    const stretchFactor = dist / mergeThreshold;
                    const tendrilRadius = Math.min(a.radius, b.radius) * 0.4 * (1 - stretchFactor);

                    if (tendrilRadius > 0.02) {
                        // Place 2-3 small blobs along the connection
                        const steps = 2 + Math.floor(excitement * 2);
                        for (let s = 1; s <= steps; s++) {
                            const f = s / (steps + 1);
                            const wobble = this._fallbackNoise(
                                this.time * p.tendrilSpeed + i * 10 + s * 5, 0, 0
                            ) * 0.1 * excitement;

                            this.tendrils.push({
                                pos: new THREE.Vector3(
                                    a.pos.x + (b.pos.x - a.pos.x) * f + wobble,
                                    a.pos.y + (b.pos.y - a.pos.y) * f + wobble * 0.5,
                                    a.pos.z + (b.pos.z - a.pos.z) * f + wobble
                                ),
                                radius: tendrilRadius * (1 - Math.abs(f - 0.5) * 1.5),
                            });
                        }
                        tendrilIdx++;
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════
    // SDF LIBRARY — Pluggable shape functions
    // Each returns a field contribution at point (dx, dy, dz) with radius r
    // Higher value = more inside the shape
    // ═══════════════════════════════════════════

    static SDF = {
        // Classic metaball sphere — the default
        sphere(dx, dy, dz, r) {
            const distSq = dx * dx + dy * dy + dz * dz;
            return (r * r) / (distSq + 0.0001);
        },

        // Torus — ring shape, great for the Arrival logogram look
        torus(dx, dy, dz, r) {
            const R = r * 1.2;       // Major radius (ring center distance)
            const rr = r * 0.35;     // Minor radius (tube thickness)
            const qx = Math.sqrt(dx * dx + dz * dz) - R;
            const distSq = qx * qx + dy * dy;
            return (rr * rr) / (distSq + 0.0001);
        },

        // Cube — blocky crystalline shape
        cube(dx, dy, dz, r) {
            const s = r * 0.8; // Half-size
            const qx = Math.abs(dx) - s;
            const qy = Math.abs(dy) - s;
            const qz = Math.abs(dz) - s;
            const outside = Math.sqrt(
                Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2
            );
            const inside = Math.min(Math.max(qx, qy, qz), 0);
            const dist = outside + inside;
            return (r * r * 0.3) / (dist * dist + 0.0001);
        },

        // Star / spiky — organic sea urchin shape
        star(dx, dy, dz, r) {
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // Modulate radius with angular spikes
            const theta = Math.atan2(dz, dx);
            const phi = Math.acos(dy / (dist + 0.0001));
            const spikes = 0.7 + 0.3 * (
                Math.sin(theta * 5) * Math.sin(phi * 4) +
                Math.sin(theta * 3 + 1.5) * Math.cos(phi * 6) * 0.5
            );
            const effR = r * spikes;
            return (effR * effR) / (dist * dist + 0.0001);
        },

        // Organic noise — amorphous blobby shape that never repeats
        organic(dx, dy, dz, r, time) {
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // Noise-modulated radius for truly organic shape
            const nx = dx * 2.0 + time * 0.3;
            const ny = dy * 2.0 + time * 0.25;
            const nz = dz * 2.0 + time * 0.35;
            // Simple noise approximation (no dependency on external noise fn)
            const noise = (
                Math.sin(nx * 0.7) * Math.cos(ny * 0.9) * Math.sin(nz * 0.8) +
                Math.sin(nx * 1.3 + 2.1) * Math.cos(ny * 1.1 + 1.3) * 0.5
            ) / 1.5;
            const effR = r * (0.7 + noise * 0.5);
            return (effR * effR) / (dist * dist + 0.0001);
        },

        // Flat disc — pancake shape, useful for splatter states
        disc(dx, dy, dz, r) {
            const radialDist = Math.sqrt(dx * dx + dz * dz);
            const verticalDist = Math.abs(dy);
            const rr = r * 0.2; // Thin disc
            const qr = radialDist - r * 0.9;
            const dist = Math.sqrt(Math.max(qr, 0) ** 2 + verticalDist ** 2);
            return (rr * rr) / (dist * dist + 0.0001);
        },

        // Procedural face — a god-like face shape built from SDF primitives
        // Oval head + eye sockets + nose ridge + mouth cavity + brow ridge
        face(dx, dy, dz, r, time) {
            // Head: slightly elongated ellipsoid (taller than wide)
            const headW = r * 0.85;   // Width
            const headH = r * 1.1;    // Height (taller)
            const headD = r * 0.8;    // Depth (slightly flat)
            const headDistSq = (dx/headW)**2 + (dy/headH)**2 + (dz/headD)**2;
            let val = (r * r * 0.4) / (headDistSq + 0.001);

            // Brow ridge — horizontal torus across the upper face
            const browY = r * 0.25;
            const browDy = dy - browY;
            const browRadial = Math.sqrt(dx * dx + (dz + r * 0.3) ** 2); // Offset forward
            const browR = r * 0.6; // How wide the brow spans
            const browThick = r * 0.08;
            const browQr = browRadial - browR;
            const browDist = Math.sqrt(browQr * browQr + browDy * browDy);
            if (browDist < browThick * 4) {
                val += (browThick * browThick) / (browDist * browDist + 0.001) * 0.3;
            }

            // Eye sockets — two negative spheres (subtract from field)
            const eyeSpacing = r * 0.28;
            const eyeY = r * 0.12;
            const eyeZ = -r * 0.65; // Forward
            const eyeR = r * 0.12;
            for (const side of [-1, 1]) {
                const edx = dx - eyeSpacing * side;
                const edy = dy - eyeY;
                const edz = dz - eyeZ;
                const eyeDistSq = edx * edx + edy * edy + edz * edz;
                // Subtract to create cavity
                val -= (eyeR * eyeR * 0.8) / (eyeDistSq + 0.002);
            }

            // Nose ridge — small elongated bump
            const noseX = dx;
            const noseY = dy + r * 0.05; // Slightly below center
            const noseZ = dz + r * 0.85; // Protruding forward
            const noseDistSq = (noseX / (r * 0.08))**2 + (noseY / (r * 0.2))**2 + ((noseZ) / (r * 0.15))**2;
            if (noseDistSq < 16) {
                val += (r * r * 0.02) / (noseDistSq + 0.01);
            }

            // Mouth — horizontal negative ellipsoid
            const mouthY = -r * 0.25;
            const mouthZ = -r * 0.6;
            const mouthW = r * 0.2, mouthH = r * 0.06, mouthD = r * 0.1;
            const mouthDistSq = (dx/mouthW)**2 + ((dy - mouthY)/mouthH)**2 + ((dz - mouthZ)/mouthD)**2;
            if (mouthDistSq < 16) {
                val -= (r * r * 0.03) / (mouthDistSq + 0.01);
            }

            // Cheekbones — two subtle bumps
            for (const side of [-1, 1]) {
                const cheekX = dx - r * 0.35 * side;
                const cheekY = dy + r * 0.02;
                const cheekZ = dz + r * 0.5;
                const cheekDistSq = cheekX * cheekX + cheekY * cheekY + cheekZ * cheekZ;
                val += (r * r * 0.015) / (cheekDistSq + 0.01);
            }

            return Math.max(0, val);
        },

        // Mesh SDF sampler — for pre-baked 3D SDF textures loaded from file
        // Set liquidBlob._meshSDFData, _meshSDFSize, _meshSDFScale to use
        meshSDF(dx, dy, dz, r, time, sdfData, sdfSize, sdfScale) {
            if (!sdfData) return LiquidBlob.SDF.sphere(dx, dy, dz, r);

            // Map world coords to grid coords
            const halfScale = sdfScale * 0.5;
            const gx = ((dx / halfScale) * 0.5 + 0.5) * (sdfSize - 1);
            const gy = ((dy / halfScale) * 0.5 + 0.5) * (sdfSize - 1);
            const gz = ((dz / halfScale) * 0.5 + 0.5) * (sdfSize - 1);

            // Bounds check
            if (gx < 0 || gx >= sdfSize - 1 || gy < 0 || gy >= sdfSize - 1 || gz < 0 || gz >= sdfSize - 1) {
                return 0;
            }

            // Trilinear interpolation
            const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
            const fx = gx - ix, fy = gy - iy, fz = gz - iz;
            const s = sdfSize;
            const idx = (iz * s * s + iy * s + ix);
            const v000 = sdfData[idx] || 0;
            const v100 = sdfData[idx + 1] || 0;
            const v010 = sdfData[idx + s] || 0;
            const v110 = sdfData[idx + s + 1] || 0;
            const v001 = sdfData[idx + s * s] || 0;
            const v101 = sdfData[idx + s * s + 1] || 0;
            const v011 = sdfData[idx + s * s + s] || 0;
            const v111 = sdfData[idx + s * s + s + 1] || 0;

            const dist = v000*(1-fx)*(1-fy)*(1-fz) + v100*fx*(1-fy)*(1-fz) +
                         v010*(1-fx)*fy*(1-fz) + v110*fx*fy*(1-fz) +
                         v001*(1-fx)*(1-fy)*fz + v101*fx*(1-fy)*fz +
                         v011*(1-fx)*fy*fz + v111*fx*fy*fz;

            // Convert SDF distance to metaball-compatible field value
            const rr = r * 0.5;
            return (rr * rr) / (dist * dist + 0.0001);
        },
    };

    // ═══════════════════════════════════════════
    // MARCHING CUBES — Field Evaluation (pluggable SDF)
    // ═══════════════════════════════════════════

    _evaluateField() {
        const size = this.params.resolution;
        const field = this.field;
        const scale = this.params.baseSize * 1.5;
        const invSize = 1.0 / size;
        const time = this.time;

        // Current shape for the core blob — can be set externally via setShape()
        const coreShape = this._coreShape || 'sphere';
        const coreShapeBlend = this._coreShapeBlend || 0; // 0=sphere, 1=target shape
        const targetSDF = LiquidBlob.SDF[coreShape] || LiquidBlob.SDF.sphere;
        const sphereSDF = LiquidBlob.SDF.sphere;

        field.fill(0);

        // Build ball list with SDF functions
        const allBalls = [];

        for (const blob of this.blobs) {
            allBalls.push({
                x: blob.pos.x, y: blob.pos.y, z: blob.pos.z, r: blob.radius,
                sdf: blob.isCore ? null : LiquidBlob.SDF.sphere, // Core uses morph, others use sphere
                isCore: blob.isCore || false,
            });
        }
        for (const sp of this.splashParticles) {
            allBalls.push({ x: sp.pos.x, y: sp.pos.y, z: sp.pos.z, r: sp.radius * sp.life, sdf: LiquidBlob.SDF.sphere });
        }
        for (const t of this.tendrils) {
            allBalls.push({ x: t.pos.x, y: t.pos.y, z: t.pos.z, r: t.radius, sdf: LiquidBlob.SDF.sphere });
        }

        // ═══ FERROFLUID SURFACE DISPLACEMENT — audio-driven spikes, ripples, swells ═══
        // These modulate the field AFTER metaball evaluation to create the magnetic spike effect
        const bass = this.smoothedBass;
        const mid = this.smoothedMid;
        const high = this.smoothedHigh;
        const onset = this.onsetFlash;
        const excitement = this.excitementLevel;

        // Pre-compute spike magnet positions (like the main sphere's dynamic blob centers)
        // High frequencies create sharp spikes at random surface locations
        const spikePositions = [];
        if (high > 0.05) {
            const numSpikes = Math.floor(4 + high * 12 + excitement * 8);
            for (let s = 0; s < numSpikes; s++) {
                const theta = Math.sin(time * 2.8 + s * 1.7) * Math.PI;
                const phi = Math.cos(time * 1.9 + s * 2.3) * Math.PI;
                spikePositions.push({
                    x: Math.sin(phi) * Math.cos(theta) * 0.5,
                    y: Math.cos(phi) * 0.5,
                    z: Math.sin(phi) * Math.sin(theta) * 0.5,
                    strength: high * (0.3 + excitement * 0.5) * (0.6 + Math.random() * 0.8),
                    radius: 0.06 + high * 0.08,  // Thin spikes
                });
            }
        }

        // Evaluate field
        for (let iz = 0; iz < size; iz++) {
            const wz = (iz * invSize - 0.5) * scale * 2;
            for (let iy = 0; iy < size; iy++) {
                const wy = (iy * invSize - 0.5) * scale * 2;
                for (let ix = 0; ix < size; ix++) {
                    const wx = (ix * invSize - 0.5) * scale * 2;

                    let val = 0;
                    for (let b = 0; b < allBalls.length; b++) {
                        const ball = allBalls[b];
                        const dx = wx - ball.x;
                        const dy = wy - ball.y;
                        const dz = wz - ball.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        const rSq = ball.r * ball.r;

                        if (distSq < rSq * 16) {
                            if (ball.isCore && coreShapeBlend > 0.01) {
                                const sphereVal = sphereSDF(dx, dy, dz, ball.r);
                                let targetVal;
                                if (coreShape === 'meshSDF' && this._meshSDFData) {
                                    targetVal = LiquidBlob.SDF.meshSDF(dx, dy, dz, ball.r, time,
                                        this._meshSDFData, this._meshSDFSize, this._meshSDFScale);
                                } else {
                                    targetVal = targetSDF(dx, dy, dz, ball.r, time);
                                }
                                val += sphereVal * (1 - coreShapeBlend) + targetVal * coreShapeBlend;
                            } else if (ball.sdf) {
                                val += ball.sdf(dx, dy, dz, ball.r, time);
                            } else {
                                val += rSq / (distSq + 0.0001);
                            }
                        }
                    }

                    // ═══ FERROFLUID SURFACE EFFECTS (only apply near the surface) ═══
                    if (val > 0.1) {
                        // Bass: broad low-frequency swells — the blob breathes
                        if (bass > 0.03) {
                            const bassSwell = this._fallbackNoise(
                                wx * 0.8 + time * 0.3, wy * 0.8 + time * 0.25, wz * 0.8 + time * 0.35
                            ) * bass * 0.15;
                            val += bassSwell;
                        }

                        // Mid: medium ripples across the surface — voice texture
                        if (mid > 0.03) {
                            const midRipple = this._fallbackNoise(
                                wx * 2.5 + time * 1.5, wy * 2.5 + time * 1.2, wz * 2.5 + time * 1.8
                            ) * mid * 0.1;
                            val += midRipple;
                        }

                        // High: sharp ferrofluid spikes — magnetic needle protrusions
                        for (let s = 0; s < spikePositions.length; s++) {
                            const spike = spikePositions[s];
                            const sdx = wx - spike.x;
                            const sdy = wy - spike.y;
                            const sdz = wz - spike.z;
                            const sdist = sdx * sdx + sdy * sdy + sdz * sdz;
                            const sr = spike.radius;
                            if (sdist < sr * sr * 12) {
                                // Sharp Gaussian spike — narrow and tall
                                val += spike.strength * Math.exp(-sdist / (sr * sr));
                            }
                        }

                        // Onset: concentric shockwave ripple expanding outward
                        if (onset > 0.1) {
                            const dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
                            const wave = onset * 0.12 * Math.sin(dist * 15.0 - time * 20.0) * Math.exp(-dist * 0.5);
                            val += wave;
                        }
                    }

                    field[iz * size * size + iy * size + ix] = val;
                }
            }
        }
    }

    // ═══════════════════════════════════════════
    // SHAPE API — switch the core blob's shape
    // ═══════════════════════════════════════════

    /**
     * Set the target shape for the core blob.
     * @param {string} shape - One of: 'sphere', 'torus', 'cube', 'star', 'organic', 'disc', 'face', 'meshSDF'
     * @param {number} blend - 0 = pure sphere, 1 = pure target shape. Animate this for morphing.
     * @param {boolean} lock - If true, prevents auto-morph from overriding this shape
     */
    setShape(shape, blend = 1.0, lock = true) {
        if (LiquidBlob.SDF[shape] || shape === 'meshSDF') {
            this._coreShape = shape;
            this._coreShapeBlend = Math.max(0, Math.min(1, blend));
            this._shapeLockedByUser = lock;
        } else {
            console.warn(`LiquidBlob: unknown shape "${shape}". Available: ${Object.keys(LiquidBlob.SDF).join(', ')}`);
        }
    }

    /** Release the shape lock so auto-morph can take over again */
    unlockShape() {
        this._shapeLockedByUser = false;
    }

    /**
     * Set the element palette for the face emitters.
     * Each god gets different elements from their features.
     * @param {object} palette - Maps anchor names to element types
     * Example for Poseidon: { leftEye: 'water', rightEye: 'water', mouth: 'water', crown: 'bubbles' }
     * Example for Hephaestus: { leftEye: 'light', rightEye: 'light', mouth: 'smoke', crown: 'smoke' }
     */
    setGodElements(palette) {
        if (this.faceEmitters) {
            this.faceEmitters.setGodPalette(palette);
        }
    }

    /**
     * Smoothly morph between current shape and target over time.
     * Call each frame for animated transitions.
     */
    morphToShape(shape, speed = 2.0, deltaTime = 0.016) {
        this._coreShape = shape;
        this._coreShapeBlend = Math.min(1, (this._coreShapeBlend || 0) + speed * deltaTime);
    }

    /**
     * Morph back to sphere.
     */
    morphToSphere(speed = 2.0, deltaTime = 0.016) {
        this._coreShapeBlend = Math.max(0, (this._coreShapeBlend || 0) - speed * deltaTime);
    }

    /** Get available shape names */
    getShapes() { return Object.keys(LiquidBlob.SDF); }

    /**
     * Load a pre-baked SDF from a binary Float32Array file.
     * File format: first 4 bytes = grid size (uint32), then size³ float32 values.
     * Values should be distances (positive = outside, negative = inside).
     * @param {string} url - URL to the .sdf binary file
     * @param {number} scale - World-space scale of the SDF grid
     */
    async loadMeshSDF(url, scale = 2.0) {
        try {
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const view = new DataView(buffer);
            const size = view.getUint32(0, true); // Little-endian
            const data = new Float32Array(buffer, 4);
            if (data.length !== size * size * size) {
                console.warn(`SDF size mismatch: expected ${size}³ = ${size**3}, got ${data.length}`);
                return false;
            }
            this._meshSDFData = data;
            this._meshSDFSize = size;
            this._meshSDFScale = scale;
            console.log(`🗿 Loaded mesh SDF: ${size}³ grid, scale ${scale}`);
            return true;
        } catch (e) {
            console.error('Failed to load mesh SDF:', e);
            return false;
        }
    }

    // ═══════════════════════════════════════════
    // MARCHING CUBES — Isosurface Extraction
    // ═══════════════════════════════════════════

    _marchCubes() {
        const size = this.params.resolution;
        const field = this.field;
        const iso = this.params.isolation / 100; // Normalize isolation
        const scale = this.params.baseSize * 1.5;
        const invSize = 1.0 / size;
        const verts = this.vertexBuffer;
        const norms = this.normalBuffer;
        let vi = 0; // Vertex write index

        const maxVerts = verts.length;

        // For each cube in the grid
        for (let iz = 0; iz < size - 1; iz++) {
            for (let iy = 0; iy < size - 1; iy++) {
                for (let ix = 0; ix < size - 1; ix++) {
                    // Get field values at 8 corners
                    const idx = iz * size * size + iy * size + ix;
                    const v0 = field[idx];
                    const v1 = field[idx + 1];
                    const v2 = field[idx + size + 1];
                    const v3 = field[idx + size];
                    const v4 = field[idx + size * size];
                    const v5 = field[idx + size * size + 1];
                    const v6 = field[idx + size * size + size + 1];
                    const v7 = field[idx + size * size + size];

                    // Compute cube index
                    let cubeIdx = 0;
                    if (v0 > iso) cubeIdx |= 1;
                    if (v1 > iso) cubeIdx |= 2;
                    if (v2 > iso) cubeIdx |= 4;
                    if (v3 > iso) cubeIdx |= 8;
                    if (v4 > iso) cubeIdx |= 16;
                    if (v5 > iso) cubeIdx |= 32;
                    if (v6 > iso) cubeIdx |= 64;
                    if (v7 > iso) cubeIdx |= 128;

                    if (cubeIdx === 0 || cubeIdx === 255) continue;

                    // Get world positions of corners
                    const wx = (ix * invSize - 0.5) * scale * 2;
                    const wy = (iy * invSize - 0.5) * scale * 2;
                    const wz = (iz * invSize - 0.5) * scale * 2;
                    const step = invSize * scale * 2;

                    // Interpolate edge vertices
                    const edges = MC_EDGE_TABLE[cubeIdx];
                    if (edges === 0) continue;

                    const edgeVerts = [];
                    if (edges & 1)    edgeVerts[0]  = this._interpEdge(wx, wy, wz, wx+step, wy, wz, v0, v1, iso);
                    if (edges & 2)    edgeVerts[1]  = this._interpEdge(wx+step, wy, wz, wx+step, wy+step, wz, v1, v2, iso);
                    if (edges & 4)    edgeVerts[2]  = this._interpEdge(wx+step, wy+step, wz, wx, wy+step, wz, v2, v3, iso);
                    if (edges & 8)    edgeVerts[3]  = this._interpEdge(wx, wy, wz, wx, wy+step, wz, v0, v3, iso);
                    if (edges & 16)   edgeVerts[4]  = this._interpEdge(wx, wy, wz+step, wx+step, wy, wz+step, v4, v5, iso);
                    if (edges & 32)   edgeVerts[5]  = this._interpEdge(wx+step, wy, wz+step, wx+step, wy+step, wz+step, v5, v6, iso);
                    if (edges & 64)   edgeVerts[6]  = this._interpEdge(wx+step, wy+step, wz+step, wx, wy+step, wz+step, v6, v7, iso);
                    if (edges & 128)  edgeVerts[7]  = this._interpEdge(wx, wy, wz+step, wx, wy+step, wz+step, v4, v7, iso);
                    if (edges & 256)  edgeVerts[8]  = this._interpEdge(wx, wy, wz, wx, wy, wz+step, v0, v4, iso);
                    if (edges & 512)  edgeVerts[9]  = this._interpEdge(wx+step, wy, wz, wx+step, wy, wz+step, v1, v5, iso);
                    if (edges & 1024) edgeVerts[10] = this._interpEdge(wx+step, wy+step, wz, wx+step, wy+step, wz+step, v2, v6, iso);
                    if (edges & 2048) edgeVerts[11] = this._interpEdge(wx, wy+step, wz, wx, wy+step, wz+step, v3, v7, iso);

                    // Generate triangles from tri table
                    const triRow = MC_TRI_TABLE[cubeIdx];
                    for (let t = 0; t < triRow.length; t += 3) {
                        if (vi + 9 > maxVerts) break;

                        const a = edgeVerts[triRow[t]];
                        const b = edgeVerts[triRow[t + 1]];
                        const c = edgeVerts[triRow[t + 2]];

                        if (!a || !b || !c) continue;

                        // Compute face normal
                        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
                        const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
                        let nx = aby * acz - abz * acy;
                        let ny = abz * acx - abx * acz;
                        let nz = abx * acy - aby * acx;
                        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                        nx /= nLen; ny /= nLen; nz /= nLen;

                        // Write triangle
                        verts[vi] = a[0]; verts[vi+1] = a[1]; verts[vi+2] = a[2];
                        verts[vi+3] = b[0]; verts[vi+4] = b[1]; verts[vi+5] = b[2];
                        verts[vi+6] = c[0]; verts[vi+7] = c[1]; verts[vi+8] = c[2];

                        norms[vi] = nx; norms[vi+1] = ny; norms[vi+2] = nz;
                        norms[vi+3] = nx; norms[vi+4] = ny; norms[vi+5] = nz;
                        norms[vi+6] = nx; norms[vi+7] = ny; norms[vi+8] = nz;

                        vi += 9;
                    }
                }
            }
        }

        this.vertCount = vi / 3;

        // Update GPU buffers
        const geo = this.mcMesh.geometry;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.normal.needsUpdate = true;
        geo.setDrawRange(0, this.vertCount);
    }

    _interpEdge(x0, y0, z0, x1, y1, z1, v0, v1, iso) {
        if (Math.abs(v0 - v1) < 0.00001) return [x0, y0, z0];
        const t = (iso - v0) / (v1 - v0);
        return [
            x0 + t * (x1 - x0),
            y0 + t * (y1 - y0),
            z0 + t * (z1 - z0)
        ];
    }

    // ═══════════════════════════════════════════
    // FALLBACK NOISE (if visualizer.noise3D unavailable)
    // ═══════════════════════════════════════════

    _fallbackNoise(x, y, z) {
        return (
            Math.sin(x * 0.1) * Math.cos(y * 0.1) * Math.sin(z * 0.1) +
            Math.sin(x * 0.2 + 1.3) * Math.cos(y * 0.2 + 2.1) * Math.sin(z * 0.2 + 3.7) * 0.5 +
            Math.sin(x * 0.4 + 2.7) * Math.cos(y * 0.4 + 1.9) * Math.sin(z * 0.4 + 4.2) * 0.25
        ) / 1.75;
    }

    // ═══════════════════════════════════════════
    // PARAMETER API (same interface as CosmicEntity)
    // ═══════════════════════════════════════════

    setParam(key, value) {
        if (key in this.params) {
            this.params[key] = value;
            // Handle resolution change
            if (key === 'resolution') {
                this.fieldSize = value;
                this.field = new Float32Array(value * value * value);
            }
            // Handle material changes
            if (key === 'metalness' && this.mcMaterial) this.mcMaterial.metalness = value;
            if (key === 'roughness' && this.mcMaterial) this.mcMaterial.roughness = value;
            if (key === 'clearcoat' && this.mcMaterial) this.mcMaterial.clearcoat = value;
            if (key === 'envMapIntensity' && this.mcMaterial) this.mcMaterial.envMapIntensity = value;
        }
    }

    getParam(key) { return this.params[key]; }
    setParams(obj) { for (const k in obj) this.setParam(k, obj[k]); }
    getAllParams() { return { ...this.params }; }

    // ═══════════════════════════════════════════
    // ACTIVATION
    // ═══════════════════════════════════════════

    activate() {
        this.active = true;
        // Don't set mcMesh.visible here — melt-driven crossfade handles visibility
        // Don't hide original ferrofluid — crossfade blends both
        console.log('🫧 LiquidBlob activated (melt-driven crossfade)');
    }

    deactivate() {
        this.active = false;
        this.mcMesh.visible = false;
        this.mcMaterial.opacity = 0;

        // Restore original ferrofluid to full opacity
        if (this.visualizer.ferrofluid && this.visualizer.ferrofluid.material) {
            this.visualizer.ferrofluid.material.opacity = 1.0;
            this.visualizer.ferrofluid.material.transparent = false;
        }

        console.log('🫧 LiquidBlob deactivated');
    }

    toggle() {
        if (this.active) this.deactivate();
        else this.activate();
        return this.active;
    }

    dispose() {
        if (this.mcMesh) {
            this.mcMesh.geometry.dispose();
            this.mcMaterial.dispose();
            this.scene.remove(this.mcMesh);
        }
    }
}


// ═══════════════════════════════════════════════════
// MARCHING CUBES LOOKUP TABLES
// Standard MC edge and triangle tables (Paul Bourke)
// ═══════════════════════════════════════════════════

const MC_EDGE_TABLE = [
    0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
    0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
    0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
    0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
    0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
    0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
    0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
    0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
    0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
    0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
    0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
    0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
    0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
    0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
    0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
    0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0
];

const MC_TRI_TABLE = [
    [],
    [0,8,3],
    [0,1,9],
    [1,8,3,9,8,1],
    [1,2,10],
    [0,8,3,1,2,10],
    [9,2,10,0,2,9],
    [2,8,3,2,10,8,10,9,8],
    [3,11,2],
    [0,11,2,8,11,0],
    [1,9,0,2,3,11],
    [1,11,2,1,9,11,9,8,11],
    [3,10,1,11,10,3],
    [0,10,1,0,8,10,8,11,10],
    [3,9,0,3,11,9,11,10,9],
    [9,8,10,10,8,11],
    [4,7,8],
    [4,3,0,7,3,4],
    [0,1,9,8,4,7],
    [4,1,9,4,7,1,7,3,1],
    [1,2,10,8,4,7],
    [3,4,7,3,0,4,1,2,10],
    [9,2,10,9,0,2,8,4,7],
    [2,10,9,2,9,7,2,7,3,7,9,4],
    [8,4,7,3,11,2],
    [11,4,7,11,2,4,2,0,4],
    [9,0,1,8,4,7,2,3,11],
    [4,7,11,9,4,11,9,11,2,9,2,1],
    [3,10,1,3,11,10,7,8,4],
    [1,11,10,1,4,11,1,0,4,7,11,4],
    [4,7,8,9,0,11,9,11,10,11,0,3],
    [4,7,11,4,11,9,9,11,10],
    [9,5,4],
    [9,5,4,0,8,3],
    [0,5,4,1,5,0],
    [8,5,4,8,3,5,3,1,5],
    [1,2,10,9,5,4],
    [3,0,8,1,2,10,4,9,5],
    [5,2,10,5,4,2,4,0,2],
    [2,10,5,3,2,5,3,5,4,3,4,8],
    [9,5,4,2,3,11],
    [0,11,2,0,8,11,4,9,5],
    [0,5,4,0,1,5,2,3,11],
    [2,1,5,2,5,8,2,8,11,4,8,5],
    [10,3,11,10,1,3,9,5,4],
    [4,9,5,0,8,1,8,10,1,8,11,10],
    [5,4,0,5,0,11,5,11,10,11,0,3],
    [5,4,8,5,8,10,10,8,11],
    [9,7,8,5,7,9],
    [9,3,0,9,5,3,5,7,3],
    [0,7,8,0,1,7,1,5,7],
    [1,5,3,3,5,7],
    [9,7,8,9,5,7,10,1,2],
    [10,1,2,9,5,0,5,3,0,5,7,3],
    [8,0,2,8,2,5,8,5,7,10,5,2],
    [2,10,5,2,5,3,3,5,7],
    [7,9,5,7,8,9,3,11,2],
    [9,5,7,9,7,2,9,2,0,2,7,11],
    [2,3,11,0,1,8,1,7,8,1,5,7],
    [11,2,1,11,1,7,7,1,5],
    [9,5,8,8,5,7,10,1,3,10,3,11],
    [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0],
    [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0],
    [11,10,5,7,11,5],
    [10,6,5],
    [0,8,3,5,10,6],
    [9,0,1,5,10,6],
    [1,8,3,1,9,8,5,10,6],
    [1,6,5,2,6,1],
    [1,6,5,1,2,6,3,0,8],
    [9,6,5,9,0,6,0,2,6],
    [5,9,8,5,8,2,5,2,6,3,2,8],
    [2,3,11,10,6,5],
    [11,0,8,11,2,0,10,6,5],
    [0,1,9,2,3,11,5,10,6],
    [5,10,6,1,9,2,9,11,2,9,8,11],
    [6,3,11,6,5,3,5,1,3],
    [0,8,11,0,11,5,0,5,1,5,11,6],
    [3,11,6,0,3,6,0,6,5,0,5,9],
    [6,5,9,6,9,11,11,9,8],
    [5,10,6,4,7,8],
    [4,3,0,4,7,3,6,5,10],
    [1,9,0,5,10,6,8,4,7],
    [10,6,5,1,9,7,1,7,3,7,9,4],
    [6,1,2,6,5,1,4,7,8],
    [1,2,5,5,2,6,3,0,4,3,4,7],
    [8,4,7,9,0,5,0,6,5,0,2,6],
    [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9],
    [3,11,2,7,8,4,10,6,5],
    [5,10,6,4,7,2,4,2,0,2,7,11],
    [0,1,9,4,7,8,2,3,11,5,10,6],
    [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6],
    [8,4,7,3,11,5,3,5,1,5,11,6],
    [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11],
    [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7],
    [6,5,9,6,9,11,4,7,9,7,11,9],
    [10,4,9,6,4,10],
    [4,10,6,4,9,10,0,8,3],
    [10,0,1,10,6,0,6,4,0],
    [8,3,1,8,1,6,8,6,4,6,1,10],
    [1,4,9,1,2,4,2,6,4],
    [3,0,8,1,2,9,2,4,9,2,6,4],
    [0,2,4,4,2,6],
    [8,3,2,8,2,4,4,2,6],
    [10,4,9,10,6,4,11,2,3],
    [0,8,2,2,8,11,4,9,10,4,10,6],
    [3,11,2,0,1,6,0,6,4,6,1,10],
    [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1],
    [9,6,4,9,3,6,9,1,3,11,6,3],
    [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1],
    [3,11,6,3,6,0,0,6,4],
    [6,4,8,11,6,8],
    [7,10,6,7,8,10,8,9,10],
    [0,7,3,0,10,7,0,9,10,6,7,10],
    [10,6,7,1,10,7,1,7,8,1,8,0],
    [10,6,7,10,7,1,1,7,3],
    [1,2,6,1,6,8,1,8,9,8,6,7],
    [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9],
    [7,8,0,7,0,6,6,0,2],
    [7,3,2,6,7,2],
    [2,3,11,10,6,8,10,8,9,8,6,7],
    [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7],
    [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11],
    [11,2,1,11,1,7,10,6,1,6,7,1],
    [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6],
    [0,9,1,11,6,7],
    [7,8,0,7,0,6,3,11,0,11,6,0],
    [7,11,6],
    [7,6,11],
    [3,0,8,11,7,6],
    [0,1,9,11,7,6],
    [8,1,9,8,3,1,11,7,6],
    [10,1,2,6,11,7],
    [1,2,10,3,0,8,6,11,7],
    [2,9,0,2,10,9,6,11,7],
    [6,11,7,2,10,3,10,8,3,10,9,8],
    [7,2,3,6,2,7],
    [7,0,8,7,6,0,6,2,0],
    [2,7,6,2,3,7,0,1,9],
    [1,6,2,1,8,6,1,9,8,8,7,6],
    [10,7,6,10,1,7,1,3,7],
    [10,7,6,1,7,10,1,8,7,1,0,8],
    [0,3,7,0,7,10,0,10,9,6,10,7],
    [7,6,10,7,10,8,8,10,9],
    [6,8,4,11,8,6],
    [3,6,11,3,0,6,0,4,6],
    [8,6,11,8,4,6,9,0,1],
    [9,4,6,9,6,3,9,3,1,11,3,6],
    [6,8,4,6,11,8,2,10,1],
    [1,2,10,3,0,11,0,6,11,0,4,6],
    [4,11,8,4,6,11,0,2,9,2,10,9],
    [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3],
    [8,2,3,8,4,2,4,6,2],
    [0,4,2,4,6,2],
    [1,9,0,2,3,4,2,4,6,4,3,8],
    [1,9,4,1,4,2,2,4,6],
    [8,1,3,8,6,1,8,4,6,6,10,1],
    [10,1,0,10,0,6,6,0,4],
    [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3],
    [10,9,4,6,10,4],
    [4,9,5,7,6,11],
    [0,8,3,4,9,5,11,7,6],
    [5,0,1,5,4,0,7,6,11],
    [11,7,6,8,3,4,3,5,4,3,1,5],
    [9,5,4,10,1,2,7,6,11],
    [6,11,7,1,2,10,0,8,3,4,9,5],
    [7,6,11,5,4,10,4,2,10,4,0,2],
    [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6],
    [7,2,3,7,6,2,5,4,9],
    [9,5,4,0,8,6,0,6,2,6,8,7],
    [3,6,2,3,7,6,1,5,0,5,4,0],
    [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8],
    [9,5,4,10,1,6,1,7,6,1,3,7],
    [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4],
    [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10],
    [7,6,10,7,10,8,5,4,10,4,8,10],
    [6,9,5,6,11,9,11,8,9],
    [3,6,11,0,6,3,0,5,6,0,9,5],
    [0,11,8,0,5,11,0,1,5,5,6,11],
    [6,11,3,6,3,5,5,3,1],
    [1,2,10,9,5,11,9,11,8,11,5,6],
    [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10],
    [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5],
    [6,11,3,6,3,5,2,10,3,10,5,3],
    [5,8,9,5,2,8,5,6,2,3,8,2],
    [9,5,6,9,6,0,0,6,2],
    [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8],
    [1,5,6,2,1,6],
    [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6],
    [10,1,0,10,0,6,9,5,0,5,6,0],
    [0,3,8,5,6,10],
    [10,5,6],
    [11,5,10,7,5,11],
    [11,5,10,11,7,5,8,3,0],
    [5,11,7,5,10,11,1,9,0],
    [10,7,5,10,11,7,9,8,1,8,3,1],
    [11,1,2,11,7,1,7,5,1],
    [0,8,3,1,2,7,1,7,5,7,2,11],
    [9,7,5,9,2,7,9,0,2,2,11,7],
    [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2],
    [2,5,10,2,3,5,3,7,5],
    [8,2,0,8,5,2,8,7,5,10,2,5],
    [9,0,1,5,10,3,5,3,7,3,10,2],
    [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2],
    [1,3,5,3,7,5],
    [0,8,7,0,7,1,1,7,5],
    [9,0,3,9,3,5,5,3,7],
    [9,8,7,5,9,7],
    [5,8,4,5,10,8,10,11,8],
    [5,0,4,5,11,0,5,10,11,11,3,0],
    [0,1,9,8,4,10,8,10,11,10,4,5],
    [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4],
    [2,5,1,2,8,5,2,11,8,4,5,8],
    [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11],
    [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5],
    [9,4,5,2,11,3],
    [2,5,10,3,5,2,3,4,5,3,8,4],
    [5,10,2,5,2,4,4,2,0],
    [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9],
    [5,10,2,5,2,4,1,9,2,9,4,2],
    [8,4,5,8,5,3,3,5,1],
    [0,4,5,1,0,5],
    [8,4,5,8,5,3,9,0,5,0,3,5],
    [9,4,5],
    [4,11,7,4,9,11,9,10,11],
    [0,8,3,4,9,7,9,11,7,9,10,11],
    [1,10,11,1,11,4,1,4,0,7,4,11],
    [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4],
    [4,11,7,9,11,4,9,2,11,9,1,2],
    [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3],
    [11,7,4,11,4,2,2,4,0],
    [11,7,4,11,4,2,8,3,4,3,2,4],
    [2,9,10,2,7,9,2,3,7,7,4,9],
    [9,10,7,9,7,4,10,2,7,8,7,0,2,0,7],
    [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10],
    [1,10,2,8,7,4],
    [4,9,1,4,1,7,7,1,3],
    [4,9,1,4,1,7,0,8,1,8,7,1],
    [4,0,3,7,4,3],
    [4,8,7],
    [9,10,8,10,11,8],
    [3,0,9,3,9,11,11,9,10],
    [0,1,10,0,10,8,8,10,11],
    [3,1,10,11,3,10],
    [1,2,11,1,11,9,9,11,8],
    [3,0,9,3,9,11,1,2,9,2,11,9],
    [0,2,11,8,0,11],
    [3,2,11],
    [2,3,8,2,8,10,10,8,9],
    [9,10,2,0,9,2],
    [2,3,8,2,8,10,0,1,8,1,10,8],
    [1,10,2],
    [1,3,8,9,1,8],
    [0,9,1],
    [0,3,8],
    []
];
