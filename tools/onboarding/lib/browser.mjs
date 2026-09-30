// Shared Playwright launcher for the onboarding scrapers.
// Prefers a REAL installed browser channel (Edge, then Chrome) so the page presents a genuine,
// non-headless fingerprint — the thing that actually gets past retail bot walls that stall
// bundled headless Chromium. Runs HEADED by default so a human can solve any challenge/CAPTCHA
// in the window; pass `--headless` to override (CI / cooperative sites).
import { chromium } from 'playwright';
import { log } from './util.mjs';

const CHANNELS = ['msedge', 'chrome']; // real installed browsers to prefer, in order

// Some retail CDNs drop automated HTTP/2 connections after the first request
// (net::ERR_HTTP2_PROTOCOL_ERROR on every deep link); forcing HTTP/1.1 fixes it.
const LAUNCH_ARGS = ['--disable-http2'];

/** Launch a browser. Prefers a real channel (Edge→Chrome); falls back to bundled Chromium.
 * `--headless` forces headless; default is headed. `--channel <name>` pins a specific channel. */
export async function launchBrowser(args = {}) {
  const headless = args.headless === true || args.headless === 'true';
  const wanted = args.channel ? [String(args.channel)] : CHANNELS;
  for (const channel of wanted) {
    try {
      const browser = await chromium.launch({ channel, headless, args: LAUNCH_ARGS });
      log.info(`Browser: ${channel}${headless ? ' (headless)' : ' (headed — solve any bot challenge in the window)'}.`);
      return browser;
    } catch {
      // channel not installed on this machine — try the next one
    }
  }
  log.warn('No real browser channel (Edge/Chrome) found; using bundled Chromium (more likely to be blocked).');
  return chromium.launch({ headless, args: LAUNCH_ARGS });
}

/** A fresh context + page at desktop size. Real channels carry their own genuine UA. */
export async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return context.newPage();
}
