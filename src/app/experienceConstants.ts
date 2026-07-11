import type { CycloramaBackgroundPresetId, CycloramaTextureMode } from '../config/themes';

export const TECHNICOLOR_YELLOW = 0xffff00;

export const CYCLO_TEXTURE_MODE_VALUES: Record<CycloramaTextureMode, number> = {
  'blue-flat': 0,
  'mew-holo': 3,
  'tabla-rasa': 6,
  'ivory-holo': 4,
  'signal-black': 5,
};

export const INFINITE_BACKDROP_MODE_VALUES: Record<CycloramaBackgroundPresetId, number> = {
  blue: 0,
  'mew-holo': 1,
  'tabla-rasa': 3,
  'ivory-holo': 0,
  'signal-black': 2,
};

export const BLOOM_BASE_STRENGTH = 0.02;
export const BLOOM_WIND_STRENGTH = 0.045;
export const BLOOM_BASE_RADIUS = 0.12;
export const BLOOM_WIND_RADIUS = 0.06;
export const BLOOM_THRESHOLD = 0.9;
export const DRESS_BLOOM_MAX_STRENGTH = 0.12;
export const DRESS_BLOOM_RADIUS = 0.08;
export const DRESS_BLOOM_THRESHOLD = 0.55;

export const DRESS_TRANSITION_FX_ENABLED = true;
export const DRESS_TRANSITION_FX_DURATION = 0.72;
export const DRESS_TRANSITION_FX_OVERLAY_OPACITY = 0.26;
export const LOADING_OVERLAY_FADE_MS = 420;

export const INVISIBLE_CITIES_SUBJECT_SCALE = 0.9;
export const WIND_ARCHIVE_SUBJECT_SCALE = 0.78;
export const ARMS_GLOW_SCALE = 0.82;

export const SUBJECT_YAW_RESPONSE = 1.0;
export const SUBJECT_YAW_RANGE = Math.PI * 2.05;
export const SUBJECT_YAW_EASE = 2.6;
export const SUBJECT_YAW_WIND_DRIFT = 0.18;
export const CAMERA_VERTICAL_RESPONSE = 0.56;
export const CAMERA_VERTICAL_EASE = 3.6;
export const CAMERA_MAX_LIFT = 0.48;
export const FOCUS_MAX_LIFT = 0.25;
export const CAMERA_BACK_DISTANCE_MULTIPLIER = 1.5;

export const BLUE_DRESS_HOVER_TURN_RESPONSE = 2.15;
export const BLUE_DRESS_HOVER_YAW_LIMIT = Math.PI * 0.45;
export const BLUE_DRESS_HOVER_IDLE_SECONDS = 0.12;
export const BLUE_DRESS_RETURN_EASE = 1.9;
export const BLUE_DRESS_ROTATION_EASE = 2.8;

export const MEW_SCROLL_ROTATION_EASE = 3.8;
export const MEW_SCROLL_TRIGGER_PROGRESS = 0.985;
export const MEW_SCROLL_VIEWPORT_FACTOR = 0.92;

export const PHOTO_PRINT_IMAGE_URLS = [
  '/editorial/sarmi-web-75.jpg',
  '/editorial/sarmi-web-76.jpg',
  '/editorial/sarmi-web-84.jpg',
  '/editorial/sarmi-web-98.jpg',
];
export const PHOTO_PRINT_CARD_WIDTH = 0.68;
export const PHOTO_PRINT_CARD_HEIGHT = 0.398;
export const PHOTO_PRINT_IMAGE_WIDTH = 0.644;
export const PHOTO_PRINT_IMAGE_HEIGHT = 0.362;
export const PHOTO_PRINT_SPAWN_Z = 1.22;
export const PHOTO_PRINT_FLOOR_Y = 0.24;
export const PHOTO_PRINT_SURFACE_TILT = -1.12;
export const PHOTO_PRINT_GRAVITY = 1.42;
export const PHOTO_PRINT_LAYER_GAP = 0.0008;
export const PHOTO_PRINT_DISCARD_Y = -1.35;
export const PHOTO_PRINT_BURST_INTERVAL = 0.34;
export const PHOTO_PRINT_MIN_POINTER_DISTANCE = 0.085;
export const PHOTO_PRINT_DRESS_CLEARANCE_NDC = 0.012;

export const FULL_DRESS_CACHE_LIMIT = 2;
export const FULL_DRESS_FADE_SPEED = 6.5;
export const MOBILE_GHOST_LIMIT = 2;
export const GHOST_LOAD_DELAY_MS = 180;
export const GHOST_EDGE_THRESHOLD_DEGREES = 42;
export const DRESS_THUMBNAIL_TARGET_HEIGHT = 1.94;
export const DRESS_THUMBNAIL_TARGET_WIDTH = 1.62;

export const CYCLO_WIDTH = 8.6;
export const CYCLO_FRONT_Z = 4.4;
export const CYCLO_BACK_Z = -2.08;
export const CYCLO_WALL_HEIGHT = 4.72;
export const CYCLO_RADIUS = 1.22;
export const CYCLO_TEXTURE_REPEAT_X = 3.25;
export const CYCLO_TEXTURE_FALLBACK_ASPECT = 663 / 617;

export const TARGET_RENDER_INTERVAL_MS = 1000 / 60;
export const DRESS_MATERIAL_GRAIN_STRENGTH = 0.04;
export const TABLA_RASA_ACCENT_COLORS = [
  0xfdfefe,
  0xf0f4f7,
  0xdfe7ed,
  0xcbd5de,
  0xb9c4ce,
  0xf7f9fb,
];
