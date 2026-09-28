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
    'Upload a product photo, campaign image, or reference shot and discover visually similar pieces across the catalog.',
  footerNote:
    'A visual search concept: spacious, polished, confident, and focused on the look.',
  homeAriaLabel: 'Visual search concept home',
  pageTitle: 'Vision Search',
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
