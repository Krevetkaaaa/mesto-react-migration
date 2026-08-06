export function accountActionFailed(value: unknown) {
  return typeof value === "object" && value !== null && "error" in value;
}
