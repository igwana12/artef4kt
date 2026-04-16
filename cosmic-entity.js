/**
 * Cosmic Entity System — Claude's Face
 *
 * A glowing particle cloud that clusters tight when quiet and
 * opens/spreads organically when voice is active. Like a nebula.
 *
 * Particles glow with additive blending against a dark background.
 * The shape is driven by an internal oscilloscope skeleton.
 * Voice volume = spread/openness. Frequency bands = shape details.
 *
 * Adjustable: size, speed, density, glow, haze, color, etc.
 */

class CosmicEntitySystem {
    constructor(ferrofluidVisualizer) {
        this.visualizer = ferrofluidVisualizer;
        this.scene = ferrofluidVisualizer.scene;

        // ═══ ADJUSTABLE PARAMETERS ═══
        this.params = {
            // Particle cloud
            particleCount: 5000,
            particleBaseSize: 0.10,        // Base point size
            particleSizeRange: 0.07,       // Random size variation
            particleColor: [0.4, 0.65, 1.0], // RGB (cyan-blue)
            particleGlow: 0.92,            // Glow intensity (0-1)
            particleOpacity: 0.9,          // Base opacity

            // Cloud shape
            cloudRadius: 0.5,              // Radius when quiet (tight cluster)
            cloudMaxRadius: 3.5,           // Max radius when loud
            cloudSpread: 1.0,              // Overall spread multiplier

            // Physics
            speed: 1.0,                    // Animation speed
            viscosity: 0.92,               // Velocity damping
            cohesion: 0.02,                // Pull toward cluster center
            turbulence: 0.4,               // Swirl/noise strength
            returnSpeed: 0.06,             // How fast particles return when quiet

            // Skeleton / waveform
            skeletonLoops: 3,              // Lissajous complexity
            skeletonSpeed: 0.5,            // How fast skeleton rotates

            // Glow sprite (central glow)
            glowEnabled: true,
            glowSize: 4.0,
            glowIntensity: 0.6,
            glowColor: [0.3, 0.5, 1.0],

            // Haze (outer atmospheric)
            hazeEnabled: true,
            hazeSize: 9.0,
            hazeIntensity: 0.2,
            hazeColor: [0.15, 0.1, 0.3],

            // Flicker
            flickerEnabled: true,
            flickerSpeed: 8.0,             // How fast particles flicker
            flickerIntensity: 0.4,         // How much they dim/brighten (0-1)

            // Trails
            trailsEnabled: true,
            trailLength: 0.85,             // Trail persistence (0=none, 0.99=long trails)
            trailOpacity: 0.4,             // Trail brightness

            // Surface attachment
            surfaceAttach: false,          // Attach particles to ferrofluid surface
            surfaceAttachStrength: 0.3,    // How strongly particles stick to surface (0-1)
            surfaceOffset: 0.15,           // How far above the surface particles hover
            surfaceVibration: 0.03,        // Vibration amplitude on surface
            surfaceDelay: 0.04,            // Delay factor — creates the shimmer/vibration lag

            // Electric arcs
            arcsEnabled: true,
            arcCount: 6,
            arcLifespan: 0.2
        };

        // ─── State ───
        this.active = false;
        this.time = 0;
        this.smoothedAmplitude = 0;
        this.onsetFlash = 0;

        // Particles
        this.positions = null;    // Float32Array for positions
        this.velocities = null;   // Float32Array for velocities
        this.homePositions = null; // Where particles sit when quiet
        this.sizes = null;        // Per-particle size
        this.alphas = null;       // Per-particle alpha (for flicker)
        this.pointsMesh = null;

        // Trails (previous positions)
        this.trailPositions = null;
        this.trailMesh = null;

        // Glow / haze
        this.glowSprite = null;
        this.hazeSprite = null;

        // Arcs
        this.arcs = [];
        this.arcLines = [];

        // Group
        this.group = new THREE.Group();
        this.group.visible = false;

        this.initialize();
        console.log('⚡ Cosmic Entity System initialized');
    }

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    initialize() {
        this.initParticles();
        this.initGlow();
        this.initHaze();
        this.initArcs();
        this.scene.add(this.group);
    }

    initParticles() {
        const p = this.params;
        const N = p.particleCount;

        this.positions = new Float32Array(N * 3);
        this.velocities = new Float32Array(N * 3);
        this.homePositions = new Float32Array(N * 3);
        this.sizes = new Float32Array(N);
        this.alphas = new Float32Array(N);       // Per-particle flicker alpha
        this.noiseSeeds = new Float32Array(N);   // Unique noise seed per particle

        // Trail buffer (previous positions for trail rendering)
        this.trailPositions = new Float32Array(N * 3);

        // Distribute particles on a small sphere (cohesive state)
        for (let i = 0; i < N; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = p.cloudRadius * (0.5 + Math.random() * 0.5);

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            this.positions[i * 3] = x;
            this.positions[i * 3 + 1] = y;
            this.positions[i * 3 + 2] = z;

            this.trailPositions[i * 3] = x;
            this.trailPositions[i * 3 + 1] = y;
            this.trailPositions[i * 3 + 2] = z;

            this.homePositions[i * 3] = x;
            this.homePositions[i * 3 + 1] = y;
            this.homePositions[i * 3 + 2] = z;

            this.velocities[i * 3] = 0;
            this.velocities[i * 3 + 1] = 0;
            this.velocities[i * 3 + 2] = 0;

            this.sizes[i] = p.particleBaseSize + Math.random() * p.particleSizeRange;
            this.alphas[i] = 1.0;
            this.noiseSeeds[i] = Math.random() * 1000;
        }

        // ─── Main particle points ───
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(p.particleColor[0], p.particleColor[1], p.particleColor[2]) },
                uOpacity: { value: p.particleOpacity },
                uGlow: { value: p.particleGlow },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                uniform float uPixelRatio;
                varying float vAlpha;
                varying float vFlicker;

                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float dist = length(mvPosition.xyz);

                    gl_PointSize = size * 300.0 * uPixelRatio / dist;
                    gl_PointSize = max(gl_PointSize, 1.0);
                    gl_PointSize = min(gl_PointSize, 64.0);

                    vAlpha = 1.0 - smoothstep(2.0, 20.0, dist);
                    vFlicker = alpha; // Per-particle flicker value

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uGlow;
                varying float vAlpha;
                varying float vFlicker;

                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;

                    // Soft glow falloff
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    alpha = pow(alpha, 2.0 - uGlow);

                    // Core brightness (white-hot center)
                    float core = 1.0 - smoothstep(0.0, 0.15, dist);

                    vec3 color = uColor + vec3(core * 0.6);
                    float finalAlpha = alpha * uOpacity * vAlpha * vFlicker;

                    gl_FragColor = vec4(color, finalAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });

        this.pointsMesh = new THREE.Points(geometry, material);
        this.group.add(this.pointsMesh);

        // ─── Trail points (ghost of previous positions) ───
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
        trailGeo.setAttribute('size', new THREE.BufferAttribute(this.sizes.slice(), 1)); // Copy sizes

        const trailMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(p.particleColor[0] * 0.6, p.particleColor[1] * 0.6, p.particleColor[2] * 0.8) },
                uOpacity: { value: p.trailOpacity },
                uGlow: { value: 0.95 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
            },
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });

        this.trailMesh = new THREE.Points(trailGeo, trailMat);
        this.group.add(this.trailMesh);
    }

    initGlow() {
        const p = this.params;
        const tex = this.createGlowTexture(128,
            `rgba(${Math.floor(p.glowColor[0]*255)}, ${Math.floor(p.glowColor[1]*255)}, ${Math.floor(p.glowColor[2]*255)}, 0.6)`,
            'rgba(0, 0, 30, 0)'
        );
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: p.glowIntensity
        });
        this.glowSprite = new THREE.Sprite(mat);
        this.glowSprite.scale.set(p.glowSize, p.glowSize, 1);
        this.group.add(this.glowSprite);
    }

    initHaze() {
        const p = this.params;
        const tex = this.createGlowTexture(128,
            `rgba(${Math.floor(p.hazeColor[0]*255)}, ${Math.floor(p.hazeColor[1]*255)}, ${Math.floor(p.hazeColor[2]*255)}, 0.25)`,
            'rgba(0, 0, 10, 0)'
        );
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: p.hazeIntensity
        });
        this.hazeSprite = new THREE.Sprite(mat);
        this.hazeSprite.scale.set(p.hazeSize, p.hazeSize, 1);
        this.group.add(this.hazeSprite);
    }

    initArcs() {
        const p = this.params;
        for (let i = 0; i < p.arcCount; i++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 3), 3));
            const mat = new THREE.LineBasicMaterial({
                color: 0x99ccff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const line = new THREE.Line(geo, mat);
            line.visible = false;
            this.arcLines.push(line);
            this.group.add(line);
        }
    }

    // ═══════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════

    createGlowTexture(size, centerColor, edgeColor) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, centerColor);
        gradient.addColorStop(0.4, centerColor.replace(/[\d.]+\)$/, '0.25)'));
        gradient.addColorStop(1, edgeColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    noise3D(x, y, z) {
        if (this.visualizer.noise3D) return this.visualizer.noise3D(x, y, z);
        return (
            Math.sin(x * 0.1) * Math.cos(y * 0.1) * Math.sin(z * 0.1) +
            Math.sin(x * 0.2 + 1.3) * Math.cos(y * 0.2 + 2.1) * Math.sin(z * 0.2 + 3.7) * 0.5 +
            Math.sin(x * 0.4 + 2.7) * Math.cos(y * 0.4 + 1.9) * Math.sin(z * 0.4 + 4.2) * 0.25
        ) / 1.75;
    }

    noise1D(x) {
        return (Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.3) * 0.25 + Math.sin(x * 4.7 + 2.7) * 0.125) / 0.875;
    }

    // ═══════════════════════════════════════════
    // UPDATE
    // ═══════════════════════════════════════════

    update(deltaTime) {
        if (!this.active) return;

        const dt = Math.min(deltaTime, 0.05);
        this.time += dt * this.params.speed;
        const t = this.time;

        const bass = this.visualizer.bassIntensity || 0;
        const mid = this.visualizer.midIntensity || 0;
        const high = this.visualizer.highIntensity || 0;
        const total = bass + mid + high;

        this.smoothedAmplitude += (total - this.smoothedAmplitude) * 0.12;
        this.onsetFlash *= 0.85;

        // Beat detection
        if (this.visualizer.bpmDetector && this.visualizer.bpmDetector.peaks) {
            const peaks = this.visualizer.bpmDetector.peaks;
            if (peaks.length > 0 && (performance.now() - peaks[peaks.length - 1]) < 100) {
                this.onsetFlash = Math.min(1.0, this.onsetFlash + 0.8);
            }
        }

        this.updateParticles(dt, bass, mid, high, total);
        this.updateGlowHaze(dt, bass, total);
        if (this.params.arcsEnabled) this.updateArcs(dt, high, total);
    }

    // ─── PARTICLE CLOUD ───

    updateParticles(dt, bass, mid, high, total) {
        const p = this.params;
        const t = this.time;
        const N = p.particleCount;
        const pos = this.positions;
        const vel = this.velocities;
        const home = this.homePositions;

        // Cloud radius expands with audio energy
        const audioEnergy = this.smoothedAmplitude;
        const targetRadius = p.cloudRadius + (p.cloudMaxRadius - p.cloudRadius) * (audioEnergy / 1.5) * p.cloudSpread;

        // Get audio data for waveform skeleton
        const hasAudioData = this.visualizer.dataArray && this.visualizer.dataArray.length > 0 && this.visualizer.isPlaying;

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            const frac = i / N; // 0 to 1 — each particle has a unique phase

            // ─── 1. Compute target position on the waveform skeleton ───
            // The skeleton is a 3D Lissajous curve that represents the "oscilloscope"

            // Audio displacement for this particle's position on the waveform
            let audioDisp = 0;
            if (hasAudioData) {
                const dataIdx = Math.floor(frac * this.visualizer.dataArray.length);
                audioDisp = (this.visualizer.dataArray[dataIdx] || 0) / 255;
            } else {
                audioDisp =
                    bass * Math.abs(Math.sin(frac * Math.PI * 4 + t * 1.5)) * 0.5 +
                    mid * Math.abs(Math.sin(frac * Math.PI * 12 + t * 3.0)) * 0.35 +
                    high * Math.abs(Math.sin(frac * Math.PI * 30 + t * 7.0)) * 0.15;
            }

            // Lissajous-like skeleton path
            const loops = p.skeletonLoops;
            const spdMul = p.skeletonSpeed;
            const angle1 = frac * Math.PI * 2 * loops + t * spdMul;
            const angle2 = frac * Math.PI * 2 * (loops - 1) + t * spdMul * 0.7;
            const angle3 = frac * Math.PI * 2 * (loops + 2) + t * spdMul * 1.3;

            // Target radius for this particle (driven by audio)
            const r = targetRadius * (0.2 + audioDisp * 0.8) * (1 + this.onsetFlash * 0.5);

            // Random variation per particle (so they don't all land on the same line)
            const scatter = 0.3 + audioEnergy * 0.5; // More scatter when louder
            const px = Math.sin(i * 0.1 + 7.3) * scatter;
            const py = Math.cos(i * 0.13 + 2.1) * scatter;
            const pz = Math.sin(i * 0.17 + 4.8) * scatter;

            const targetX = r * Math.cos(angle1) * Math.sin(angle2) + px;
            const targetY = r * Math.sin(angle1) * Math.cos(angle3) * 0.7 + py;
            const targetZ = r * Math.cos(angle2) * Math.sin(angle3) + pz;

            // ─── 2. Spring force toward target ───
            const dx = targetX - pos[i3];
            const dy = targetY - pos[i3 + 1];
            const dz = targetZ - pos[i3 + 2];

            // Attraction strength: stronger when voice is active, gentle when quiet
            const attract = audioEnergy > 0.05
                ? p.cohesion * 3.0 + audioEnergy * 0.1
                : p.returnSpeed;

            vel[i3] += dx * attract;
            vel[i3 + 1] += dy * attract;
            vel[i3 + 2] += dz * attract;

            // ─── 3. Turbulence (swirling motion) ───
            if (audioEnergy > 0.02) {
                const turbScale = p.turbulence * audioEnergy;
                vel[i3] += this.noise3D(pos[i3] * 0.5 + t * 0.3, pos[i3+1] * 0.5, pos[i3+2] * 0.5) * turbScale * dt * 60;
                vel[i3+1] += this.noise3D(pos[i3] * 0.5, pos[i3+1] * 0.5 + t * 0.2, pos[i3+2] * 0.5) * turbScale * dt * 60;
                vel[i3+2] += this.noise3D(pos[i3] * 0.5, pos[i3+1] * 0.5, pos[i3+2] * 0.5 + t * 0.4) * turbScale * dt * 60;
            }

            // ─── 4. Onset burst ───
            if (this.onsetFlash > 0.2) {
                const dist = Math.sqrt(pos[i3]*pos[i3] + pos[i3+1]*pos[i3+1] + pos[i3+2]*pos[i3+2]);
                if (dist > 0.01) {
                    const burstForce = this.onsetFlash * 0.15;
                    vel[i3] += (pos[i3] / dist) * burstForce;
                    vel[i3+1] += (pos[i3+1] / dist) * burstForce;
                    vel[i3+2] += (pos[i3+2] / dist) * burstForce;
                }
            }

            // ─── 5. Damping (viscosity) ───
            vel[i3] *= p.viscosity;
            vel[i3 + 1] *= p.viscosity;
            vel[i3 + 2] *= p.viscosity;

            // ─── 6. Integrate ───
            pos[i3] += vel[i3] * dt * 60;
            pos[i3 + 1] += vel[i3 + 1] * dt * 60;
            pos[i3 + 2] += vel[i3 + 2] * dt * 60;

            // ─── 7. Surface attachment ───
            // Pull particles toward the ferrofluid sphere surface with vibration delay
            if (p.surfaceAttach && this.visualizer.ferrofluid) {
                const ferroGeo = this.visualizer.ferrofluid.geometry;
                const ferroPos = ferroGeo.attributes.position.array;
                const ferroVertCount = ferroPos.length / 3;

                // Find nearest surface vertex (sample every 16th for performance)
                let nearestDistSq = Infinity;
                let nearX = 0, nearY = 0, nearZ = 0;
                const step = Math.max(1, Math.floor(ferroVertCount / 256));

                for (let vi = 0; vi < ferroVertCount; vi += step) {
                    const vx = ferroPos[vi * 3];
                    const vy = ferroPos[vi * 3 + 1];
                    const vz = ferroPos[vi * 3 + 2];
                    const ddx = pos[i3] - vx;
                    const ddy = pos[i3+1] - vy;
                    const ddz = pos[i3+2] - vz;
                    const dSq = ddx*ddx + ddy*ddy + ddz*ddz;
                    if (dSq < nearestDistSq) {
                        nearestDistSq = dSq;
                        nearX = vx; nearY = vy; nearZ = vz;
                    }
                }

                // Pull toward surface point + offset along normal
                const nLen = Math.sqrt(nearX*nearX + nearY*nearY + nearZ*nearZ);
                if (nLen > 0.01) {
                    const nx = nearX/nLen, ny = nearY/nLen, nz = nearZ/nLen;
                    const surfX = nearX + nx * p.surfaceOffset;
                    const surfY = nearY + ny * p.surfaceOffset;
                    const surfZ = nearZ + nz * p.surfaceOffset;

                    // Vibration: tiny noise offset that creates the shimmer
                    const vibT = t * 60 + this.noiseSeeds[i]; // Delayed per particle
                    const vibX = Math.sin(vibT * p.flickerSpeed) * p.surfaceVibration;
                    const vibY = Math.cos(vibT * p.flickerSpeed * 1.3) * p.surfaceVibration;
                    const vibZ = Math.sin(vibT * p.flickerSpeed * 0.7) * p.surfaceVibration;

                    // Spring toward surface with delay
                    const attachForce = p.surfaceAttachStrength;
                    vel[i3] += (surfX + vibX - pos[i3]) * attachForce;
                    vel[i3+1] += (surfY + vibY - pos[i3+1]) * attachForce;
                    vel[i3+2] += (surfZ + vibZ - pos[i3+2]) * attachForce;
                }
            }

            // ─── 8. Flicker ───
            if (p.flickerEnabled) {
                const flickerPhase = t * p.flickerSpeed + this.noiseSeeds[i];
                const flicker = 1.0 - p.flickerIntensity * 0.5 * (1 + Math.sin(flickerPhase));
                this.alphas[i] = Math.max(0.1, flicker);
            } else {
                this.alphas[i] = 1.0;
            }

            // ─── 9. Audio-reactive size ───
            this.sizes[i] = (p.particleBaseSize + Math.random() * 0.002) * (1 + audioDisp * 0.5 + bass * 0.3 + this.onsetFlash * 0.4);
        }

        // ─── Update trails ───
        if (p.trailsEnabled && this.trailMesh) {
            const trailPos = this.trailPositions;
            const trailPersist = p.trailLength;

            for (let i = 0; i < N * 3; i++) {
                // Trail position interpolates toward current position (creates lag/trail)
                trailPos[i] += (pos[i] - trailPos[i]) * (1 - trailPersist);
            }

            this.trailMesh.geometry.attributes.position.needsUpdate = true;
            this.trailMesh.material.uniforms.uOpacity.value = p.trailOpacity * (0.3 + audioEnergy * 0.7);
            this.trailMesh.visible = true;
        } else if (this.trailMesh) {
            this.trailMesh.visible = false;
        }

        // Update GPU buffers
        this.pointsMesh.geometry.attributes.position.needsUpdate = true;
        this.pointsMesh.geometry.attributes.size.needsUpdate = true;
        this.pointsMesh.geometry.attributes.alpha.needsUpdate = true;

        // Update uniforms
        this.pointsMesh.material.uniforms.uOpacity.value = p.particleOpacity * (0.5 + audioEnergy * 0.8);
        this.pointsMesh.material.uniforms.uGlow.value = p.particleGlow;
        this.pointsMesh.material.uniforms.uColor.value.setRGB(
            p.particleColor[0] + this.onsetFlash * 0.3,
            p.particleColor[1] + this.onsetFlash * 0.2,
            p.particleColor[2]
        );

        // Slow rotation of the whole cloud
        this.group.rotation.y += 0.002 * p.speed;
    }

    // ─── GLOW & HAZE ───

    updateGlowHaze(dt, bass, total) {
        const p = this.params;
        const t = this.time;

        if (this.glowSprite && p.glowEnabled) {
            const pulse = 1 + bass * 0.6 + this.onsetFlash * 0.5;
            const breathe = 1 + Math.sin(t * 0.6) * 0.04;
            const s = p.glowSize * pulse * breathe;
            this.glowSprite.scale.set(s, s, 1);
            this.glowSprite.material.opacity = p.glowIntensity * (0.3 + total * 0.7 + this.onsetFlash * 0.3);
            this.glowSprite.visible = true;
        } else if (this.glowSprite) {
            this.glowSprite.visible = false;
        }

        if (this.hazeSprite && p.hazeEnabled) {
            const pulse = 1 + bass * 0.3 + this.smoothedAmplitude * 0.5;
            const s = p.hazeSize * pulse;
            this.hazeSprite.scale.set(s, s, 1);
            this.hazeSprite.material.opacity = p.hazeIntensity * (0.3 + total * 0.5);
            this.hazeSprite.visible = true;
        } else if (this.hazeSprite) {
            this.hazeSprite.visible = false;
        }
    }

    // ─── ELECTRIC ARCS ───

    updateArcs(dt, high, total) {
        const p = this.params;
        const t = this.time;

        if (this.onsetFlash > 0.3 || high > 0.5) {
            const num = Math.floor(1 + this.onsetFlash * 3);
            for (let a = 0; a < Math.min(num, p.arcCount); a++) {
                if (this.arcs.length >= p.arcCount) this.arcs.shift();

                // Pick two random particles
                const i1 = Math.floor(Math.random() * p.particleCount) * 3;
                const i2 = Math.floor(Math.random() * p.particleCount) * 3;

                this.arcs.push({
                    start: new THREE.Vector3(this.positions[i1], this.positions[i1+1], this.positions[i1+2]),
                    end: new THREE.Vector3(this.positions[i2], this.positions[i2+1], this.positions[i2+2]),
                    life: p.arcLifespan,
                    maxLife: p.arcLifespan,
                    seed: Math.random() * 1000
                });
            }
        }

        for (let i = this.arcs.length - 1; i >= 0; i--) {
            this.arcs[i].life -= dt;
            if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
        }

        for (let i = 0; i < p.arcCount; i++) {
            const arcLine = this.arcLines[i];
            if (i < this.arcs.length) {
                const arc = this.arcs[i];
                const progress = arc.life / arc.maxLife;
                arcLine.visible = true;
                arcLine.material.opacity = progress * 0.5;
                const pos = arcLine.geometry.attributes.position.array;
                const segs = 20;
                for (let s = 0; s < segs; s++) {
                    const f = s / (segs - 1);
                    const j = Math.sin(f * Math.PI) * 0.15 * progress;
                    pos[s*3] = arc.start.x + (arc.end.x-arc.start.x)*f + this.noise1D(arc.seed+s*3.7+t*20)*j;
                    pos[s*3+1] = arc.start.y + (arc.end.y-arc.start.y)*f + this.noise1D(arc.seed+s*5.3+t*15)*j;
                    pos[s*3+2] = arc.start.z + (arc.end.z-arc.start.z)*f + this.noise1D(arc.seed+s*7.1+t*25)*j;
                }
                arcLine.geometry.attributes.position.needsUpdate = true;
                arcLine.material.color.setRGB(0.5+progress*0.5, 0.7+progress*0.3, 1.0);
            } else {
                arcLine.visible = false;
            }
        }
    }

    // ═══════════════════════════════════════════
    // PARAMETER API
    // ═══════════════════════════════════════════

    setParam(key, value) {
        if (key in this.params) {
            this.params[key] = value;
        }
    }

    getParam(key) {
        return this.params[key];
    }

    // ═══════════════════════════════════════════
    // ACTIVATION
    // ═══════════════════════════════════════════

    activate() {
        this.active = true;
        this.group.visible = true;
        console.log('⚡ Cosmic Entity layer activated');
    }

    deactivate() {
        this.active = false;
        this.group.visible = false;
        console.log('⚡ Cosmic Entity layer deactivated');
    }

    toggle() {
        if (this.active) this.deactivate();
        else this.activate();
        return this.active;
    }

    dispose() {
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        this.scene.remove(this.group);
    }
}
