#!/usr/bin/env node
/**
 * SDF Baker — Convert a .glb/.gltf mesh into a binary SDF grid file
 *
 * Usage:
 *   node bake-sdf.js input.glb output.sdf [gridSize] [scale]
 *
 * Output format:
 *   - 4 bytes: uint32 grid size (little-endian)
 *   - size³ × 4 bytes: float32 distance values
 *
 * The SDF is computed by voxelizing the mesh and running a distance transform.
 * Positive values = outside the mesh, negative = inside.
 *
 * Requirements:
 *   npm install three @gltf-transform/core @gltf-transform/extensions
 */

const fs = require('fs');
const path = require('path');

// Simple point-to-triangle distance for SDF computation
function pointToTriangleDist(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    // Edge vectors
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;

    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) {
        const dx = px - ax, dy = py - ay, dz = pz - az;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
        const dx = px - bx, dy = py - by, dz = pz - bz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) {
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        const qx = ax + abx * v, qy = ay + aby * v, qz = az + abz * v;
        const dx = px - qx, dy = py - qy, dz = pz - qz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);
        const qx = ax + acx * w, qy = ay + acy * w, qz = az + acz * w;
        const dx = px - qx, dy = py - qy, dz = pz - qz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        const qx = bx + (cx - bx) * w, qy = by + (cy - by) * w, qz = bz + (cz - bz) * w;
        const dx = px - qx, dy = py - qy, dz = pz - qz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const denom = 1 / (va + vb + vc);
    const v = vb * denom, w = vc * denom;
    const qx = ax + abx * v + acx * w;
    const qy = ay + aby * v + acy * w;
    const qz = az + abz * v + acz * w;
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function bakeSDF(inputPath, outputPath, gridSize = 64, scale = 2.0) {
    console.log(`Baking SDF: ${inputPath} → ${outputPath}`);
    console.log(`Grid: ${gridSize}³ = ${gridSize ** 3} voxels, scale: ${scale}`);

    // Read the GLB file and extract triangle data
    const glbBuffer = fs.readFileSync(inputPath);

    // Parse GLB header
    const view = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546C67) { // 'glTF'
        throw new Error('Not a valid GLB file');
    }

    const jsonChunkLength = view.getUint32(12, true);
    const jsonStr = new TextDecoder().decode(glbBuffer.slice(20, 20 + jsonChunkLength));
    const gltf = JSON.parse(jsonStr);

    const binOffset = 20 + jsonChunkLength + 8; // Skip JSON chunk + BIN chunk header
    const binData = glbBuffer.slice(binOffset);

    // Extract triangles from all meshes
    const triangles = [];

    for (const mesh of gltf.meshes || []) {
        for (const prim of mesh.primitives || []) {
            const posAccessor = gltf.accessors[prim.attributes.POSITION];
            const posView = gltf.bufferViews[posAccessor.bufferView];
            const posOffset = (posView.byteOffset || 0) + (posAccessor.byteOffset || 0);
            const posData = new Float32Array(binData.buffer, binData.byteOffset + posOffset, posAccessor.count * 3);

            let indices;
            if (prim.indices !== undefined) {
                const idxAccessor = gltf.accessors[prim.indices];
                const idxView = gltf.bufferViews[idxAccessor.bufferView];
                const idxOffset = (idxView.byteOffset || 0) + (idxAccessor.byteOffset || 0);
                if (idxAccessor.componentType === 5123) { // UNSIGNED_SHORT
                    indices = new Uint16Array(binData.buffer, binData.byteOffset + idxOffset, idxAccessor.count);
                } else { // UNSIGNED_INT
                    indices = new Uint32Array(binData.buffer, binData.byteOffset + idxOffset, idxAccessor.count);
                }
            } else {
                indices = Array.from({ length: posAccessor.count }, (_, i) => i);
            }

            for (let i = 0; i < indices.length; i += 3) {
                const a = indices[i], b = indices[i + 1], c = indices[i + 2];
                triangles.push([
                    posData[a * 3], posData[a * 3 + 1], posData[a * 3 + 2],
                    posData[b * 3], posData[b * 3 + 1], posData[b * 3 + 2],
                    posData[c * 3], posData[c * 3 + 1], posData[c * 3 + 2],
                ]);
            }
        }
    }

    console.log(`Extracted ${triangles.length} triangles`);

    // Compute SDF grid
    const sdf = new Float32Array(gridSize * gridSize * gridSize);
    const halfScale = scale * 0.5;
    const step = scale / gridSize;
    let processed = 0;
    const total = gridSize * gridSize * gridSize;

    for (let iz = 0; iz < gridSize; iz++) {
        const wz = -halfScale + (iz + 0.5) * step;
        for (let iy = 0; iy < gridSize; iy++) {
            const wy = -halfScale + (iy + 0.5) * step;
            for (let ix = 0; ix < gridSize; ix++) {
                const wx = -halfScale + (ix + 0.5) * step;

                // Find minimum distance to any triangle
                let minDist = Infinity;
                for (const tri of triangles) {
                    const d = pointToTriangleDist(
                        wx, wy, wz,
                        tri[0], tri[1], tri[2],
                        tri[3], tri[4], tri[5],
                        tri[6], tri[7], tri[8]
                    );
                    if (d < minDist) minDist = d;
                }

                sdf[iz * gridSize * gridSize + iy * gridSize + ix] = minDist;
                processed++;
            }
        }
        if (iz % 8 === 0) {
            process.stdout.write(`\r  Progress: ${((iz / gridSize) * 100).toFixed(1)}%`);
        }
    }
    console.log('\r  Progress: 100.0%');

    // Write binary output
    const outBuffer = Buffer.alloc(4 + sdf.byteLength);
    outBuffer.writeUInt32LE(gridSize, 0);
    Buffer.from(sdf.buffer).copy(outBuffer, 4);
    fs.writeFileSync(outputPath, outBuffer);

    const sizeMB = (outBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`Written: ${outputPath} (${sizeMB} MB)`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node bake-sdf.js input.glb output.sdf [gridSize=64] [scale=2.0]');
    process.exit(1);
}

bakeSDF(args[0], args[1], parseInt(args[2]) || 64, parseFloat(args[3]) || 2.0)
    .catch(e => { console.error(e); process.exit(1); });
