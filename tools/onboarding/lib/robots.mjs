// Minimal robots.txt fetch + Disallow matcher for the `User-agent: *` group.
// Conservative by design: on any fetch/parse error we treat paths as allowed but
// keep the crawl small and polite via the caller's rate limits.

export async function loadRobots(origin) {
  const disallow = [];
  try {
    const res = await fetch(new URL('/robots.txt', origin), { redirect: 'follow' });
    if (res.ok) {
      const text = await res.text();
      let active = false;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        const [field, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const key = field.trim().toLowerCase();
        if (key === 'user-agent') {
          active = value === '*';
        } else if (active && key === 'disallow' && value) {
          disallow.push(value);
        } else if (active && key === 'allow') {
          // (allow overrides are ignored in v1; we only honor Disallow)
        }
      }
    }
  } catch {
    // ignore — treat as no restrictions
  }
  return {
    disallow,
    isAllowed(pathname) {
      return !disallow.some((rule) => pathname.startsWith(rule));
    },
  };
}
