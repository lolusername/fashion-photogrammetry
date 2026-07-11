export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function clampSigned(value: number, limit: number) {
  return Math.min(limit, Math.max(-limit, value));
}

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}
