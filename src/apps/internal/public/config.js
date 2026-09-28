// Runtime configuration for the internal site.
// Set apiBaseUrl to the Function API origin (e.g. https://vs-fn-xxxx.azurewebsites.net).
// Leaving it empty makes the app call the same origin under /api (useful behind a proxy).
// apiBaseUrl is stamped by src/hooks/configure-sites.ps1 at post-provision from AZURE_FUNCTION_URI.
//
// brand and theme skin the site at runtime — edit and reload, no rebuild required.
// theme keys map to CSS custom properties (e.g. accent -> --accent). Available tokens
// include: bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger.
window.__VISIONSEARCH__ = {
  apiBaseUrl: 'https://vs-fn-4hjvlm.azurewebsites.net',
  brand: {
    name: 'Contoso Apparel',
    tagline: 'Reverse image search concept',
    heroTitle: 'Find the look from any image.',
    heroSubtitle:
      'Upload a product photo, campaign image, or reference shot and discover visually similar assets across the internal catalog.',
    footerNote:
      'Internal diagnostics support the experience without replacing its editorial visual language.',
    homeAriaLabel: 'Internal visual search concept home',
    pageTitle: 'Vision Search — Internal'
  },
  // Example skin — edit these values (or set to {}) to restore the built-in palette.
  theme: {
    accent: '#7c9cff',
    'accent-dark': '#5f81ec'
  }
};