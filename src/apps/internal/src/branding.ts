export interface BrandConfig {
  name: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  footerNote: string;
  homeAriaLabel: string;
  pageTitle: string;
}

const DEFAULT_BRAND: BrandConfig = {
  name: 'Contoso Apparel',
  tagline: 'Reverse image search concept',
  heroTitle: 'Find the look from any image.',
  heroSubtitle:
    'Upload a product photo, campaign image, or reference shot and discover visually similar assets across the internal catalog.',
  footerNote:
    'Internal diagnostics support the experience without replacing its editorial visual language.',
  homeAriaLabel: 'Internal visual search concept home',
  pageTitle: 'Vision Search — Internal',
};

export const brand: BrandConfig = {
  ...DEFAULT_BRAND,
  ...(window.__VISIONSEARCH__?.brand ?? {}),
};

// Apply optional runtime theme tokens (CSS custom properties) and page title.
export function applyBranding(): void {
  const theme = window.__VISIONSEARCH__?.theme;
  if (theme) {
    const root = document.documentElement;
    for (const [token, value] of Object.entries(theme)) {
      if (typeof value === 'string') root.style.setProperty(`--${token}`, value);
    }
  }
  if (brand.pageTitle) document.title = brand.pageTitle;
}
