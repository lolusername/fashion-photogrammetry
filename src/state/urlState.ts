import { DEFAULT_THEME_ID, PUBLIC_THEME_BY_ID, resolveThemeRoute, type PublicThemeId } from '../config/themes';
import { isDressAssetId, type DressAssetId } from '../config/dresses';

export type InitialExperienceState = {
  themeId: PublicThemeId;
  dressId: DressAssetId;
};

export function readInitialExperienceState(search: string): InitialExperienceState {
  const params = new URLSearchParams(search);

  return {
    themeId: resolveThemeRoute(params.get('theme') ?? params.get('bg')),
    dressId: isDressAssetId(params.get('dress')) ? params.get('dress') : 'original',
  } as InitialExperienceState;
}

export function writeThemeToUrl(themeId: PublicThemeId) {
  const nextUrl = new URL(window.location.href);
  const theme = PUBLIC_THEME_BY_ID[themeId];

  nextUrl.searchParams.delete('bg');
  if (themeId === DEFAULT_THEME_ID) {
    nextUrl.searchParams.delete('theme');
  } else {
    nextUrl.searchParams.set('theme', theme.route);
  }

  window.history.replaceState(null, '', nextUrl);
}

export function writeDressToUrl(dressId: DressAssetId) {
  const nextUrl = new URL(window.location.href);

  if (dressId === 'original') {
    nextUrl.searchParams.delete('dress');
  } else {
    nextUrl.searchParams.set('dress', dressId);
  }

  window.history.replaceState(null, '', nextUrl);
}

