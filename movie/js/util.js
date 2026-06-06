import * as THREE from 'three';
import { COL } from './config.js';

// A mesh wrapped together with its edge lines, so the silhouette reads on the
// flat-shaded geometry. Shared by world.js and landmarks.js.
export function edged(mesh, color = COL.edge, opacity = 0.5) {
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale);
  const g = new THREE.Group();
  g.add(mesh, e);
  g.userData.edge = e.material;
  return g;
}
