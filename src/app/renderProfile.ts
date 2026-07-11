const DESKTOP_MAX_PIXEL_RATIO = 2;
const MOBILE_MAX_PIXEL_RATIO = 2;
const MOBILE_EFFECT_PIXEL_RATIO = 1;
const mobileRenderProfileQuery = window.matchMedia('(max-width: 720px), (pointer: coarse)');

export function usesMobileRenderProfile() {
  return mobileRenderProfileQuery.matches;
}

export function usesSingleContextMewLayout() {
  return usesMobileRenderProfile();
}

export function getRenderPixelRatio() {
  const maximum = usesMobileRenderProfile()
    ? MOBILE_MAX_PIXEL_RATIO
    : DESKTOP_MAX_PIXEL_RATIO;

  return Math.min(window.devicePixelRatio, maximum);
}

export function getEffectPixelRatio() {
  return usesMobileRenderProfile() ? MOBILE_EFFECT_PIXEL_RATIO : getRenderPixelRatio();
}
