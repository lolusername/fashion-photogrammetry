import * as THREE from 'three';

import {
  PHOTO_PRINT_BURST_INTERVAL,
  PHOTO_PRINT_CARD_HEIGHT,
  PHOTO_PRINT_CARD_WIDTH,
  PHOTO_PRINT_DISCARD_Y,
  PHOTO_PRINT_DRESS_CLEARANCE_NDC,
  PHOTO_PRINT_FLOOR_Y,
  PHOTO_PRINT_GRAVITY,
  PHOTO_PRINT_IMAGE_HEIGHT,
  PHOTO_PRINT_IMAGE_URLS,
  PHOTO_PRINT_IMAGE_WIDTH,
  PHOTO_PRINT_LAYER_GAP,
  PHOTO_PRINT_MIN_POINTER_DISTANCE,
  PHOTO_PRINT_SPAWN_Z,
  PHOTO_PRINT_SURFACE_TILT,
} from '../../app/experienceConstants';
import type { FullDressRecord, PhotoPrintParticle, PointerWindState, ScreenSpaceBounds } from '../../app/experienceTypes';
import type { DressAssetId } from '../../config/dresses';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import { clamp01, clampSigned, randomBetween } from '../../utils/math';
import { ResourceTracker } from '../resourceTracker';

export type PhotoPrintSystemOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  resources: ResourceTracker;
  getThemeId: () => CycloramaBackgroundPresetId;
  getFullDresses: () => Map<DressAssetId, FullDressRecord>;
  getPointerWind: () => PointerWindState;
  isMobileViewport: () => boolean;
};

export class PhotoPrintSystem {
  readonly group = new THREE.Group();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: HTMLElement;
  private readonly resources: ResourceTracker;
  private readonly getThemeId: () => CycloramaBackgroundPresetId;
  private readonly getFullDresses: () => Map<DressAssetId, FullDressRecord>;
  private readonly getPointerWind: () => PointerWindState;
  private readonly isMobileViewport: () => boolean;
  private cardGeometry: THREE.PlaneGeometry | null = null;
  private imageGeometry: THREE.PlaneGeometry | null = null;
  private shadowGeometry: THREE.PlaneGeometry | null = null;
  private readonly particles: PhotoPrintParticle[] = [];
  private readonly textures: THREE.Texture[] = [];
  private layerCounter = 0;
  private readonly spawnRaycaster = new THREE.Raycaster();
  private readonly spawnNdc = new THREE.Vector2();
  private readonly spawnPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PHOTO_PRINT_SPAWN_Z);
  private readonly spawnPosition = new THREE.Vector3();
  private readonly dressRaycaster = new THREE.Raycaster();
  private readonly dressPointer = new THREE.Vector2();
  private readonly dressWorldBounds = new THREE.Box3();
  private readonly projectionPoint = new THREE.Vector3();
  private readonly dressScreenBounds: ScreenSpaceBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private readonly cardScreenBounds: ScreenSpaceBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private readonly lastBurstPoint = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  private lastBurstTime = Number.NEGATIVE_INFINITY;
  private readonly pointerSample = new THREE.Vector2();

  constructor(options: PhotoPrintSystemOptions) {
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.canvas = options.canvas;
    this.stage = options.stage;
    this.resources = options.resources;
    this.getThemeId = options.getThemeId;
    this.getFullDresses = options.getFullDresses;
    this.getPointerWind = options.getPointerWind;
    this.isMobileViewport = options.isMobileViewport;
    this.initialize(options.scene);
  }

  get count() {
    return this.particles.length;
  }

  private initialize(targetScene: THREE.Scene) {
    // -------------------------------------------------------------------------
    // WIND ARCHIVE PRINT-PARTICLE SYSTEM
    // -------------------------------------------------------------------------
    // This is a small CPU particle system. Each particle is a Group containing
    // three ordinary meshes: shadow, white paper, and image. The CPU updates
    // transforms; the GPU rasterizes their shared plane geometries.
      this.group.name = 'wind archive falling photo prints';
    this.group.visible = this.getThemeId() === 'tabla-rasa';
    targetScene.add(this.group);
  
    // Geometry is shared by every print. Reusing BufferGeometry avoids creating
    // duplicate GPU vertex/index buffers on every pointer movement.
    this.cardGeometry = this.resources.trackGeometry(new THREE.PlaneGeometry(PHOTO_PRINT_CARD_WIDTH, PHOTO_PRINT_CARD_HEIGHT));
    this.imageGeometry = this.resources.trackGeometry(new THREE.PlaneGeometry(PHOTO_PRINT_IMAGE_WIDTH, PHOTO_PRINT_IMAGE_HEIGHT));
    this.shadowGeometry = this.resources.trackGeometry(
      new THREE.PlaneGeometry(PHOTO_PRINT_CARD_WIDTH * 1.015, PHOTO_PRINT_CARD_HEIGHT * 1.015),
    );
    PHOTO_PRINT_IMAGE_URLS.forEach((url) => {
      this.textures.push(this.loadTexture(url));
    });
  }

  private loadTexture(url: string) {
    const texture = this.resources.trackTexture(new THREE.TextureLoader().load(url));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  maybeSpawn(
    x: number,
    y: number,
    movementX: number,
    movementY: number,
    now: number,
  ) {
    if (!this.isActiveTheme() || !this.group || this.textures.length === 0) {
      return;
    }
  
    if (this.isPointerOverVisibleDress(x, y)) {
      return;
    }
  
    // Time throttling avoids a burst on every browser event; distance throttling
    // ignores tiny hand jitter. Both are measured in normalized pointer space.
    const distance = this.lastBurstPoint.distanceTo(this.pointerSample.set(x, y));
    const elapsed = now - this.lastBurstTime;
    const movementSpeed = Math.hypot(movementX, movementY);
  
    if (elapsed < PHOTO_PRINT_BURST_INTERVAL || distance < PHOTO_PRINT_MIN_POINTER_DISTANCE) {
      return;
    }
  
    if (movementSpeed < 0.08) {
      return;
    }
  
    this.getSpawnPosition(x, y, this.spawnPosition);
    this.spawn(this.spawnPosition, movementX, movementY);
  
    this.lastBurstPoint.set(x, y);
    this.lastBurstTime = now;
  }

  private isPointerOverVisibleDress(x: number, y: number) {
    // Convert browser-normalized 0..1 coordinates to WebGL normalized device
    // coordinates (-1..+1, with positive Y upward).
    this.dressPointer.set(x * 2 - 1, y * 2 - 1);
    // setFromCamera builds a world-space ray beginning at the camera and passing
    // through this screen point.
    this.dressRaycaster.setFromCamera(this.dressPointer, this.camera);
  
    for (const record of this.getFullDresses().values()) {
      if (!record.pivot.visible) {
        continue;
      }
  
      record.loaded.dress.updateMatrixWorld(true);
      const intersections = this.dressRaycaster.intersectObject(record.loaded.dress, true);
      if (intersections.some((intersection) => (intersection.object as THREE.Mesh).isMesh)) {
        return true;
      }
    }
  
    return false;
  }

  private getSpawnPosition(x: number, y: number, target: THREE.Vector3) {
    this.spawnNdc.set(x * 2 - 1, y * 2 - 1);
    this.spawnRaycaster.setFromCamera(this.spawnNdc, this.camera);
  
    // Ray-plane intersection turns the 2D pointer into a 3D point at the chosen
    // spawn depth. The fallback handles a theoretically parallel ray.
    if (!this.spawnRaycaster.ray.intersectPlane(this.spawnPlane, target)) {
      target.set((x - 0.5) * 4.6, 1.8 + (y - 0.5) * 2.2, PHOTO_PRINT_SPAWN_Z);
    }
  
    const spawnDepth = Math.abs(this.camera.position.z - PHOTO_PRINT_SPAWN_Z);
    const visibleHalfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * spawnDepth;
    const visibleHalfWidth = visibleHalfHeight * this.camera.aspect;
    target.x = THREE.MathUtils.clamp(target.x, -visibleHalfWidth * 0.86, visibleHalfWidth * 0.86);
    // Project back to normalized screen space so prints can be biased toward the
    // side fields instead of appearing on top of the central dress.
    this.projectionPoint.copy(target).project(this.camera);
    const desiredScreenX = x < 0.5 ? -0.66 : 0.66;
    target.x += (desiredScreenX - this.projectionPoint.x) * visibleHalfWidth;
    target.y = THREE.MathUtils.clamp(target.y, 0.72, 3.38);
    target.z = PHOTO_PRINT_SPAWN_Z;
  }

  private spawn(position: THREE.Vector3, movementX: number, movementY: number) {
    if (!this.group || !this.cardGeometry || !this.imageGeometry || !this.shadowGeometry) {
      return;
    }
  
    const texture = this.textures[Math.floor(Math.random() * this.textures.length)];
    const root = new THREE.Group();
    const seed = Math.random() * Math.PI * 2;
    const layer = this.layerCounter++;
    // Reserve three consecutive render-order slots per print. Later prints have
    // higher slots and therefore stack cleanly above earlier prints.
    const layerRenderOrder = 10 + layer * 3;
    const baseScale = this.canvas.clientWidth < 420
      ? randomBetween(0.46, 0.68)
      : this.isMobileViewport()
      ? randomBetween(0.58, 0.84)
      : randomBetween(0.72, 1);
    const windLength = Math.max(0.001, Math.hypot(movementX, movementY));
    const windDirX = movementX / windLength;
    const windDirY = movementY / windLength;
    const jitter = new THREE.Vector3(-windDirX * 0.18 + randomBetween(-0.035, 0.035), -windDirY * 0.1 + randomBetween(-0.03, 0.04), randomBetween(-0.06, 0.08));
  
    root.position.copy(position).add(jitter);
    const windHeading = Math.atan2(windDirY, windDirX);
    root.rotation.set(
      randomBetween(-1.45, 1.45),
      randomBetween(-1.08, 1.08),
      windHeading + randomBetween(-0.72, 0.72),
    );
    root.scale.setScalar(baseScale);
    root.renderOrder = layerRenderOrder;
  
    // MeshBasicMaterial ignores lights. That keeps print paper and photographs
    // visually consistent as they cross differently lit regions of the scene.
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const cardMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const imageMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
  
    const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
    shadow.position.set(0.014, -0.016, -0.012);
    shadow.renderOrder = layerRenderOrder;
    const card = new THREE.Mesh(this.cardGeometry, cardMaterial);
    card.renderOrder = layerRenderOrder + 1;
    const image = new THREE.Mesh(this.imageGeometry, imageMaterial);
    image.position.set(0, 0, 0.01);
    image.renderOrder = layerRenderOrder + 2;
    root.add(shadow, card, image);
    this.group.add(root);
  
    const windX = clampSigned(movementX * 0.064, 1.45);
    const windY = clampSigned(movementY * 0.058, 0.94);
    const lift = randomBetween(0.36, 0.72) + Math.max(0, windY * 0.18);
    // Quaternions compose rotations without Euler-order ambiguity. First tip the
    // card onto the common floor, then rotate it within that plane.
    const restQuaternion = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), PHOTO_PRINT_SURFACE_TILT)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          windHeading + randomBetween(-0.5, 0.5),
        ),
      );
  
    this.particles.push({
      root,
      velocity: new THREE.Vector3(
        windX + windDirX * randomBetween(0.22, 0.58) + randomBetween(-0.08, 0.08),
        lift,
        randomBetween(-0.34, -0.1) + Math.abs(windX) * 0.035,
      ),
      angularVelocity: new THREE.Vector3(
        randomBetween(-2.6, 2.6) + windY * 0.35,
        randomBetween(-2.1, 2.1) + windX * 0.28,
        windX * 1.2 + randomBetween(-1.45, 1.45),
      ),
      restQuaternion,
      age: 0,
      floorY: PHOTO_PRINT_FLOOR_Y + layer * PHOTO_PRINT_LAYER_GAP,
      floorContactAge: null,
      discarding: false,
      baseScale,
      seed,
      materials: [
        { material: shadowMaterial, opacity: 0.12 },
        { material: cardMaterial, opacity: 1 },
        { material: imageMaterial, opacity: 0.98 },
      ],
    });
    this.stage.dataset.photoPrintCount = String(this.particles.length);
  }

  update(delta: number, time: number) {
    if (!this.isActiveTheme()) {
      return;
    }
  
    if (this.particles.length === 0) {
      return;
    }
  
    const hasProtectedDressArea = this.getVisibleDressScreenBounds(this.dressScreenBounds);
  
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      // Iterate backward because removing an item splices the array. Forward
      // iteration would skip the next particle after a removal.
      const particle = this.particles[index];
      particle.age += delta;
  
      const floorSettled = particle.floorContactAge !== null;
      if (particle.discarding) {
        // Semi-implicit Euler integration: update velocity from gravity, then
        // update position from the new velocity.
        particle.velocity.y -= PHOTO_PRINT_GRAVITY * delta;
        particle.root.position.addScaledVector(particle.velocity, delta);
        particle.root.rotation.x += particle.angularVelocity.x * delta;
        particle.root.rotation.y += particle.angularVelocity.y * delta;
        particle.root.rotation.z += particle.angularVelocity.z * delta;
      } else {
        particle.velocity.x += (
          this.getPointerWind().wind.x * (floorSettled ? 0.035 : 0.26)
          + Math.sin(time * 4.8 + particle.seed) * (floorSettled ? 0.012 : 0.07)
        ) * delta;
        particle.velocity.z += (
          this.getPointerWind().wind.z * (floorSettled ? 0.02 : 0.18)
          + Math.cos(time * 3.9 + particle.seed) * (floorSettled ? 0.006 : 0.035)
        ) * delta;
  
        if (!floorSettled || particle.velocity.y > 0) {
          particle.velocity.y += (this.getPointerWind().wind.y * 0.08 - PHOTO_PRINT_GRAVITY) * delta;
        }
  
        particle.root.position.addScaledVector(particle.velocity, delta);
  
        if (particle.root.position.y <= particle.floorY) {
          // Resolve collision against an invisible horizontal coordinate: prevent
          // penetration and cancel only the downward component.
          particle.root.position.y = particle.floorY;
          if (particle.floorContactAge === null) {
            particle.floorContactAge = 0;
          }
          if (particle.velocity.y < 0) {
            particle.velocity.y = 0;
          }
        }
  
        if (particle.floorContactAge !== null) {
          particle.floorContactAge += delta;
          const floorFriction = Math.exp(-delta * 5.8);
          particle.velocity.x *= floorFriction;
          particle.velocity.z *= floorFriction;
          particle.velocity.y = 0;
          particle.root.position.y = particle.floorY;
          particle.angularVelocity.multiplyScalar(Math.exp(-delta * 4.8));
          // Spherical linear interpolation takes the shortest smooth path between
          // orientations. Exponential t keeps settling speed frame-rate neutral.
          particle.root.quaternion.slerp(particle.restQuaternion, 1 - Math.exp(-delta * 7.2));
        } else {
          particle.velocity.multiplyScalar(Math.exp(-delta * 0.08));
          particle.root.rotation.x += particle.angularVelocity.x * delta;
          particle.root.rotation.y += particle.angularVelocity.y * delta;
          particle.root.rotation.z += particle.angularVelocity.z * delta;
        }
      }
  
      const fadeIn = clamp01(particle.age / 0.16);
      const opacity = fadeIn;
      particle.root.scale.setScalar(particle.baseScale * (0.84 + fadeIn * 0.16));
  
      particle.materials.forEach(({ material, opacity: baseOpacity }) => {
        material.opacity = opacity * baseOpacity;
      });
  
      const overlapsDress = hasProtectedDressArea
        && this.doesPrintOverlapScreenBounds(particle.root, this.dressScreenBounds);
  
      if (overlapsDress && !particle.discarding) {
        // "Do not obscure the garment" is an editorial screen-space rule. Convert
        // an offending print into a disposable falling particle.
        const outwardDirection = particle.root.position.x >= 0 ? 1 : -1;
        particle.discarding = true;
        particle.floorContactAge = null;
        particle.velocity.set(
          outwardDirection * randomBetween(0.48, 0.82),
          randomBetween(-0.82, -0.56),
          randomBetween(-0.08, 0.12),
        );
        particle.angularVelocity.set(
          randomBetween(-1.8, 1.8),
          randomBetween(-1.4, 1.4),
          outwardDirection * randomBetween(0.8, 1.8),
        );
      }
  
      particle.root.visible = !overlapsDress;
  
      if (particle.discarding) {
        this.projectionPoint.copy(particle.root.position).project(this.camera);
        const outsideViewport = (
          Math.abs(this.projectionPoint.x) > 1.4
          || this.projectionPoint.y < -1.35
        );
        if (particle.root.position.y < PHOTO_PRINT_DISCARD_Y || outsideViewport) {
          this.removeParticle(index);
        }
      }
    }
    this.stage.dataset.photoPrintVisible = String(
      this.particles.filter((particle) => particle.root.visible).length,
    );
    this.stage.dataset.photoPrintSettled = String(
      this.particles.filter((particle) => particle.floorContactAge !== null).length,
    );
    this.stage.dataset.photoPrintDiscarding = String(
      this.particles.filter((particle) => particle.discarding).length,
    );
  }

  private resetScreenSpaceBounds(bounds: ScreenSpaceBounds) {
    bounds.minX = Number.POSITIVE_INFINITY;
    bounds.maxX = Number.NEGATIVE_INFINITY;
    bounds.minY = Number.POSITIVE_INFINITY;
    bounds.maxY = Number.NEGATIVE_INFINITY;
  }

  private expandScreenSpaceBounds(bounds: ScreenSpaceBounds, point: THREE.Vector3) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }

  private getVisibleDressScreenBounds(target: ScreenSpaceBounds) {
    // This collision is intentionally screen-space, not physical world-space:
    // two separated 3D objects can still overlap in the final camera view.
    this.resetScreenSpaceBounds(target);
    this.camera.updateMatrixWorld();
    let hasBounds = false;
  
    for (const record of this.getFullDresses().values()) {
      if (!record.pivot.visible) {
        continue;
      }
  
      // Box3 is a world-space axis-aligned bounding box. Projecting its eight
      // corners produces a conservative 2D rectangle around the dress.
      this.dressWorldBounds.setFromObject(record.loaded.dress);
      if (this.dressWorldBounds.isEmpty()) {
        continue;
      }
  
      const { min, max } = this.dressWorldBounds;
      for (let corner = 0; corner < 8; corner += 1) {
        this.projectionPoint
          .set(
            corner & 1 ? max.x : min.x,
            corner & 2 ? max.y : min.y,
            corner & 4 ? max.z : min.z,
          )
          .project(this.camera);
        if (Number.isFinite(this.projectionPoint.x) && Number.isFinite(this.projectionPoint.y)) {
          this.expandScreenSpaceBounds(target, this.projectionPoint);
          hasBounds = true;
        }
      }
    }
  
    return hasBounds;
  }

  private doesPrintOverlapScreenBounds(root: THREE.Group, dressBounds: ScreenSpaceBounds) {
    // Transform the card's four local corners through its complete world matrix,
    // project them through the camera, then perform a rectangle overlap test.
    this.resetScreenSpaceBounds(this.cardScreenBounds);
    root.updateMatrixWorld(true);
  
    for (let corner = 0; corner < 4; corner += 1) {
      this.projectionPoint
        .set(
          corner & 1 ? PHOTO_PRINT_CARD_WIDTH * 0.5 : PHOTO_PRINT_CARD_WIDTH * -0.5,
          corner & 2 ? PHOTO_PRINT_CARD_HEIGHT * 0.5 : PHOTO_PRINT_CARD_HEIGHT * -0.5,
          0,
        )
        .applyMatrix4(root.matrixWorld)
        .project(this.camera);
      this.expandScreenSpaceBounds(this.cardScreenBounds, this.projectionPoint);
    }
  
    return (
      this.cardScreenBounds.maxX >= dressBounds.minX - PHOTO_PRINT_DRESS_CLEARANCE_NDC
      && this.cardScreenBounds.minX <= dressBounds.maxX + PHOTO_PRINT_DRESS_CLEARANCE_NDC
      && this.cardScreenBounds.maxY >= dressBounds.minY - PHOTO_PRINT_DRESS_CLEARANCE_NDC
      && this.cardScreenBounds.minY <= dressBounds.maxY + PHOTO_PRINT_DRESS_CLEARANCE_NDC
    );
  }

  private removeParticle(index: number) {
    const [particle] = this.particles.splice(index, 1);
    if (!particle) {
      return;
    }
  
    if (particle.root.parent) {
      particle.root.parent.remove(particle.root);
    }
    // Removing from the scene does not free GPU memory. Per-particle materials
    // must be disposed explicitly; geometry is shared and remains alive.
    particle.materials.forEach(({ material }) => material.dispose());
    this.stage.dataset.photoPrintCount = String(this.particles.length);
  }

  clear() {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      this.removeParticle(index);
    }
    this.layerCounter = 0;
    this.lastBurstTime = Number.NEGATIVE_INFINITY;
    this.lastBurstPoint.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    this.stage.dataset.photoPrintSettled = '0';
    this.stage.dataset.photoPrintDiscarding = '0';
  }

  private isActiveTheme() {
    return this.getThemeId() === 'tabla-rasa';
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
