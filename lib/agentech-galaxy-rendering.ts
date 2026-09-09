/** Angle along one of the galaxy's two star streams. */
export function getGalaxySpiralAngle(
  base: number,
  radius: number,
  time: number,
  phase: number,
  spin: number,
) {
  // Rotate the stream together; individual stars only wander within their arm.
  // Accumulating a different speed per star eventually destroys the spiral.
  return base + radius * 7.4 + time * 0.82 + phase * 0.02
    + Math.sin(time * 0.7 + phase) * spin * 0.3;
}

/** Center of the visible animation area, excluding the partner strip. */
export function getGalaxyFormationCenter({
  canvasWidth,
  canvasHeight,
  bottomContentHeight,
}: {
  canvasWidth: number;
  canvasHeight: number;
  bottomContentHeight: number;
}) {
  const width = Math.max(0, canvasWidth);
  const height = Math.max(0, canvasHeight);
  const reservedHeight = Math.min(height, Math.max(0, bottomContentHeight));
  const visualHeight = height - reservedHeight;

  return {
    x: width / 2,
    y: visualHeight / 2,
    visualHeight,
  };
}
