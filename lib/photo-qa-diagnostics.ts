export type PhotoQaFailureStage =
  | "camera-capture"
  | "jpeg"
  | "ocr-load"
  | "ocr-execution"
  | "ocr-text"
  | "candidate-parsing"
  | "official-search"
  | "official-match";

export type PhotoQaDiagnostics = {
  cameraCaptureSucceeded: boolean;
  jpegCreated: boolean;
  ocrExecuted: boolean;
  ocrTextPresent: boolean;
  candidateCount: number;
  officialSearchAttemptCount: number;
  officialSearchSuccessCount: number;
  officialMatchCount: number;
  finalResultCount: number;
  failureStage?: PhotoQaFailureStage;
  timingMs: {
    imagePreparation: number;
    workerLoad: number;
    ocr: number;
    officialMatching: number;
    total: number;
  };
};

const PHOTO_QA_DIAGNOSTICS_KEY = "addi-photo-qa-diagnostics";

export function createPhotoQaDiagnostics(
  patch: Partial<PhotoQaDiagnostics> = {},
): PhotoQaDiagnostics {
  return {
    cameraCaptureSucceeded: false,
    jpegCreated: false,
    ocrExecuted: false,
    ocrTextPresent: false,
    candidateCount: 0,
    officialSearchAttemptCount: 0,
    officialSearchSuccessCount: 0,
    officialMatchCount: 0,
    finalResultCount: 0,
    timingMs: {
      imagePreparation: 0,
      workerLoad: 0,
      ocr: 0,
      officialMatching: 0,
      total: 0,
    },
    ...patch,
  };
}

/**
 * Keeps privacy-safe QA status in this browser tab only. It never includes the
 * captured image, OCR text, medication names, or any other health information.
 */
export function savePhotoQaDiagnostics(diagnostics: PhotoQaDiagnostics) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PHOTO_QA_DIAGNOSTICS_KEY, JSON.stringify(diagnostics));
}

export function getPhotoQaDiagnostics(): PhotoQaDiagnostics | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.sessionStorage.getItem(PHOTO_QA_DIAGNOSTICS_KEY);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as PhotoQaDiagnostics;
  } catch {
    return undefined;
  }
}
