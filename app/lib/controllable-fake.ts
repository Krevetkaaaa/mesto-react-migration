import { ApplicationError } from "./application-error";

export abstract class ControllableFake {
  private plannedFailure: ApplicationError | undefined;

  failNext(
    error: ApplicationError = new ApplicationError(
      "unavailable",
      "Planned fake dependency failure",
    ),
  ) {
    this.plannedFailure = error;
  }

  protected async throwPlannedFailure() {
    await Promise.resolve();
    const error = this.plannedFailure;
    this.plannedFailure = undefined;
    if (error) throw error;
  }
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
