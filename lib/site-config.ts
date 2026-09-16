const fallbackSiteUrl = "http://localhost:3000";
const fallbackGaMeasurementId = "G-C32SXD74ZX";

export const canonicalSiteUrl = "https://www.agent-tech.ai";

export function getSiteUrl() {
  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!rawSiteUrl) {
    return fallbackSiteUrl;
  }

  return rawSiteUrl.endsWith("/") ? rawSiteUrl.slice(0, -1) : rawSiteUrl;
}

export const siteUrl = getSiteUrl();

export function getGaMeasurementId() {
  const rawMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  if (!rawMeasurementId) {
    return fallbackGaMeasurementId;
  }

  return rawMeasurementId;
}

export const gaMeasurementId = getGaMeasurementId();
