export type DressAssetId = 'original' | 'patchwork';

export type DressGhostPlacement = {
  position: [number, number, number];
  rotationY: number;
  scale: number;
};

export type DressAsset = {
  id: DressAssetId;
  label: string;
  url: string;
  swatch: string;
  dialecticScale: number;
  ghost: DressGhostPlacement;
};

/**
 * Add or replace dress assets here. Navigation, URL state, thumbnails, and
 * the editorial rail all derive from this registry.
 */
export const DRESS_ASSETS: Record<DressAssetId, DressAsset> = {
  original: {
    id: 'original',
    label: 'Dress 1',
    url: '/dress.glb',
    swatch: 'linear-gradient(135deg, #7a624c, #eee2cc)',
    dialecticScale: 1,
    ghost: {
      position: [-1.58, 0, -0.5],
      rotationY: 0.22,
      scale: 0.7,
    },
  },
  patchwork: {
    id: 'patchwork',
    label: 'Dress 2',
    url: '/patchwork_dress_latest.glb',
    swatch: 'linear-gradient(135deg, #282328 0%, #d7c8a8 34%, #c75f40 58%, #798936 100%)',
    dialecticScale: 1,
    ghost: {
      position: [1.58, 0, -0.5],
      rotationY: -0.22,
      scale: 0.7,
    },
  },
};

export const DRESS_ASSET_ORDER = Object.keys(DRESS_ASSETS) as DressAssetId[];

export function isDressAssetId(value: unknown): value is DressAssetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DRESS_ASSETS, value);
}
