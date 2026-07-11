import * as THREE from 'three';

import { CYCLO_BACK_Z } from '../../app/experienceConstants';
import type { HoloSculptureMotion, PointerWindState } from '../../app/experienceTypes';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import { clamp01 } from '../../utils/math';
import { ResourceTracker } from '../resourceTracker';
import { HoloMaterialFactory } from './holoMaterialFactory';

export type HoloSculptureSystemOptions = {
  scene: THREE.Scene;
  resources: ResourceTracker;
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  getPointerWind: () => PointerWindState;
};

export class HoloSculptureSystem {
  readonly holoAccentGroup: THREE.Group;
  readonly ivorySculptureGroup: THREE.Group;
  readonly signalBlackGroup: THREE.Group;

  private readonly resources: ResourceTracker;
  private readonly camera: THREE.Camera;
  private readonly getPointerWind: () => PointerWindState;
  private readonly materials: HoloMaterialFactory;
  private readonly motions: HoloSculptureMotion[] = [];
  private readonly worldPosition = new THREE.Vector3();
  private readonly screenPosition = new THREE.Vector2();
  private readonly cursorDelta = new THREE.Vector2();
  private readonly awayFromCursor = new THREE.Vector2();
  private readonly windForce = new THREE.Vector3();
  private readonly targetOffset = new THREE.Vector3();
  private readonly offsetDelta = new THREE.Vector3();
  private readonly targetAngularOffset = new THREE.Vector3();
  private readonly angularDelta = new THREE.Vector3();

  constructor(options: HoloSculptureSystemOptions) {
    this.resources = options.resources;
    this.camera = options.camera;
    this.getPointerWind = options.getPointerWind;
    this.materials = new HoloMaterialFactory(options.resources, options.renderer);
    this.holoAccentGroup = this.addMewHoloAccents(options.scene);
    this.ivorySculptureGroup = this.addIvoryHoloSculptures(options.scene);
    this.signalBlackGroup = this.addSignalBlackAccents(options.scene);
  }

  applyPalette(presetId: CycloramaBackgroundPresetId) {
    this.materials.applyAccentPalette(this.holoAccentGroup, presetId);
  }

  private addSignalBlackAccents(targetScene: THREE.Scene) {
    const group = new THREE.Group();
    group.name = 'signal black quiet field';
    group.visible = false;
    targetScene.add(group);
    return group;
  }

  private createShardGeometry() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -0.52, -0.18, 0,
      -0.08, 0.28, 0,
      0.58, 0.12, 0,
      0.18, -0.34, 0,
    ]);
    const uvs = new Float32Array([
      0, 0,
      0.35, 1,
      1, 0.72,
      0.68, 0,
    ]);
  
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
  
    return geometry;
  }

  private createLongShardGeometry() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -0.72, -0.06, 0,
      -0.2, 0.14, 0,
      0.76, 0.06, 0,
      0.26, -0.18, 0,
    ]);
    const uvs = new Float32Array([
      0, 0.22,
      0.3, 0.92,
      1, 0.68,
      0.64, 0,
    ]);
  
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
  
    return geometry;
  }

  private addMewHoloAccents(targetScene: THREE.Scene) {
    const group = new THREE.Group();
    group.name = 'mew holo floating foil accents';
    group.visible = false;
  
    const makeMaterial = (color: number, opacity: number) => {
      const material = this.resources.trackMaterial(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      return this.materials.rememberPaletteMaterial(material, color, opacity);
    };
  
    const pink = makeMaterial(0xff22b8, 0.34);
    const green = makeMaterial(0x63ff28, 0.34);
    const yellow = makeMaterial(0xffec0f, 0.4);
    const cyan = makeMaterial(0x35f1ff, 0.3);
    const violet = makeMaterial(0x8d45ff, 0.26);
    const pearl = makeMaterial(0xfff1c4, 0.38);
  
    const shardGeometry = this.resources.trackGeometry(this.createShardGeometry());
    const longShardGeometry = this.resources.trackGeometry(this.createLongShardGeometry());
  
    const accents: Array<{
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      position: [number, number, number];
      scale: [number, number, number];
      rotation?: number;
    }> = [
      { geometry: longShardGeometry, material: pink, position: [-3.12, 1.38, CYCLO_BACK_Z + 0.18], scale: [1.25, 0.72, 1], rotation: -0.34 },
      { geometry: shardGeometry, material: green, position: [2.86, 2.08, CYCLO_BACK_Z + 0.2], scale: [0.54, 0.42, 1], rotation: 0.58 },
      { geometry: shardGeometry, material: yellow, position: [2.72, 3.28, CYCLO_BACK_Z + 0.22], scale: [0.72, 0.52, 1], rotation: -0.22 },
      { geometry: longShardGeometry, material: cyan, position: [-1.04, 3.1, CYCLO_BACK_Z + 0.2], scale: [0.78, 0.28, 1], rotation: 0.72 },
      { geometry: shardGeometry, material: violet, position: [0.96, 1.24, CYCLO_BACK_Z + 0.2], scale: [0.58, 0.46, 1], rotation: 1.12 },
      { geometry: shardGeometry, material: green, position: [-2.05, 2.62, CYCLO_BACK_Z + 0.19], scale: [0.48, 0.36, 1], rotation: -0.94 },
      { geometry: longShardGeometry, material: pearl, position: [1.75, 2.8, CYCLO_BACK_Z + 0.24], scale: [0.82, 0.28, 1], rotation: -0.68 },
      { geometry: longShardGeometry, material: pink, position: [-2.55, 3.25, CYCLO_BACK_Z + 0.25], scale: [0.68, 0.26, 1], rotation: 0.36 },
      { geometry: shardGeometry, material: yellow, position: [3.35, 1.1, CYCLO_BACK_Z + 0.23], scale: [0.42, 0.34, 1], rotation: -1.12 },
    ];
  
    accents.forEach((accent, index) => {
      const mesh = new THREE.Mesh(accent.geometry, accent.material);
      mesh.position.set(...accent.position);
      mesh.scale.set(...accent.scale);
      mesh.rotation.z = accent.rotation ?? index * 0.22;
      mesh.renderOrder = 1;
      group.add(mesh);
      this.registerMotion(
        mesh,
        0.018 + (index % 3) * 0.006,
        0.42 + (index % 4) * 0.08,
        new THREE.Vector3(0.08 + index * 0.006, 0.12 + index * 0.004, 0.1),
        index * 0.53,
      );
    });
  
    this.addMewHoloSculptures(group);
    targetScene.add(group);
    return group;
  }

  private addIvoryHoloSculptures(targetScene: THREE.Scene) {
    const group = new THREE.Group();
    group.name = 'ivory grounded holo sculptures';
    group.visible = false;
  
    const marbleMaterial = this.materials.createIvoryMarbleMaterial();
    const glossMaterial = this.materials.createIvoryGlossMaterial(0xfffbf0, 0.98);
    const translucentMaterial = this.materials.createIvoryGlossMaterial(0xcfc4b5, 0.82);
    const blobGeometry = this.resources.trackGeometry(new THREE.SphereGeometry(1, 40, 22));
  
    const fallenColumn = this.createGroundedColumnFragment(marbleMaterial, glossMaterial);
    fallenColumn.position.set(-1.18, 0.34, -0.72);
    fallenColumn.rotation.set(0.1, 0.16, -0.28);
    fallenColumn.scale.setScalar(1.58);
    group.add(fallenColumn);
  
    const largeGoop = this.createGroundedIvoryGoop(blobGeometry, glossMaterial, translucentMaterial);
    largeGoop.position.set(1.14, 0.34, -0.68);
    largeGoop.rotation.set(0, -0.24, 0);
    largeGoop.scale.setScalar(1.56);
    group.add(largeGoop);
  
    const amphora = this.createGroundedIvoryAmphora(marbleMaterial, glossMaterial);
    amphora.position.set(1.62, 0.65, -0.96);
    amphora.rotation.set(0.08, -0.52, 0.03);
    amphora.scale.setScalar(1.02);
    group.add(amphora);
  
    const lowRing = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.66, 0.075, 18, 96)), translucentMaterial);
    lowRing.position.set(-0.38, 0.18, -0.86);
    lowRing.rotation.set(Math.PI * 0.5, 0.08, 0.2);
    lowRing.scale.set(1.62, 1.02, 1);
    group.add(lowRing);
  
    const pearlStone = new THREE.Mesh(blobGeometry, glossMaterial);
    pearlStone.position.set(-1.72, 0.28, -0.98);
    pearlStone.scale.set(0.72, 0.38, 0.52);
    group.add(pearlStone);
  
    this.addIvoryGroundedSilhouettes(group);
  
    targetScene.add(group);
    return group;
  }

  private addIvoryGroundedSilhouettes(group: THREE.Group) {
    const material = this.resources.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xb8afa2,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    const softDisc = this.resources.trackGeometry(new THREE.CircleGeometry(1, 96));
    const silhouettes: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: number;
    }> = [
      { position: [-1.18, 0.022, -0.68], scale: [1.85, 0.58, 1], rotation: -0.22 },
      { position: [1.18, 0.024, -0.62], scale: [1.72, 0.72, 1], rotation: 0.12 },
      { position: [0.1, 0.02, -0.92], scale: [1.2, 0.42, 1], rotation: 0.04 },
    ];
  
    silhouettes.forEach((silhouette) => {
      const mesh = new THREE.Mesh(softDisc, material);
      mesh.position.set(...silhouette.position);
      mesh.rotation.set(-Math.PI * 0.5, 0, silhouette.rotation);
      mesh.scale.set(...silhouette.scale);
      mesh.renderOrder = -1;
      group.add(mesh);
    });
  }

  private createGroundedColumnFragment(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
    const group = new THREE.Group();
    group.name = 'grounded ivory column fragment';
    const shaft = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.22, 0.24, 1.55, 36)), marbleMaterial);
    const base = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.38, 0.42, 0.16, 52)), marbleMaterial);
    const capital = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.4, 0.28, 0.18, 52)), marbleMaterial);
    const glossSeam = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.3, 0.045, 14, 64)), glossMaterial);
  
    shaft.rotation.z = Math.PI * 0.5;
    base.rotation.z = Math.PI * 0.5;
    capital.rotation.z = Math.PI * 0.5;
    base.position.x = -0.86;
    capital.position.x = 0.86;
    glossSeam.position.set(-0.34, 0.0, 0.03);
    glossSeam.rotation.y = Math.PI * 0.5;
  
    group.add(shaft, base, capital, glossSeam);
    return group;
  }

  private createGroundedIvoryGoop(
    blobGeometry: THREE.BufferGeometry,
    glossMaterial: THREE.Material,
    translucentMaterial: THREE.Material,
  ) {
    const group = new THREE.Group();
    group.name = 'grounded ivory glossy goop';
    const blobs: Array<{ position: [number, number, number]; scale: [number, number, number]; material: THREE.Material }> = [
      { position: [0, 0.06, 0], scale: [0.72, 0.28, 0.52], material: glossMaterial },
      { position: [0.45, 0.11, 0.08], scale: [0.48, 0.34, 0.34], material: translucentMaterial },
      { position: [-0.46, 0.08, -0.12], scale: [0.52, 0.25, 0.4], material: glossMaterial },
      { position: [0.12, 0.28, -0.05], scale: [0.32, 0.4, 0.3], material: translucentMaterial },
    ];
  
    blobs.forEach((blob) => {
      const mesh = new THREE.Mesh(blobGeometry, blob.material);
      mesh.position.set(...blob.position);
      mesh.scale.set(...blob.scale);
      group.add(mesh);
    });
  
    return group;
  }

  private createGroundedIvoryAmphora(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
    const group = new THREE.Group();
    group.name = 'grounded ivory amphora';
    const points = [
      new THREE.Vector2(0.1, -0.56),
      new THREE.Vector2(0.28, -0.42),
      new THREE.Vector2(0.38, -0.08),
      new THREE.Vector2(0.32, 0.22),
      new THREE.Vector2(0.18, 0.44),
      new THREE.Vector2(0.14, 0.62),
      new THREE.Vector2(0.23, 0.7),
    ];
    const body = new THREE.Mesh(this.resources.trackGeometry(new THREE.LatheGeometry(points, 56)), marbleMaterial);
    const lip = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.23, 0.026, 10, 56)), glossMaterial);
    const foot = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.22, 0.28, 0.08, 48)), glossMaterial);
  
    lip.position.y = 0.7;
    lip.rotation.x = Math.PI * 0.5;
    foot.position.y = -0.58;
    group.add(body, lip, foot);
    return group;
  }

  private addMewHoloSculptures(group: THREE.Group) {
    const marbleMaterial = this.materials.createHoloMarbleMaterial();
    const pinkGloss = this.materials.createCandyGlossMaterial(0xff2db6, 0.72);
    const greenGloss = this.materials.createCandyGlossMaterial(0x75ff2c, 0.68);
    const yellowGloss = this.materials.createCandyGlossMaterial(0xffe80f, 0.72);
    const cyanGloss = this.materials.createCandyGlossMaterial(0x27eaff, 0.58);
    const violetGloss = this.materials.createCandyGlossMaterial(0x8d55ff, 0.62);
  
    const blobGeometry = this.resources.trackGeometry(new THREE.SphereGeometry(1, 32, 18));
    const gemGeometry = this.resources.trackGeometry(new THREE.OctahedronGeometry(0.45, 1));
    const torusKnotGeometry = this.resources.trackGeometry(new THREE.TorusKnotGeometry(0.34, 0.105, 96, 14, 2, 3));
  
    const leftColumn = this.createGrecoColumnFragment(marbleMaterial, pinkGloss);
    leftColumn.position.set(-2.88, 1.18, -0.95);
    leftColumn.rotation.set(0.12, 0.18, -0.16);
    leftColumn.scale.setScalar(0.62);
    group.add(leftColumn);
    this.registerMotion(leftColumn, 0.045, 0.56, new THREE.Vector3(0.04, 0.11, 0.035), 0.2);
  
    const rightColumn = this.createGrecoColumnFragment(marbleMaterial, greenGloss);
    rightColumn.position.set(2.82, 1.52, -1.25);
    rightColumn.rotation.set(-0.08, -0.38, 0.14);
    rightColumn.scale.setScalar(0.5);
    group.add(rightColumn);
    this.registerMotion(rightColumn, 0.06, 0.48, new THREE.Vector3(-0.035, 0.08, -0.03), 1.6);
  
    const amphora = this.createHoloAmphora(marbleMaterial, yellowGloss);
    amphora.position.set(2.16, 2.6, -1.34);
    amphora.rotation.set(0.1, -0.45, 0.08);
    amphora.scale.setScalar(0.42);
    group.add(amphora);
    this.registerMotion(amphora, 0.075, 0.42, new THREE.Vector3(0.025, 0.12, 0.04), 2.3);
  
    const leftGoop = this.createGoopCluster(blobGeometry, pinkGloss, violetGloss);
    leftGoop.position.set(-2.32, 2.22, -1.1);
    leftGoop.rotation.set(0.2, 0.15, -0.12);
    leftGoop.scale.setScalar(0.78);
    group.add(leftGoop);
    this.registerMotion(leftGoop, 0.085, 0.66, new THREE.Vector3(0.05, 0.18, 0.05), 0.9);
  
    const rightGoop = this.createGoopCluster(blobGeometry, greenGloss, cyanGloss);
    rightGoop.position.set(2.36, 0.92, -0.74);
    rightGoop.rotation.set(-0.16, -0.24, 0.2);
    rightGoop.scale.setScalar(0.62);
    group.add(rightGoop);
    this.registerMotion(rightGoop, 0.07, 0.72, new THREE.Vector3(-0.04, 0.2, -0.06), 2.9);
  
    const centerGem = new THREE.Mesh(gemGeometry, cyanGloss);
    centerGem.position.set(-0.92, 2.84, -1.18);
    centerGem.scale.set(0.5, 0.74, 0.5);
    group.add(centerGem);
    this.registerMotion(centerGem, 0.1, 0.54, new THREE.Vector3(0.18, 0.32, 0.08), 1.2);
  
    const yellowGem = new THREE.Mesh(gemGeometry, yellowGloss);
    yellowGem.position.set(3.28, 2.64, -1.08);
    yellowGem.scale.set(0.42, 0.64, 0.42);
    group.add(yellowGem);
    this.registerMotion(yellowGem, 0.08, 0.58, new THREE.Vector3(-0.14, 0.24, 0.11), 3.4);
  
    const knot = new THREE.Mesh(torusKnotGeometry, pinkGloss);
    knot.position.set(-1.72, 0.88, -0.7);
    knot.rotation.set(0.72, 0.26, 0.15);
    knot.scale.setScalar(0.7);
    group.add(knot);
    this.registerMotion(knot, 0.06, 0.64, new THREE.Vector3(0.16, -0.22, 0.18), 4.2);
  }

  private createGrecoColumnFragment(marbleMaterial: THREE.Material, goopMaterial: THREE.Material) {
    const group = new THREE.Group();
    group.name = 'holo marble column fragment';
    const shaft = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.18, 0.22, 1.18, 32)), marbleMaterial);
    const base = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 48)), marbleMaterial);
    const capital = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.3, 0.22, 0.16, 48)), marbleMaterial);
    const goopBand = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.27, 0.065, 18, 64)), goopMaterial);
    const goopDrop = new THREE.Mesh(this.resources.trackGeometry(new THREE.SphereGeometry(0.12, 24, 14)), goopMaterial);
  
    shaft.position.y = 0.04;
    shaft.rotation.z = 0.02;
    base.position.y = -0.62;
    capital.position.y = 0.68;
    goopBand.position.y = 0.22;
    goopBand.rotation.x = Math.PI * 0.5;
    goopDrop.position.set(0.18, -0.08, 0.1);
    goopDrop.scale.set(0.8, 1.55, 0.7);
  
    group.add(base, shaft, capital, goopBand, goopDrop);
    return group;
  }

  private createHoloAmphora(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
    const group = new THREE.Group();
    group.name = 'holo amphora sculpture';
    const points = [
      new THREE.Vector2(0.08, -0.52),
      new THREE.Vector2(0.2, -0.42),
      new THREE.Vector2(0.3, -0.16),
      new THREE.Vector2(0.26, 0.16),
      new THREE.Vector2(0.16, 0.38),
      new THREE.Vector2(0.12, 0.56),
      new THREE.Vector2(0.2, 0.64),
    ];
    const body = new THREE.Mesh(this.resources.trackGeometry(new THREE.LatheGeometry(points, 48)), marbleMaterial);
    const lip = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.2, 0.025, 10, 48)), glossMaterial);
    const leftHandle = new THREE.Mesh(this.resources.trackGeometry(new THREE.TorusGeometry(0.18, 0.025, 10, 48, Math.PI * 1.3)), glossMaterial);
    const rightHandle = leftHandle.clone();
  
    lip.position.y = 0.64;
    lip.rotation.x = Math.PI * 0.5;
    leftHandle.position.set(-0.24, 0.12, 0);
    leftHandle.rotation.set(0, 0, Math.PI * 0.52);
    leftHandle.scale.set(0.62, 1.1, 0.62);
    rightHandle.position.set(0.24, 0.12, 0);
    rightHandle.rotation.set(0, 0, -Math.PI * 0.52);
    rightHandle.scale.set(0.62, 1.1, 0.62);
  
    group.add(body, lip, leftHandle, rightHandle);
    return group;
  }

  private createGoopCluster(
    blobGeometry: THREE.BufferGeometry,
    primaryMaterial: THREE.Material,
    secondaryMaterial: THREE.Material,
  ) {
    const group = new THREE.Group();
    group.name = 'glossy goop cluster';
    const blobs: Array<{ position: [number, number, number]; scale: [number, number, number]; material: THREE.Material }> = [
      { position: [0, 0, 0], scale: [0.48, 0.62, 0.35], material: primaryMaterial },
      { position: [0.28, 0.08, 0.1], scale: [0.3, 0.38, 0.26], material: secondaryMaterial },
      { position: [-0.24, -0.14, -0.05], scale: [0.34, 0.28, 0.25], material: primaryMaterial },
      { position: [0.05, -0.38, 0.02], scale: [0.16, 0.36, 0.12], material: secondaryMaterial },
    ];
  
    blobs.forEach((blob) => {
      const mesh = new THREE.Mesh(blobGeometry, blob.material);
      mesh.position.set(...blob.position);
      mesh.scale.set(...blob.scale);
      group.add(mesh);
    });
  
    return group;
  }

  private registerMotion(
    root: THREE.Object3D,
    floatAmplitude: number,
    floatSpeed: number,
    spin: THREE.Vector3,
    phase: number,
  ) {
    this.motions.push({
      root,
      basePosition: root.position.clone(),
      baseRotation: root.rotation.clone(),
      windOffset: new THREE.Vector3(),
      windVelocity: new THREE.Vector3(),
      angularOffset: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      floatAmplitude,
      floatSpeed,
      phase,
      spin,
      windScale: 0.68 + (phase % 1.7) * 0.16,
    });
  }

  update(time: number, delta: number) {
    if (!this.holoAccentGroup?.visible) {
      return;
    }
  
    const pointerWind = this.getPointerWind();
    const activity = clamp01(pointerWind.activity);
    this.windForce.copy(pointerWind.wind).multiplyScalar(activity);
  
    this.motions.forEach((motion) => {
      motion.root.getWorldPosition(this.worldPosition);
      this.worldPosition.project(this.camera);
      this.screenPosition.set(
        this.worldPosition.x * 0.5 + 0.5,
        this.worldPosition.y * 0.5 + 0.5,
      );
  
      this.cursorDelta.copy(pointerWind.gustCenter).sub(this.screenPosition);
      const cursorDistance = this.cursorDelta.length();
      const tightField = 1 - THREE.MathUtils.smoothstep(cursorDistance, 0.04, 0.58);
      const broadField = (1 - THREE.MathUtils.smoothstep(cursorDistance, 0.3, 1.18)) * 0.72;
      const proximity = clamp01(tightField + broadField);
  
      this.awayFromCursor.copy(this.cursorDelta).multiplyScalar(-1);
      if (this.awayFromCursor.lengthSq() > 0.00001) {
        this.awayFromCursor.normalize();
      } else {
        this.awayFromCursor.set(0, 1);
      }
  
      const cursorPush = proximity * motion.windScale * activity;
      this.targetOffset.set(
        this.awayFromCursor.x * cursorPush * 0.98 + this.windForce.x * motion.windScale * 0.58,
        this.awayFromCursor.y * cursorPush * 0.64 + this.windForce.y * motion.windScale * 0.52,
        cursorPush * 0.32 + Math.abs(this.windForce.x) * motion.windScale * 0.18 + this.windForce.z * motion.windScale * 0.34,
      );
      this.targetOffset.clampLength(0, 0.98);
  
      this.offsetDelta.copy(this.targetOffset).sub(motion.windOffset);
      motion.windVelocity.add(this.offsetDelta.multiplyScalar(delta * 30));
      motion.windVelocity.multiplyScalar(Math.exp(-delta * 3.9));
      motion.windOffset.add(this.offsetDelta.copy(motion.windVelocity).multiplyScalar(delta));
      motion.windOffset.clampLength(0, 1.05);
  
      this.targetAngularOffset.set(
        this.windForce.y * motion.windScale * 0.72 - this.awayFromCursor.y * cursorPush * 0.82,
        this.windForce.x * motion.windScale * 0.68 + this.awayFromCursor.x * cursorPush * 0.86,
        -this.windForce.x * motion.windScale * 0.72 - this.awayFromCursor.x * cursorPush * 0.48,
      );
      this.targetAngularOffset.clampLength(0, 0.82);
  
      this.angularDelta.copy(this.targetAngularOffset).sub(motion.angularOffset);
      motion.angularVelocity.add(this.angularDelta.multiplyScalar(delta * 28));
      motion.angularVelocity.multiplyScalar(Math.exp(-delta * 4.1));
      motion.angularOffset.add(this.angularDelta.copy(motion.angularVelocity).multiplyScalar(delta));
      motion.angularOffset.clampLength(0, 0.86);
  
      const bob = Math.sin(time * motion.floatSpeed + motion.phase) * motion.floatAmplitude;
      motion.root.position.copy(motion.basePosition);
      motion.root.position.y += bob;
      motion.root.position.add(motion.windOffset);
      motion.root.rotation.set(
        motion.baseRotation.x + Math.sin(time * 0.32 + motion.phase) * motion.spin.x + motion.angularOffset.x,
        motion.baseRotation.y + time * motion.spin.y + motion.angularOffset.y,
        motion.baseRotation.z + Math.cos(time * 0.28 + motion.phase) * motion.spin.z + motion.angularOffset.z,
      );
    });
  }
}
