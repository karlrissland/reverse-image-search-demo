// Shared helpers for the onboarding scripts. Keyless, dependency-light.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root = tools/onboarding/lib -> up three. */
export function repoRoot() {
  return resolve(here, '..', '..', '..');
}

export function dataRoot() {
  return join(repoRoot(), 'data');
}

/** Parse `--key value`, `--key=value`, and boolean `--flag`. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    if (eq !== -1) {
      args[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

/** Stable 32-char hex id derived from the most stable identifier available. */
export function stableHash(...parts) {
  const seed = parts.filter(Boolean).join('|');
  return createHash('md5').update(seed).digest('hex');
}

export function requireArg(args, name) {
  const v = args[name];
  if (!v || v === true) {
    throw new Error(`Missing required --${name} argument. See tools/onboarding/CONTRACT.md.`);
  }
  return String(v);
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Write pretty JSON as UTF-8 (no BOM) with a trailing newline, matching repo style. */
export async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export { existsSync, join, resolve };

export const log = {
  info: (m) => console.log(m),
  ok: (m) => console.log(`\x1b[32m${m}\x1b[0m`),
  warn: (m) => console.warn(`\x1b[33m${m}\x1b[0m`),
  err: (m) => console.error(`\x1b[31m${m}\x1b[0m`),
};

/** Convert a `rgb(…)` / `rgba(…)` / `#hex` color string to `#rrggbb`, or null. */
export function toHex(color) {
  if (!color) return null;
  const c = String(color).trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return ('#' + c.slice(1).split('').map((x) => x + x).join('')).toLowerCase();
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1, 4).map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Mix a hex color toward black (amount 0..1) — used for hover/darker variants. */
export function darken(hex, amount = 0.2) {
  const h = toHex(hex);
  if (!h) return hex;
  const n = parseInt(h.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
