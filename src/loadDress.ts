import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * GLB / GLTF LOADING AND NORMALIZATION
 * ====================================
 *
 * glTF is a scene format, not merely a mesh format. One file may contain a
 * hierarchy of Groups, Meshes, SkinnedMeshes, bones, animations, cameras,
 * textures, and materials. GLB is the binary single-file packaging of glTF.
 *
 * The application cannot assume two museum scans share:
 * - the same unit scale,
 * - the same origin/pivot,
 * - the same internal hierarchy, or
 * - the same material count.
 *
 * This module establishes one contract for the rest of the app:
 * 1. load and parse the file,
 * 2. find required named parts,
 * 3. scale the whole imported scene to a standard maximum dimension,
 * 4. center it around the origin,
 * 5. move its lowest point to Y=0 ("grounding"), and
 * 6. return stable bounds and a useful camera focus point.
 *
 * The returned `root` preserves the complete imported hierarchy. The `dress`
 * and `arms` references point into that hierarchy; changing the root transform
 * therefore also moves those parts.
 */

export type LoadedDress = {
  // Complete imported glTF scene.
  root: THREE.Group;
  // Named subtrees used by the fabric wind and arm glow systems.
  dress: THREE.Object3D;
  arms: THREE.Object3D;
  // Final normalized world-space bounds.
  bounds: THREE.Box3;
  // Camera/control target chosen slightly above geometric center.
  focus: THREE.Vector3;
};

// This is a world-space art-direction size, not necessarily literal meters.
// The loader scales the model's largest X/Y/Z dimension to this value.
const TARGET_MODEL_HEIGHT = 2.55;

export async function loadDress(url = '/dress.glb', onStage?: (stage: string) => void): Promise<LoadedDress> {
  const loader = new GLTFLoader();

  // Fetch manually rather than calling loader.loadAsync(url) so the UI can show
  // separate network, binary-read, parse, and framing progress messages.
  onStage?.('Fetching dress');
  const response = await fetch(url);

  if (!response.ok) {
    // HTTP fetch resolves even for 404/500 responses; `ok` must be checked.
    throw new Error(`Could not load ${url}: ${response.status} ${response.statusText}`);
  }

  onStage?.('Reading dress');
  const buffer = await response.arrayBuffer();
  onStage?.('Parsing dress');
  // The second argument is the path used to resolve external resources. GLB
  // usually embeds them, but '/' is a safe base for any relative references.
  const gltf = await loader.parseAsync(buffer, '/');
  onStage?.('Framing dress');
  const root = gltf.scene;

  onStage?.('Finding dress parts');
  // Node names are the deliberate interface between the modeling/export
  // pipeline and this application. They must survive export exactly.
  const dress = root.getObjectByName('dress');
  const arms = root.getObjectByName('arms');

  if (!dress || !arms) {
    const foundNames: string[] = [];
    // `traverse` performs a depth-first visit over every descendant, which
    // produces a useful diagnostic when the expected node contract is broken.
    root.traverse((object) => {
      if (object.name) {
        foundNames.push(object.name);
      }
    });
    throw new Error(`Expected GLB nodes named "dress" and "arms". Found: ${foundNames.join(', ')}`);
  }

  onStage?.('Preparing dress materials');
  root.traverse((object) => {
    // Object3D is a base class. Runtime flags such as isMesh are safer than
    // `instanceof` when multiple bundled copies of Three.js could exist.
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // A Mesh can use one material for every triangle or an array selected by
    // geometry groups. Normalizing to an array keeps the loop uniform.
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      material.needsUpdate = true;
    });
  });

  onStage?.('Measuring dress');
  // Bounding boxes use world matrices. Force an update because the imported
  // hierarchy may not have rendered yet and therefore may contain stale matrix
  // products.
  root.updateMatrixWorld(true);

  // setFromObject visits visible descendant geometry and expands an axis-aligned
  // world-space box around it.
  const originalBounds = new THREE.Box3().setFromObject(root);
  onStage?.('Scaling dress');
  const originalCenter = originalBounds.getCenter(new THREE.Vector3());
  const originalSize = originalBounds.getSize(new THREE.Vector3());
  // Largest-dimension normalization is robust to unusual model orientation. It
  // also explains why silhouettes may still need theme-specific scale tuning:
  // two models can share the same max dimension but distribute visual mass very
  // differently.
  const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error('Could not compute a usable bounding box for dress.glb.');
  }

  const scale = TARGET_MODEL_HEIGHT / maxDimension;
  root.scale.setScalar(scale);
  // Centering math:
  // - originalCenter is in pre-scaled coordinates,
  // - multiplying it by -scale computes the translation that places it at 0
  //   after the new root scale is applied.
  root.position.copy(originalCenter).multiplyScalar(-scale);
  root.updateMatrixWorld(true);

  onStage?.('Grounding dress');
  const centeredBounds = new THREE.Box3().setFromObject(root);
  // If the lowest Y is -0.37, adding +0.37 puts it exactly on Y=0.
  const groundOffset = -centeredBounds.min.y;
  root.position.y += groundOffset;
  root.updateMatrixWorld(true);

  onStage?.('Final bounds');
  const bounds = centeredBounds.clone().translate(new THREE.Vector3(0, groundOffset, 0));
  const focus = bounds.getCenter(new THREE.Vector3());
  // Pure box center can aim too low on a long dress. 54% places the visual
  // target around the torso while still adapting to either model's bounds.
  focus.y = bounds.min.y + bounds.getSize(new THREE.Vector3()).y * 0.54;

  return {
    root,
    dress,
    arms,
    bounds,
    focus,
  };
}
