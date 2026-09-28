declare global {
  interface Window {
    __VISIONSEARCH__?: {
      apiBaseUrl?: string;
      brand?: Partial<import('./branding').BrandConfig>;
      theme?: Record<string, string>;
    };
  }
}

// Resolve the API base URL from the runtime config (public/config.js), falling back
// to a build-time env var, then to the same origin. Trailing slash is trimmed.
const runtime = window.__VISIONSEARCH__?.apiBaseUrl?.trim();
const buildTime = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

export const API_BASE_URL = (runtime || buildTime || '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
