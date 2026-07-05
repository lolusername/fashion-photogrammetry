export type CycloramaTextureMode =
  | 'blue-flat'
  | 'mew-holo'
  | 'tabla-rasa'
  | 'ivory-holo'
  | 'signal-black';

export type PublicThemeId = 'blue' | 'mew-holo' | 'tabla-rasa';
export type LegacyRendererThemeId = 'ivory-holo' | 'signal-black';
export type CycloramaBackgroundPresetId = PublicThemeId | LegacyRendererThemeId;

export type CycloramaBackgroundPreset = {
  id: CycloramaBackgroundPresetId;
  label: string;
  textureMode: CycloramaTextureMode;
  cycloramaColor: number;
  sceneColor: number;
  fogColor: number;
  paperRollColor: number;
  shadowColor: number;
  shadowOpacity: number;
  cycloramaRoughness: number;
  cycloramaMetalness: number;
  cycloramaEnvMapIntensity: number;
  yellowBackingVisible: boolean;
  yellowBackingColor: number;
  swatch: string;
  stageTop: string;
  stageMiddle: string;
  stageBottom: string;
  stageGlow: string;
  stageEdge: string;
  stageVignette: string;
};

export type PublicThemeDefinition = CycloramaBackgroundPreset & {
  id: PublicThemeId;
  route: string;
  index: string;
  summary: string;
  instruction: string;
  provenance: string;
};

const TECHNICOLOR_YELLOW = 0xffff00;

/**
 * This is the only public theme registry.
 *
 * Add, remove, rename, reorder, or rewrite theme copy here. Renderer-specific
 * shader routing still lives beside createInfiniteBackdropMaterial() because
 * it is GPU implementation rather than editorial configuration.
 */
export const PUBLIC_THEMES: readonly PublicThemeDefinition[] = [
  {
    id: 'mew-holo',
    route: 'invisible-cities',
    index: '01',
    label: 'Invisible Cities',
    summary: 'Chromatic field',
    instruction: 'Move to disturb the field. Scroll or swipe to turn the dress.',
    provenance: 'Historical Invisible Cities editorial branch',
    textureMode: 'mew-holo',
    cycloramaColor: 0xe8d5b4,
    sceneColor: 0xe8d5b4,
    fogColor: 0xe8d5b4,
    paperRollColor: 0xe8d5b4,
    shadowColor: 0x6f5944,
    shadowOpacity: 0.1,
    cycloramaRoughness: 0.72,
    cycloramaMetalness: 0,
    cycloramaEnvMapIntensity: 0.2,
    yellowBackingVisible: false,
    yellowBackingColor: TECHNICOLOR_YELLOW,
    swatch: 'linear-gradient(135deg, #ead6b5 0%, #dca4a7 42%, #7ca4a1 76%, #322820 100%)',
    stageTop: '#f2e5cb',
    stageMiddle: '#e6cfad',
    stageBottom: '#cfad83',
    stageGlow: 'rgba(228, 171, 161, 0.2)',
    stageEdge: 'rgba(87, 57, 37, 0.08)',
    stageVignette: 'rgba(76, 49, 31, 0.12)',
  },
  {
    id: 'blue',
    route: 'dialectic',
    index: '02',
    label: 'Dialectic',
    summary: 'Orange / blue study',
    instruction: 'Move across the dress to turn it. Use the arrows for the next scan.',
    provenance: 'Historical split Dialectic composition',
    textureMode: 'blue-flat',
    cycloramaColor: 0x00a8c4,
    sceneColor: 0x0f6f9f,
    fogColor: 0x0f6f9f,
    paperRollColor: 0x0f6f9f,
    shadowColor: 0x0f6f9f,
    shadowOpacity: 0,
    cycloramaRoughness: 1,
    cycloramaMetalness: 0,
    cycloramaEnvMapIntensity: 0,
    yellowBackingVisible: false,
    yellowBackingColor: TECHNICOLOR_YELLOW,
    swatch: 'linear-gradient(135deg, #11d6d2, #104c9f 70%, #071f55)',
    stageTop: '#16c4c7',
    stageMiddle: '#0a72ad',
    stageBottom: '#071d58',
    stageGlow: 'rgba(15, 209, 218, 0.26)',
    stageEdge: 'rgba(3, 29, 70, 0.08)',
    stageVignette: 'rgba(4, 22, 54, 0.18)',
  },
  {
    id: 'tabla-rasa',
    route: 'wind-archive',
    index: '03',
    label: 'Wind Archive',
    summary: 'Photographic study',
    instruction: 'Move off the dress to release a print. Scroll or swipe to turn the dress.',
    provenance: 'Current print-wind branch',
    textureMode: 'tabla-rasa',
    cycloramaColor: 0xe8d5b4,
    sceneColor: 0xe8d5b4,
    fogColor: 0xe8d5b4,
    paperRollColor: 0xe8d5b4,
    shadowColor: 0x6f5944,
    shadowOpacity: 0.1,
    cycloramaRoughness: 0.72,
    cycloramaMetalness: 0,
    cycloramaEnvMapIntensity: 0.2,
    yellowBackingVisible: false,
    yellowBackingColor: TECHNICOLOR_YELLOW,
    swatch: 'linear-gradient(135deg, #ead6b5 0%, #dca4a7 42%, #7ca4a1 76%, #322820 100%)',
    stageTop: '#f2e5cb',
    stageMiddle: '#e6cfad',
    stageBottom: '#cfad83',
    stageGlow: 'rgba(228, 171, 161, 0.2)',
    stageEdge: 'rgba(87, 57, 37, 0.08)',
    stageVignette: 'rgba(76, 49, 31, 0.12)',
  },
] as const;

const LEGACY_RENDERER_PRESETS: Record<LegacyRendererThemeId, CycloramaBackgroundPreset> = {
  'ivory-holo': {
    id: 'ivory-holo',
    label: 'Différance',
    textureMode: 'ivory-holo',
    cycloramaColor: 0xf1ede2,
    sceneColor: 0xe7e1d6,
    fogColor: 0xf2eee4,
    paperRollColor: 0xf8f4ea,
    shadowColor: 0x867d70,
    shadowOpacity: 0.12,
    cycloramaRoughness: 0.64,
    cycloramaMetalness: 0,
    cycloramaEnvMapIntensity: 0.18,
    yellowBackingVisible: false,
    yellowBackingColor: TECHNICOLOR_YELLOW,
    swatch: 'linear-gradient(135deg, #fffdf4 0%, #eee9dc 46%, #d8d0c2 100%)',
    stageTop: '#fbf8ef',
    stageMiddle: '#ece6da',
    stageBottom: '#d8d0c2',
    stageGlow: 'rgba(255, 253, 244, 0.42)',
    stageEdge: 'rgba(118, 109, 96, 0.08)',
    stageVignette: 'rgba(112, 101, 88, 0.14)',
  },
  'signal-black': {
    id: 'signal-black',
    label: 'S/Z',
    textureMode: 'signal-black',
    cycloramaColor: 0x080908,
    sceneColor: 0x080908,
    fogColor: 0x080908,
    paperRollColor: 0x080908,
    shadowColor: 0x050505,
    shadowOpacity: 0,
    cycloramaRoughness: 1,
    cycloramaMetalness: 0,
    cycloramaEnvMapIntensity: 0,
    yellowBackingVisible: false,
    yellowBackingColor: TECHNICOLOR_YELLOW,
    swatch: 'linear-gradient(135deg, #050505 0%, #131313 44%, #00d7ff 68%, #ff2db6 100%)',
    stageTop: '#060706',
    stageMiddle: '#0b0c0b',
    stageBottom: '#030303',
    stageGlow: 'rgba(0, 215, 255, 0.16)',
    stageEdge: 'rgba(0, 0, 0, 0.34)',
    stageVignette: 'rgba(0, 0, 0, 0.52)',
  },
};

export const PUBLIC_THEME_IDS = PUBLIC_THEMES.map((theme) => theme.id) as PublicThemeId[];

export const CYCLO_BACKGROUND_PRESETS: Record<CycloramaBackgroundPresetId, CycloramaBackgroundPreset> = {
  ...Object.fromEntries(PUBLIC_THEMES.map((theme) => [theme.id, theme])),
  ...LEGACY_RENDERER_PRESETS,
} as Record<CycloramaBackgroundPresetId, CycloramaBackgroundPreset>;

export const PUBLIC_THEME_BY_ID = Object.fromEntries(
  PUBLIC_THEMES.map((theme) => [theme.id, theme]),
) as Record<PublicThemeId, PublicThemeDefinition>;

export const DEFAULT_THEME_ID: PublicThemeId = 'mew-holo';

export function isPublicThemeId(value: unknown): value is PublicThemeId {
  return typeof value === 'string' && PUBLIC_THEME_IDS.includes(value as PublicThemeId);
}

export function resolveThemeRoute(value: string | null): PublicThemeId {
  if (!value) {
    return DEFAULT_THEME_ID;
  }

  const routeMatch = PUBLIC_THEMES.find((theme) => theme.route === value);
  if (routeMatch) {
    return routeMatch.id;
  }

  return isPublicThemeId(value) ? value : DEFAULT_THEME_ID;
}
