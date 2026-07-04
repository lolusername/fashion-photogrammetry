import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type LoadedDress = {
  root: THREE.Group;
  dress: THREE.Object3D;
  arms: THREE.Object3D;
  bounds: THREE.Box3;
  focus: THREE.Vector3;
};

const TARGET_MODEL_HEIGHT = 2.55;

export async function loadDress(url = '/dress.glb', onStage?: (stage: string) => void): Promise<LoadedDress> {
  const loader = new GLTFLoader();
  onStage?.('Fetching dress');
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${url}: ${response.status} ${response.statusText}`);
  }

  onStage?.('Reading dress');
  const buffer = await response.arrayBuffer();
  onStage?.('Parsing dress');
  const gltf = await loader.parseAsync(buffer, '/');
  onStage?.('Framing dress');
  const root = gltf.scene;

  onStage?.('Finding dress parts');
  const dress = root.getObjectByName('dress');
  const arms = root.getObjectByName('arms');

  if (!dress || !arms) {
    const foundNames: string[] = [];
    root.traverse((object) => {
      if (object.name) {
        foundNames.push(object.name);
      }
    });
    throw new Error(`Expected GLB nodes named "dress" and "arms". Found: ${foundNames.join(', ')}`);
  }

  onStage?.('Preparing dress materials');
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      material.needsUpdate = true;
    });
  });

  onStage?.('Measuring dress');
  root.updateMatrixWorld(true);

  const originalBounds = new THREE.Box3().setFromObject(root);
  onStage?.('Scaling dress');
  const originalCenter = originalBounds.getCenter(new THREE.Vector3());
  const originalSize = originalBounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error('Could not compute a usable bounding box for dress.glb.');
  }

  const scale = TARGET_MODEL_HEIGHT / maxDimension;
  root.scale.setScalar(scale);
  root.position.copy(originalCenter).multiplyScalar(-scale);
  root.updateMatrixWorld(true);

  onStage?.('Grounding dress');
  const centeredBounds = new THREE.Box3().setFromObject(root);
  const groundOffset = -centeredBounds.min.y;
  root.position.y += groundOffset;
  root.updateMatrixWorld(true);

  onStage?.('Final bounds');
  const bounds = centeredBounds.clone().translate(new THREE.Vector3(0, groundOffset, 0));
  const focus = bounds.getCenter(new THREE.Vector3());
  focus.y = bounds.min.y + bounds.getSize(new THREE.Vector3()).y * 0.54;

  return {
    root,
    dress,
    arms,
    bounds,
    focus,
  };
}
