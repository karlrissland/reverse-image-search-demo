// apply-branding.mjs — map branding.json into BOTH apps' public/config.js (window.__VISIONSEARCH__).
// Preserves apiBaseUrl; writes brand.* + theme tokens using each app's token names.
// Interface + mapping table pinned in tools/onboarding/CONTRACT.md.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, requireArg, repoRoot, readJson, existsSync, toHex, log } from './lib/util.mjs';

// palette key -> [publicToken, internalToken]
const TOKEN_MAP = {
  primary: ['forest', 'accent'],
  primaryHover: ['forest-hover', 'accent-dark'],
  secondary: ['rose', 'blue'],
  background: ['paper', 'bg'],
  surface: ['surface', 'surface'],
  ink: ['ink', 'ink'],
  muted: ['muted', 'muted'],
  line: ['line', 'line'],
  danger: ['danger', 'danger'],
};

const APPS = {
  public: { path: 'src/apps/public/public/config.js', side: 0, title: (t) => t },
  internal: { path: 'src/apps/internal/public/config.js', side: 1, title: (t) => (/internal/i.test(t) ? t : `${t} — Internal`) },
};

async function main() {
  const args = parseArgs();
  const inputPath = requireArg(args, 'input');
  const branding = await readJson(inputPath);
  const root = repoRoot();

  for (const [label, app] of Object.entries(APPS)) {
    const abs = join(root, app.path);
    if (!existsSync(abs)) { log.warn(`Skipping ${label}: ${app.path} not found.`); continue; }
    const apiBaseUrl = readApiBaseUrl(await readFile(abs, 'utf8'));
    const theme = mapTheme(branding.palette, app.side);
    const brand = mapBrand(branding.brand, app.title);
    await writeFile(abs, renderConfig(label, apiBaseUrl, brand, theme), 'utf8');
    log.ok(`Skinned ${app.path}`);
  }
  log.info('Reload each app (npm run dev) to preview. On approval, commit with a descriptive message.');
}

function readApiBaseUrl(src) {
  const m = src.match(/apiBaseUrl:\s*'([^']*)'/);
  return m ? m[1] : '';
}

function mapTheme(palette = {}, side) {
  const theme = {};
  for (const [key, tokens] of Object.entries(TOKEN_MAP)) {
    const hex = toHex(palette[key]);
    if (hex) theme[tokens[side]] = hex;
  }
  return theme;
}

function mapBrand(brand = {}, titleFn) {
  const out = {};
  const keys = ['name', 'tagline', 'heroTitle', 'heroSubtitle', 'footerNote', 'pageTitle', 'logoUrl', 'fontUrl'];
  for (const k of keys) {
    const v = brand[k];
    if (v === undefined || v === null || v === '') continue;
    out[k] = k === 'pageTitle' ? titleFn(String(v)) : v;
  }
  return out;
}

function renderConfig(label, apiBaseUrl, brand, theme) {
  const tokenComment = label === 'public'
    ? '// include: paper, surface, ink, muted, line, forest, forest-hover, rose, soft, danger.'
    : '// include: bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger.';
  return `// Runtime configuration for the ${label} site.
// Set apiBaseUrl to the Function API origin (e.g. https://vs-fn-xxxx.azurewebsites.net).
// Leaving it empty makes the app call the same origin under /api (useful behind a proxy).
// apiBaseUrl is stamped by src/hooks/configure-sites.ps1 at post-provision from AZURE_FUNCTION_URI.
//
// brand and theme skin the site at runtime — edit and reload, no rebuild required.
// This block was written by tools/onboarding/apply-branding.mjs. theme keys map to CSS
// custom properties (e.g. token -> --token). Available tokens
${tokenComment}
// Set theme to {} to restore the built-in palette.
window.__VISIONSEARCH__ = {
  apiBaseUrl: '${apiBaseUrl}',
  brand: ${indent(JSON.stringify(brand, null, 2), 2)},
  theme: ${indent(JSON.stringify(theme, null, 2), 2)}
};
`;
}

function indent(json, spaces) {
  const pad = ' '.repeat(spaces);
  return json.split('\n').map((line, i) => (i === 0 ? line : pad + line)).join('\n');
}

main().catch((err) => { log.err(err.stack || err.message); process.exit(1); });
