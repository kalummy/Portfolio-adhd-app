export type HomeDataFailureSource =
  | "medications_failed"
  | "intake_failed"
  | "moods_failed"
  | "visits_failed";

export class HomeDataLoadError extends Error {
  readonly source: HomeDataFailureSource;

  constructor(source: HomeDataFailureSource, cause: unknown) {
    super(source, { cause });
    this.name = "HomeDataLoadError";
    this.source = source;
  }
}

export async function identifyHomeDataFailure<T>(
  source: HomeDataFailureSource,
  request: Promise<T>,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw new HomeDataLoadError(source, error);
  }
}

export function createSingleFlight<TResult>(task: () => Promise<TResult>) {
  let inFlight: Promise<TResult> | null = null;

  return () => {
    if (inFlight) return inFlight;

    const request = task().finally(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return inFlight;
  };
}
