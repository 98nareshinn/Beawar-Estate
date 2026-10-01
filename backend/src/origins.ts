// Explicit origins only: adding a local address does not disable CSRF checks.
export function configuredOrigins(primary: string, additional = "") {
  const entries = [primary, ...additional.split(",")].map(v => v.trim()).filter(Boolean);
  return new Set(entries.map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*')) {
      throw new Error('APP_ORIGIN and ADDITIONAL_ORIGINS must contain exact http(s) origins without paths or wildcards.');
    }
    return url.origin;
  }));
}
