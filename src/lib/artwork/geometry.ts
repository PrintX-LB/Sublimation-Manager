export function mmToPixels(mm: number, dpi: number) {
  if (!Number.isFinite(mm) || mm <= 0 || !Number.isFinite(dpi) || dpi <= 0)
    throw new Error("INVALID_PRINT_SIZE");
  return Math.round((mm / 25.4) * dpi);
}
export function rotatePoint(x: number, y: number, angleDegrees: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}
export function clampZoom(value: number) {
  return Math.min(8, Math.max(0.1, value));
}
