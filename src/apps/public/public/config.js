// Runtime configuration for the public site.
// Set apiBaseUrl to the Function API origin (e.g. https://vs-fn-xxxx.azurewebsites.net).
// Leaving it empty makes the app call the same origin under /api (useful behind a proxy).
// apiBaseUrl is stamped by src/hooks/configure-sites.ps1 at post-provision from AZURE_FUNCTION_URI.
//
// brand and theme skin the site at runtime — edit and reload, no rebuild required.
// theme keys map to CSS custom properties (e.g. forest -> --forest). Available tokens
// include: paper, surface, ink, muted, line, forest, forest-hover, rose, soft, danger.
window.__VISIONSEARCH__ = {
  apiBaseUrl: 'https://vs-fn-fvdllc.azurewebsites.net',
  brand: {
    name: 'Contoso Apparel',
    tagline: 'Reverse image search concept',
    heroTitle: 'Find the look from any image.',
    heroSubtitle:
      'Upload a product photo, campaign image, or reference shot and discover visually similar pieces across the catalog.',
    footerNote:
      'A visual search concept: spacious, polished, confident, and focused on the look.',
    homeAriaLabel: 'Visual search concept home',
    pageTitle: 'Vision Search'
  },
  // Example skin — edit these values (or set to {}) to restore the built-in palette.
  theme: {
    forest: '#1f3a5f',
    'forest-hover': '#162b47'
  }
};