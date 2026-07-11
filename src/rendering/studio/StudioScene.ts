import * as THREE from 'three';

import {
  CYCLO_BACK_Z, CYCLO_TEXTURE_FALLBACK_ASPECT, CYCLO_TEXTURE_MODE_VALUES,
  CYCLO_TEXTURE_REPEAT_X, CYCLO_WALL_HEIGHT, CYCLO_WIDTH,
  PHOTO_PRINT_FLOOR_Y, PHOTO_PRINT_SURFACE_TILT, TECHNICOLOR_YELLOW,
} from '../../app/experienceConstants';
import type { CycloramaBackgroundUniforms, FullDressRecord, InfiniteBackdropUniforms, PointerWindState } from '../../app/experienceTypes';
import type { DressAssetId } from '../../config/dresses';
import { CYCLO_BACKGROUND_PRESETS, type CycloramaBackgroundPresetId } from '../../config/themes';
import { createCycloramaGeometry, createDialecticHalftoneShadowMaterial, createSoftContactShadowMaterial, createTechnicolorYellowPlaneMaterial, getCoveredCycloramaTransform, getCycloramaRepeatY } from '../cyclorama';
import { HoloSculptureSystem } from '../sculptures/HoloSculptureSystem';
import { createInfiniteBackdropMaterial } from '../materials/infiniteBackdropMaterial';
import { patchCycloramaBackgroundMaterial } from '../materials/cycloramaMaterial';
import { PhotoPrintSystem } from '../particles/PhotoPrintSystem';
import { ResourceTracker } from '../resourceTracker';

export type StudioSceneOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  resources: ResourceTracker;
  cycloramaBackgroundUniforms: CycloramaBackgroundUniforms;
  infiniteBackdropUniforms: InfiniteBackdropUniforms;
  getThemeId: () => CycloramaBackgroundPresetId;
  getFullDresses: () => Map<DressAssetId, FullDressRecord>;
  getPointerWind: () => PointerWindState;
  isMobileViewport: () => boolean;
};

export class StudioScene {
  cycloramaTextureAspect = CYCLO_TEXTURE_FALLBACK_ASPECT;
  cycloramaMesh: THREE.Mesh | null = null;
  cycloramaMaterial: THREE.MeshStandardMaterial | null = null;
  cycloramaHoloMaterial: THREE.MeshBasicMaterial | null = null;
  infiniteBackdropMesh: THREE.Mesh | null = null;
  infiniteBackdropMaterial: THREE.ShaderMaterial | null = null;
  holoAccentGroup: THREE.Group | null = null;
  ivorySculptureGroup: THREE.Group | null = null;
  signalBlackGroup: THREE.Group | null = null;
  holoSculptureSystem: HoloSculptureSystem | null = null;
  photoPrintGroup: THREE.Group | null = null;
  photoPrintSystem: PhotoPrintSystem | null = null;
  windArchiveDressShadow: THREE.Mesh | null = null;
  dialecticHalftoneShadow: THREE.Mesh | null = null;
  contactShadow: THREE.Mesh | null = null;
  contactShadowMaterial: THREE.ShaderMaterial | null = null;
  paperRollMaterial: THREE.MeshStandardMaterial | null = null;
  paperRollMesh: THREE.Mesh | null = null;
  yellowBacking: THREE.Mesh | null = null;
  yellowBackingMaterial: THREE.MeshBasicMaterial | null = null;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: HTMLElement;
  private readonly resources: ResourceTracker;
  private readonly cycloramaBackgroundUniforms: CycloramaBackgroundUniforms;
  private readonly infiniteBackdropUniforms: InfiniteBackdropUniforms;
  private readonly getThemeId: () => CycloramaBackgroundPresetId;
  private readonly getFullDresses: () => Map<DressAssetId, FullDressRecord>;
  private readonly getPointerWind: () => PointerWindState;
  private readonly isMobileViewport: () => boolean;

  constructor(options: StudioSceneOptions) {
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.canvas = options.canvas;
    this.stage = options.stage;
    this.resources = options.resources;
    this.cycloramaBackgroundUniforms = options.cycloramaBackgroundUniforms;
    this.infiniteBackdropUniforms = options.infiniteBackdropUniforms;
    this.getThemeId = options.getThemeId;
    this.getFullDresses = options.getFullDresses;
    this.getPointerWind = options.getPointerWind;
    this.isMobileViewport = options.isMobileViewport;
    this.addLighting(options.scene);
    this.build(options.scene);
  }

  private addLighting(targetScene: THREE.Scene) {
    // RectAreaLight approximates a large photography softbox. Larger area lights
    // create broad, soft highlights, which suits fabric better than a tiny point
    // source. RectAreaLight affects PBR materials but does not cast shadows here.
    const softbox = new THREE.RectAreaLight(0xf0e7d7, 2.2, 6.4, 7.2);
    softbox.position.set(-3.2, 3.45, 3.9);
    softbox.lookAt(0, 1.15, 0);
    targetScene.add(softbox);

    // A DirectionalLight has parallel rays as if the source were infinitely far
    // away. Position controls direction, not inverse-square distance falloff.
    const key = new THREE.DirectionalLight(0xf0e8da, 0.22);
    key.position.set(-3.6, 5.2, 4.8);
    key.castShadow = false;
    targetScene.add(key);

    // The cool rear rim separates silhouette edges from the backdrop.
    const rim = new THREE.DirectionalLight(0xb8d1e8, 0.24);
    rim.position.set(4.2, 3.2, -3.2);
    targetScene.add(rim);

    // PointLight radiates in every direction. The fourth argument is physical
    // decay; 2 approximates inverse-square falloff, 2.6 falls off a little faster.
    const floorGlow = new THREE.PointLight(0xd4c1a5, 0.26, 7.2, 2.6);
    floorGlow.position.set(-1.85, 0.42, 1.65);
    targetScene.add(floorGlow);

    // HemisphereLight supplies cheap sky/ground fill and prevents fully black
    // unlit-facing regions. It is ambient directionality, not a shadow caster.
    targetScene.add(new THREE.HemisphereLight(0xc6d5df, 0x5f6d76, 0.5));
  }

  private loadEditorialBackdropTexture(
    url: string,
    textureUniform: THREE.IUniform<THREE.Texture | null>,
    aspectUniform: THREE.IUniform<number>,
  ) {
    const texture = this.resources.trackTexture(
      new THREE.TextureLoader().load(url, (loadedTexture) => {
        const image = loadedTexture.image as { width?: number; height?: number };
        if (image.width && image.height) {
          aspectUniform.value = image.width / image.height;
        }
        loadedTexture.needsUpdate = true;
      }),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    // ClampToEdge avoids repeating the opposite edge when UVs reach the border.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // Anisotropic filtering improves textures viewed at a grazing angle. It costs
    // texture bandwidth, so the value is capped at 4.
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    textureUniform.value = texture;
  }

  private build(targetScene: THREE.Scene) {
    // -------------------------------------------------------------------------
    // STUDIO GEOMETRY AND AUTHORED SHADOW PLANES
    // -------------------------------------------------------------------------
    // This function constructs long-lived background objects. Theme switching
    // generally toggles visibility/material modes rather than recreating them.
    this.loadEditorialBackdropTexture(
      '/editorial/sarmi-background-horizontal.png',
      this.infiniteBackdropUniforms.uGraphicTexture,
      this.infiniteBackdropUniforms.uGraphicAspect,
    );
    this.loadEditorialBackdropTexture(
      '/editorial/sarmi-background-vertical.jpg',
      this.infiniteBackdropUniforms.uGraphicVerticalTexture,
      this.infiniteBackdropUniforms.uGraphicVerticalAspect,
    );
    this.loadEditorialBackdropTexture(
      '/editorial/sarmi-web-75.jpg',
      this.infiniteBackdropUniforms.uHeroStillTexture,
      this.infiniteBackdropUniforms.uHeroStillAspect,
    );

    const cycloramaTexture = this.resources.trackTexture(
      new THREE.TextureLoader().load('/cyclo_bg2.jpg', (texture) => {
        const image = texture.image as { width?: number; height?: number };
        this.cycloramaTextureAspect = image.width && image.height ? image.width / image.height : CYCLO_TEXTURE_FALLBACK_ASPECT;
        this.syncBackgroundUniforms();
        texture.needsUpdate = true;
      }),
    );
    cycloramaTexture.colorSpace = THREE.SRGBColorSpace;
    cycloramaTexture.wrapS = THREE.RepeatWrapping;
    cycloramaTexture.wrapT = THREE.RepeatWrapping;
    cycloramaTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.syncBackgroundUniforms();

    this.infiniteBackdropMaterial = this.resources.trackMaterial(createInfiniteBackdropMaterial(this.infiniteBackdropUniforms));
    this.infiniteBackdropMesh = new THREE.Mesh(this.resources.trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)), this.infiniteBackdropMaterial);
    this.infiniteBackdropMesh.name = 'infinite theme backdrop';
    // The backdrop is parented to the camera. Its local transform therefore
    // follows camera motion and it behaves like an infinitely distant 2D field.
    this.infiniteBackdropMesh.position.set(0, 0, -24);
    this.infiniteBackdropMesh.renderOrder = -1000;
    this.camera.add(this.infiniteBackdropMesh);

    this.yellowBackingMaterial = this.resources.trackMaterial(createTechnicolorYellowPlaneMaterial(TECHNICOLOR_YELLOW));
    this.yellowBacking = new THREE.Mesh(
      this.resources.trackGeometry(new THREE.PlaneGeometry(CYCLO_WIDTH * 2.45, CYCLO_WALL_HEIGHT + 1.9, 1, 1)),
      this.yellowBackingMaterial,
    );
    this.yellowBacking.name = 'technicolor yellow backing plane';
    this.yellowBacking.position.set(0, (CYCLO_WALL_HEIGHT + 0.75) * 0.5, CYCLO_BACK_Z - 0.18);
    this.yellowBacking.visible = false;
    targetScene.add(this.yellowBacking);
    this.photoPrintSystem = new PhotoPrintSystem({
      scene: targetScene,
      camera: this.camera,
      renderer: this.renderer,
      canvas: this.canvas,
      stage: this.stage,
      resources: this.resources,
      getThemeId: () => this.getThemeId(),
      getFullDresses: () => this.getFullDresses(),
      getPointerWind: this.getPointerWind,
      isMobileViewport: this.isMobileViewport,
    });
    this.photoPrintGroup = this.photoPrintSystem.group;
    this.holoSculptureSystem = new HoloSculptureSystem({
      scene: targetScene,
      resources: this.resources,
      renderer: this.renderer,
      camera: this.camera,
      getPointerWind: this.getPointerWind,
    });
    this.holoAccentGroup = this.holoSculptureSystem.holoAccentGroup;
    this.ivorySculptureGroup = this.holoSculptureSystem.ivorySculptureGroup;
    this.signalBlackGroup = this.holoSculptureSystem.signalBlackGroup;

    this.cycloramaMaterial = this.resources.trackMaterial(
      // MeshStandardMaterial is physically based (PBR). Roughness 1 is matte,
      // metalness 0 is dielectric/non-metal, and envMapIntensity controls the
      // strength of RoomEnvironment reflections.
      new THREE.MeshStandardMaterial({
        color: 0xb5c8d2,
        map: cycloramaTexture,
        roughness: 0.88,
        metalness: 0,
        envMapIntensity: 0.24,
      }),
    );
    patchCycloramaBackgroundMaterial(this.cycloramaMaterial, this.cycloramaBackgroundUniforms);
    this.cycloramaHoloMaterial = this.resources.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: cycloramaTexture,
        fog: true,
        toneMapped: false,
      }),
    );
    patchCycloramaBackgroundMaterial(this.cycloramaHoloMaterial, this.cycloramaBackgroundUniforms);
    this.cycloramaMesh = new THREE.Mesh(this.resources.trackGeometry(createCycloramaGeometry()), this.cycloramaMaterial);
    this.cycloramaMesh.receiveShadow = false;
    targetScene.add(this.cycloramaMesh);

    this.contactShadowMaterial = this.resources.trackMaterial(createSoftContactShadowMaterial(0x354a5a, 0.2));
    this.contactShadow = new THREE.Mesh(
      this.resources.trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
      this.contactShadowMaterial,
    );
    // PlaneGeometry is created upright in local XY. Rotating -π/2 around X lays
    // it flat in XZ like a horizontal floor.
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.set(0, 0.014, 0.18);
    this.contactShadow.scale.set(1.35, 0.5, 1);

    this.windArchiveDressShadow = new THREE.Mesh(
      this.resources.trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
      this.resources.trackMaterial(createSoftContactShadowMaterial(0x3f332b, 0.38)),
    );
    this.windArchiveDressShadow.name = 'wind archive dress shadow';
    // This uses the same slope as the resting prints, visually claiming that all
    // of them occupy one invisible plane.
    this.windArchiveDressShadow.rotation.x = PHOTO_PRINT_SURFACE_TILT;
    this.windArchiveDressShadow.position.set(0.16, PHOTO_PRINT_FLOOR_Y - 0.12, 0.24);
    this.windArchiveDressShadow.scale.set(2.2, 1.25, 1);
    this.windArchiveDressShadow.renderOrder = 1;
    this.windArchiveDressShadow.visible = false;
    targetScene.add(this.windArchiveDressShadow);

    this.dialecticHalftoneShadow = new THREE.Mesh(
      this.resources.trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
      this.resources.trackMaterial(createDialecticHalftoneShadowMaterial()),
    );
    this.dialecticHalftoneShadow.name = 'dialectic halftone floor shadow';

    // DIALECTIC SHADOW TUNING
    // -----------------------
    // PlaneGeometry starts as a 1×1 square in local XY. We tip it toward the
    // this.camera, scale it into a footprint, and attach it to the active dress pivot.
    //
    // rotation.x:
    //   More negative approaches a horizontal floor (-PI/2 is perfectly flat).
    //   Less negative makes the plane face the camera more directly. Keep it near
    //   PHOTO_PRINT_SURFACE_TILT if it should agree with the Wind Archive floor.
    //
    // position.set(X, Y, Z):
    //   X moves the entire shadow left/right.
    //   Y moves it up/down in dress-local space. More negative Y creates a larger
    //     visible gap below the hem; less negative Y tucks it under the dress.
    //   Z moves it in depth. In this scene positive Z is toward the camera. On a
    //     tilted plane, increasing Z generally projects more of the shadow below
    //     the dress and strengthens the sense of floor depth.
    //
    // scale.set(width, depth, 1):
    //   First value controls footprint width.
    //   Second value controls how far the footprint extends along the floor.
    //
    // Because this mesh is later parented to the dress pivot, its transform is
    // also multiplied by the current dress's pivot scale.
    this.dialecticHalftoneShadow.rotation.x = PHOTO_PRINT_SURFACE_TILT;
    this.dialecticHalftoneShadow.position.set(0.06, -0.27, -0.08);
    this.dialecticHalftoneShadow.scale.set(2, 1.3, 1);
    // Transparent objects are sorted partly by renderOrder. A fixed positive
    // order makes this draw after background geometry. The material does not
    // write depth, so it cannot block the dress rendered above it.
    this.dialecticHalftoneShadow.renderOrder = 1;
    this.dialecticHalftoneShadow.visible = false;
    targetScene.add(this.dialecticHalftoneShadow);

    this.paperRollMaterial = this.resources.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x6f8799,
        roughness: 0.82,
        metalness: 0,
        envMapIntensity: 0.32,
      }),
    );
    this.paperRollMesh = new THREE.Mesh(this.resources.trackGeometry(new THREE.CylinderGeometry(0.075, 0.075, 8.5, 32)), this.paperRollMaterial);
    this.paperRollMesh.rotation.z = Math.PI / 2;
    this.paperRollMesh.position.set(0, 4.72, -2.08);
    targetScene.add(this.paperRollMesh);
  }

  syncBackgroundUniforms() {
    const preset = CYCLO_BACKGROUND_PRESETS[this.getThemeId()];
    const cover = getCoveredCycloramaTransform(this.cycloramaTextureAspect);

    this.cycloramaBackgroundUniforms.uCycloTextureMode.value = CYCLO_TEXTURE_MODE_VALUES[preset.textureMode];
    this.cycloramaBackgroundUniforms.uCycloTileRepeat.value.set(
      CYCLO_TEXTURE_REPEAT_X,
      getCycloramaRepeatY(this.cycloramaTextureAspect),
    );
    this.cycloramaBackgroundUniforms.uCycloCoverScale.value.copy(cover.scale);
    this.cycloramaBackgroundUniforms.uCycloCoverOffset.value.copy(cover.offset);
  }

  dispose() {
    this.photoPrintSystem?.dispose();
  }
}
