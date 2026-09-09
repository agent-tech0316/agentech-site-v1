/** A local animation cue, never an executable program or a robot command. */
export function parseWaveAction(value: string): "wave" | null {
  return value.trim().toLowerCase() === "wave" ? "wave" : null;
}
