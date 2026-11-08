export const workflowAccentPalette = [
  { dark: "#75d4c2", light: "#007d6f" },
  { dark: "#83c8ef", light: "#365f91" },
  { dark: "#f0a56b", light: "#c85016" },
  { dark: "#c7aff2", light: "#6f42c1" },
  { dark: "#99d5a8", light: "#347044" }
] as const;

function hexToRelativeLuminance(hex: string) {
  const normalized = hex.replace("#", "");
  const channels = normalized.match(/.{2}/g);

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received: ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = hexToRelativeLuminance(foreground);
  const backgroundLuminance = hexToRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}
