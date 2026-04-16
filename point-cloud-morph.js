/**
 * Point Cloud Morph Engine v3 - JARVIS Edition
 *
 * Modified to work with Three.js geometries directly instead of GLB files.
 * Morphs between platonic solids for the JARVIS thinking mesh.
 * 
 * Key changes from v2:
 * - Accepts Three.js geometries directly via setGeometry()
 * - Platonic solid generation built-in
 * - Audio-reactive intensity support
 * - Enhanced visual effects for neural network appearance
 */

class PointCloudMorph {
    constructor(scene, options = {}) {
        this._scene = scene;
        this._pointCount = options.pointCount || 2500;
        this._color = options.color || 0x00ffcc;
        this._particleSize = options.particleSize || 0.008;
        this._lineColor = options.lineColor || 0x00ffcc;
        this._maxLineDistance = options.maxLineDistance || 0.15;
        this._maxLines = options.maxLines || 4000;

        // State
        this._currentPositions = null;
        this._sourcePositions = null;
        this._targetPositions = null;
        this._noiseOffsets = null;
        this._progress = 1.0;
        this._morphSpeed = 0;
        this._settled = true;
        this._settledTime = 0;

        // Three.js objects
        this._geometry = null;
        this._material = null;
        this._points = null;
        this._lineGeometry = null;
        this._lineMaterial = null;
        this._lines = null;

        // Audio reactivity
        this._audioIntensity = 0;
        this._lastIntensity = 0;

        this._init();
    }

    _init() {
        this._currentPositions = new Float32Array(this._pointCount * 3);
        this._sourcePositions = new Float32Array(this._pointCount * 3);
        this._targetPositions = new Float32Array(this._pointCount * 3);
        this._noiseOffsets = new Float32Array(this._pointCount * 3);

        for (let i = 0; i < this._pointCount * 3; i++) {
            this._noiseOffsets[i] = Math.random() * Math.PI * 2;
        }

        // Start as tiny sphere
        this._initializeSphere();

        // Points (glowing particles)
        this._geometry = new THREE.BufferGeometry();
        this._geometry.setAttribute('position', new THREE.BufferAttribute(this._currentPositions, 3));

        this._material = new THREE.PointsMaterial({
            color: this._color,
            size: this._particleSize,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this._points = new THREE.Points(this._geometry, this._material);

        // Rotation group — spins the entire point cloud + lines together
        this._group = new THREE.Group();
        this._group.add(this._points);
        this._scene.add(this._group);

        // Constellation lines
        this._linePositions = new Float32Array(this._maxLines * 6);
        this._lineGeometry = new THREE.BufferGeometry();
        this._lineGeometry.setAttribute('position', new THREE.BufferAttribute(this._linePositions, 3));
        this._lineGeometry.setDrawRange(0, 0);

        this._lineMaterial = new THREE.LineBasicMaterial({
            color: this._lineColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this._lines = new THREE.LineSegments(this._lineGeometry, this._lineMaterial);
        this._group.add(this._lines);

        console.log('[MorphEngine v3] Initialized — ' + this._pointCount + ' points, ' + this._maxLines + ' max lines');
    }

    _initializeSphere() {
        for (let i = 0; i < this._pointCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 0.01;
            this._currentPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            this._currentPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            this._currentPositions[i * 3 + 2] = r * Math.cos(phi);
        }
        this._sourcePositions.set(this._currentPositions);
        this._targetPositions.set(this._currentPositions);
    }

    /**
     * Build outline-emphasizing constellation lines.
     */
    _buildConstellationLines() {
        const pos = this._currentPositions;
        const n = this._pointCount;
        const maxDist = this._maxLineDistance;
        const maxDist2 = maxDist * maxDist;
        let lineCount = 0;

        // Spatial hash grid for efficient neighbor finding
        const cellSize = maxDist * 2;
        const grid = {};
        const neighborCounts = new Uint16Array(n);

        for (let i = 0; i < n; i++) {
            const cx = Math.floor(pos[i * 3] / cellSize);
            const cy = Math.floor(pos[i * 3 + 1] / cellSize);
            const cz = Math.floor(pos[i * 3 + 2] / cellSize);
            const key = cx + ',' + cy + ',' + cz;
            if (!grid[key]) grid[key] = [];
            grid[key].push(i);
        }

        // Count neighbors per point
        for (let i = 0; i < n; i++) {
            const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
            const cx = Math.floor(px / cellSize);
            const cy = Math.floor(py / cellSize);
            const cz = Math.floor(pz / cellSize);
            let count = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const cell = grid[(cx+dx)+','+(cy+dy)+','+(cz+dz)];
                        if (cell) count += cell.length;
                    }
                }
            }
            neighborCounts[i] = count;
        }

        // Find outline threshold
        const sorted = Array.from(neighborCounts).sort((a,b) => a - b);
        const medianDensity = sorted[Math.floor(n * 0.5)];
        const outlineThreshold = medianDensity * 0.7;

        // Connect points, favoring outline regions
        for (let i = 0; i < n && lineCount < this._maxLines; i++) {
            const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
            const cx = Math.floor(px / cellSize);
            const cy = Math.floor(py / cellSize);
            const cz = Math.floor(pz / cellSize);

            const isOutlineI = neighborCounts[i] <= outlineThreshold;
            const maxPerPoint = isOutlineI ? 4 : 1;
            let connected = 0;

            for (let dx = -1; dx <= 1 && connected < maxPerPoint && lineCount < this._maxLines; dx++) {
                for (let dy = -1; dy <= 1 && connected < maxPerPoint && lineCount < this._maxLines; dy++) {
                    for (let dz = -1; dz <= 1 && connected < maxPerPoint && lineCount < this._maxLines; dz++) {
                        const cell = grid[(cx+dx)+','+(cy+dy)+','+(cz+dz)];
                        if (!cell) continue;
                        for (let ci = 0; ci < cell.length && connected < maxPerPoint && lineCount < this._maxLines; ci++) {
                            const j = cell[ci];
                            if (j <= i) continue;

                            const dx2 = pos[j*3]-px, dy2 = pos[j*3+1]-py, dz2 = pos[j*3+2]-pz;
                            const dist2 = dx2*dx2 + dy2*dy2 + dz2*dz2;
                            if (dist2 < maxDist2 && dist2 > 0.0001) {
                                const li = lineCount * 6;
                                this._linePositions[li] = px;
                                this._linePositions[li+1] = py;
                                this._linePositions[li+2] = pz;
                                this._linePositions[li+3] = pos[j*3];
                                this._linePositions[li+4] = pos[j*3+1];
                                this._linePositions[li+5] = pos[j*3+2];
                                lineCount++;
                                connected++;
                            }
                        }
                    }
                }
            }
        }

        this._lineGeometry.setDrawRange(0, lineCount * 2);
        this._lineGeometry.attributes.position.needsUpdate = true;
        return lineCount;
    }

    /**
     * Sample a Three.js geometry into N evenly-distributed points.
     */
    _sampleGeometry(geometry, count) {
        if (!geometry || !geometry.attributes.position) {
            return this._randomSphere(count, 0.5);
        }

        const positions = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;

        // Bounding box for normalization
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]);
            minY = Math.min(minY, positions[i + 1]);
            minZ = Math.min(minZ, positions[i + 2]);
            maxX = Math.max(maxX, positions[i]);
            maxY = Math.max(maxY, positions[i + 1]);
            maxZ = Math.max(maxZ, positions[i + 2]);
        }
        
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = 1.2 / maxDim;

        const result = new Float32Array(count * 3);

        if (indices && indices.length >= 3) {
            // Sample based on triangle area for uniform distribution
            const triCount = Math.floor(indices.length / 3);
            const areas = new Float32Array(triCount);
            let totalArea = 0;

            // Calculate triangle areas
            for (let t = 0; t < triCount; t++) {
                const i0 = indices[t * 3] * 3;
                const i1 = indices[t * 3 + 1] * 3;
                const i2 = indices[t * 3 + 2] * 3;
                
                const ax = positions[i1] - positions[i0];
                const ay = positions[i1 + 1] - positions[i0 + 1];
                const az = positions[i1 + 2] - positions[i0 + 2];
                
                const bx = positions[i2] - positions[i0];
                const by = positions[i2 + 1] - positions[i0 + 1];
                const bz = positions[i2 + 2] - positions[i0 + 2];
                
                const cx_cross = ay * bz - az * by;
                const cy_cross = az * bx - ax * bz;
                const cz_cross = ax * by - ay * bx;
                
                areas[t] = Math.sqrt(cx_cross * cx_cross + cy_cross * cy_cross + cz_cross * cz_cross) * 0.5;
                totalArea += areas[t];
            }

            // Build cumulative distribution
            const cdf = new Float32Array(triCount);
            cdf[0] = areas[0] / totalArea;
            for (let t = 1; t < triCount; t++) {
                cdf[t] = cdf[t - 1] + areas[t] / totalArea;
            }

            // Sample points
            for (let p = 0; p < count; p++) {
                const r = Math.random();
                let tri = triCount - 1;
                for (let t = 0; t < triCount; t++) {
                    if (r <= cdf[t]) {
                        tri = t;
                        break;
                    }
                }

                const i0 = indices[tri * 3] * 3;
                const i1 = indices[tri * 3 + 1] * 3;
                const i2 = indices[tri * 3 + 2] * 3;
                
                let u = Math.random(), v = Math.random();
                if (u + v > 1) { u = 1 - u; v = 1 - v; }
                const w = 1 - u - v;

                result[p * 3] = (positions[i0] * w + positions[i1] * u + positions[i2] * v - cx) * scale;
                result[p * 3 + 1] = (positions[i0 + 1] * w + positions[i1 + 1] * u + positions[i2 + 1] * v - cy) * scale;
                result[p * 3 + 2] = (positions[i0 + 2] * w + positions[i1 + 2] * u + positions[i2 + 2] * v - cz) * scale;
            }
        } else {
            // Sample vertices directly
            const vertCount = positions.length / 3;
            for (let p = 0; p < count; p++) {
                const vi = Math.floor(Math.random() * vertCount) * 3;
                result[p * 3] = (positions[vi] - cx) * scale;
                result[p * 3 + 1] = (positions[vi + 1] - cy) * scale;
                result[p * 3 + 2] = (positions[vi + 2] - cz) * scale;
            }
        }

        return result;
    }

    _randomSphere(count, radius) {
        const result = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = radius * Math.cbrt(Math.random());
            result[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            result[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            result[i * 3 + 2] = r * Math.cos(phi);
        }
        return result;
    }

    /**
     * Set target geometry directly (replaces loadModel for GLB files)
     */
    setGeometry(geometry) {
        if (!geometry) return;
        
        const positions = this._sampleGeometry(geometry, this._pointCount);
        this._targetPositions.set(positions);
        this._sourcePositions.set(positions);
        this._currentPositions.set(positions);
        
        if (this._geometry) {
            this._geometry.attributes.position.needsUpdate = true;
        }
        
        this._settled = true;
        this._settledTime = 0;
        this._progress = 1.0;
        this._buildConstellationLines();
    }

    /**
     * Morph to new geometry
     */
    morphToGeometry(geometry, duration = 2.5) {
        if (!geometry) return;

        const positions = this._sampleGeometry(geometry, this._pointCount);
        this._sourcePositions.set(this._currentPositions);
        this._targetPositions.set(positions);
        this._progress = 0;
        this._morphSpeed = 1.0 / duration;
        this._settled = false;
        this._settledTime = 0;

        // Fade lines out immediately
        this._lineMaterial.opacity = 0;

        console.log('[MorphEngine v3] Morphing to new geometry over ' + duration + 's');
    }

    scatter(radius = 1.5) {
        const scattered = this._randomSphere(this._pointCount, radius);
        this._sourcePositions.set(this._currentPositions);
        this._targetPositions.set(scattered);
        this._progress = 0;
        this._morphSpeed = 0.6;
        this._settled = false;
        this._settledTime = 0;
        this._lineMaterial.opacity = 0;
    }

    update(dt, time, intensity = 0) {
        if (!this._geometry) return;

        // Smooth audio intensity changes
        this._audioIntensity = this._audioIntensity * 0.8 + intensity * 0.2;
        
        const pos = this._geometry.attributes.position;

        if (!this._settled) {
            this._progress = Math.min(1.0, this._progress + this._morphSpeed * dt);

            const t = this._progress;
            const ease = t * t * (3 - 2 * t); // smoothstep

            // Midpoint scatter enhanced by audio
            const explode = Math.sin(t * Math.PI) * (0.3 + this._audioIntensity * 0.2);

            for (let i = 0; i < this._pointCount; i++) {
                const i3 = i * 3;

                let x = this._sourcePositions[i3] * (1 - ease) + this._targetPositions[i3] * ease;
                let y = this._sourcePositions[i3 + 1] * (1 - ease) + this._targetPositions[i3 + 1] * ease;
                let z = this._sourcePositions[i3 + 2] * (1 - ease) + this._targetPositions[i3 + 2] * ease;

                // Enhanced noise during transition
                const nx = this._noiseOffsets[i3];
                const ny = this._noiseOffsets[i3 + 1];
                const nz = this._noiseOffsets[i3 + 2];
                x += Math.sin(nx + time * 1.5) * explode;
                y += Math.sin(ny + time * 1.8) * explode;
                z += Math.sin(nz + time * 1.3) * explode;

                this._currentPositions[i3] = x;
                this._currentPositions[i3 + 1] = y;
                this._currentPositions[i3 + 2] = z;
            }

            // Audio-reactive particle size during morph
            const basePulse = Math.sin(t * Math.PI) * 0.8;
            const audioPulse = this._audioIntensity * 0.5;
            this._material.size = this._particleSize * (1 + basePulse + audioPulse);
            this._material.opacity = 0.3 + Math.sin(t * Math.PI) * 0.15 + this._audioIntensity * 0.1;

            if (this._progress >= 1.0) {
                this._settled = true;
                this._settledTime = 0;
                this._buildConstellationLines();
                console.log('[MorphEngine v3] Morph complete — constellation lines built');
            }
        } else {
            this._settledTime += dt;

            // Continuous organic drift enhanced by audio
            const breatheAmp = 0.015 + this._audioIntensity * 0.025;
            const driftSpeed = 0.8 + this._audioIntensity * 2.0;

            for (let i = 0; i < this._pointCount; i++) {
                const i3 = i * 3;
                const bx = this._targetPositions[i3];
                const by = this._targetPositions[i3 + 1];
                const bz = this._targetPositions[i3 + 2];

                // Enhanced drift patterns
                const ni = this._noiseOffsets[i3];
                const dx = Math.sin(ni * 3.7 + time * driftSpeed) * breatheAmp;
                const dy = Math.sin(ni * 2.3 + time * driftSpeed * 0.8 + 1.5) * breatheAmp;
                const dz = Math.cos(ni * 4.1 + time * driftSpeed * 1.2 + 0.7) * breatheAmp;

                this._currentPositions[i3] = bx + dx;
                this._currentPositions[i3 + 1] = by + dy;
                this._currentPositions[i3 + 2] = bz + dz;
            }

            // Constellation lines fade in over 1.5 seconds, enhanced by audio
            const lineFade = Math.min(1.0, this._settledTime / 1.5);
            const baseOpacity = lineFade * 0.3;
            const audioBoost = this._audioIntensity * 0.2;
            this._lineMaterial.opacity = baseOpacity + audioBoost;

            // Update line positions
            if (lineFade > 0.05) {
                this._updateLinePositions();
            }

            // Audio-reactive particle appearance
            this._material.size = this._particleSize * (1 + this._audioIntensity * 0.3);
            this._material.opacity = 0.4 + this._audioIntensity * 0.15;
        }

        pos.needsUpdate = true;

        // Enhanced rotation with audio reactivity
        if (this._group) {
            const spinSpeed = 0.4 + this._audioIntensity * 0.3;
            this._group.rotation.y += dt * spinSpeed;
            const wobbleAmp = 0.15 + this._audioIntensity * 0.1;
            this._group.rotation.x = Math.sin(time * 0.15) * wobbleAmp;
        }
    }

    _updateLinePositions() {
        if (!this._lineRebuildCounter) this._lineRebuildCounter = 0;
        this._lineRebuildCounter++;
        if (this._lineRebuildCounter % 10 === 0) {
            this._buildConstellationLines();
        }
    }

    setColor(hex) {
        this._color = hex;
        this._lineColor = hex;
        if (this._material) this._material.color.setHex(hex);
        if (this._lineMaterial) this._lineMaterial.color.setHex(hex);
    }

    setVisible(v) {
        if (this._points) this._points.visible = v;
        if (this._lines) this._lines.visible = v;
    }

    get isMorphing() { return !this._settled; }
    get progress() { return this._progress; }
}

window.PointCloudMorph = PointCloudMorph;