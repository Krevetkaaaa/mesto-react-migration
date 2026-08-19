export const PHASE4_CHILD_STDIO = Object.freeze(["ignore", "ignore", "pipe"]);

export function childProcessHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}
