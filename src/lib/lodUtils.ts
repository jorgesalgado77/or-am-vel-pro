/**
 * LOD (Level of Detail) utilities for 3D models.
 * Creates simplified geometry for meshes with high vertex counts.
 */

const HIGH_POLY_THRESHOLD = 50000;
const LOD_DISTANCES = [0, 15, 30]; // near, mid, far

/**
 * Apply LOD to heavy meshes in a scene graph.
 * Replaces meshes with >50k vertices with THREE.LOD objects containing
 * original + simplified versions.
 */
export function applyLOD(THREE: any, root: any) {
  const heavyMeshes: any[] = [];

  root.traverse((child: any) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const vertexCount = child.geometry.attributes.position.count;
    if (vertexCount > HIGH_POLY_THRESHOLD) {
      heavyMeshes.push(child);
    }
  });

  if (heavyMeshes.length === 0) return;

  // Dynamic import of mergeVertices
  const { mergeVertices } = require("three/examples/jsm/utils/BufferGeometryUtils.js");

  for (const mesh of heavyMeshes) {
    const parent = mesh.parent;
    if (!parent) continue;

    const lod = new THREE.LOD();
    lod.name = mesh.name;
    lod.position.copy(mesh.position);
    lod.rotation.copy(mesh.rotation);
    lod.scale.copy(mesh.scale);
    lod.userData = { ...mesh.userData };

    // Level 0: Original (high detail)
    const highDetail = mesh.clone();
    highDetail.position.set(0, 0, 0);
    highDetail.rotation.set(0, 0, 0);
    highDetail.scale.set(1, 1, 1);
    lod.addLevel(highDetail, LOD_DISTANCES[0]);

    // Level 1: Merged vertices (medium detail)
    try {
      const midGeo = mergeVertices(mesh.geometry.clone(), 0.01);
      midGeo.computeVertexNormals();
      const midMesh = new THREE.Mesh(midGeo, mesh.material);
      midMesh.name = `${mesh.name}_mid`;
      midMesh.userData = { ...mesh.userData };
      lod.addLevel(midMesh, LOD_DISTANCES[1]);
    } catch {
      // Fallback: use original for mid level too
      lod.addLevel(mesh.clone(), LOD_DISTANCES[1]);
    }

    // Level 2: Aggressively merged (low detail)
    try {
      const lowGeo = mergeVertices(mesh.geometry.clone(), 0.05);
      lowGeo.computeVertexNormals();
      const lowMesh = new THREE.Mesh(lowGeo, mesh.material);
      lowMesh.name = `${mesh.name}_low`;
      lowMesh.userData = { ...mesh.userData };
      lod.addLevel(lowMesh, LOD_DISTANCES[2]);
    } catch {
      // Skip low level
    }

    parent.add(lod);
    parent.remove(mesh);
  }
}
