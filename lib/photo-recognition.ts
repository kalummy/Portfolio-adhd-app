import type { MedicationCandidate } from "./types";
import { selectOfficialMedicationCandidate } from "./medication-candidates";
import {
  createPhotoQaDiagnostics,
  type PhotoQaDiagnostics,
} from "./photo-qa-diagnostics";

export type OcrMedicationReading = {
  query: string;
  strengthValue?: number;
};

type OfficialMedicationSearchResult = {
  searchSucceeded: boolean;
  medication?: MedicationCandidate;
};

type PhotoQaReporter = (diagnostics: PhotoQaDiagnostics) => void;

type MedicationSearchResponse = {
  medications?: MedicationCandidate[];
};

const OCR_PRODUCT_CORRECTIONS: Array<{
  includes: RegExp;
  query: string;
}> = [
  { includes: /피출|레피졸/, query: "레피졸정" },
  { includes: /에스시탈로프람/, query: "산도스에스시탈로프람정" },
  { includes: /[코콘]서타/, query: "콘서타OROS서방정" },
  { includes: /클로나제[팝팜]/, query: "환인클로나제팜정" },
  { includes: /알프[라림][암람]?/, query: "알프람정" },
];

type LoadedOcrImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function loadOcrImage(photo: Blob): Promise<LoadedOcrImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(photo);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // iOS versions with partial createImageBitmap support use the image fallback.
    }
  }

  const objectUrl = URL.createObjectURL(photo);
  const image = document.createElement("img");
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("OCR 이미지를 열지 못했어요."));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(objectUrl),
  };
}

function otsuThreshold(histogram: Uint32Array, pixelCount: number) {
  let sum = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    sum += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 160;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = pixelCount - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight
      * foregroundWeight
      * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = value;
    }
  }
  return Math.min(210, Math.max(90, threshold));
}

function applyDocumentThreshold(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const histogram = new Uint32Array(256);

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
    histogram[gray] += 1;
  }

  const threshold = otsuThreshold(histogram, width * height);
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
    const output = gray <= threshold ? 0 : 255;
    data[index] = output;
    data[index + 1] = output;
    data[index + 2] = output;
    data[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
}

async function prepareOcrImage(photo: Blob) {
  try {
    const loaded = await loadOcrImage(photo);
    const longestSide = Math.max(loaded.width, loaded.height);
    const scale = Math.min(2_400 / longestSide, Math.max(1, 1_600 / longestSide));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      loaded.release();
      return photo;
    }

    context.drawImage(loaded.source, 0, 0, width, height);
    loaded.release();
    applyDocumentThreshold(context, width, height);

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((processed) => resolve(processed ?? photo), "image/png");
    });
  } catch {
    return photo;
  }
}

type ParsedStrength = { start: number; end: number; value: number };

function parseStrength(value: string): ParsedStrength | undefined {
  const normalized = value.replace(/,/g, ".").replace(/㎎/g, "mg");
  const match = /(\d+(?:\.\d+)?)\s*(?:mg|rn9|m9|밀리그(?:램|람))/i.exec(normalized);
  if (match) {
    return {
      start: match.index,
      end: match.index + match[0].length,
      value: Number(match[1]),
    };
  }

  for (const suffix of ["019", "009", "09"]) {
    if (!normalized.endsWith(suffix)) continue;
    const prefix = normalized.slice(0, -suffix.length);
    const ocrMatch = prefix.match(/(\d+(?:\.\d+)?)$/);
    if (ocrMatch) {
      const start = ocrMatch.index ?? prefix.length;
      return { start, end: normalized.length, value: Number(ocrMatch[1]) };
    }
  }
  return undefined;
}

function normalizeProductQuery(value: string) {
  const koreanText = value
    .replace(/[^가-힣A-Za-z]/g, "")
    .replace(/성$/, "정")
    .replace(/제팝/g, "제팜");

  for (const correction of OCR_PRODUCT_CORRECTIONS) {
    if (correction.includes.test(koreanText)) return correction.query;
  }

  const medicineName = koreanText.match(
    /[가-힣A-Za-z]{2,}(?:구강붕해정|리타드캡슐|서방캡슐|연질캡슐|장용캡슐|서방정|장용정|캡슐|시럽|산|액|정)/,
  )?.[0];
  return medicineName ?? "";
}

export function parseMedicationReadings(ocrText: string): OcrMedicationReading[] {
  const readings: OcrMedicationReading[] = [];
  const lines = ocrText
    .split(/\r?\n/)
    .map((rawLine) => rawLine.replace(/\s/g, "").replace(/㎎/g, "mg"))
    .filter(Boolean)
    .map((compactLine) => {
      const strength = parseStrength(compactLine);
      const nameText = strength
        ? `${compactLine.slice(0, strength.start)}${compactLine.slice(strength.end)}`
        : compactLine;
      return {
        compactLine,
        strength,
        query: /[가-힣]/.test(compactLine) ? normalizeProductQuery(nameText) : "",
      };
    });

  for (let index = 0; index < lines.length; index += 1) {
    const { query } = lines[index];
    if (!query) continue;

    let strength = lines[index].strength;
    if (!strength) {
      for (const distance of [1, 2]) {
        const neighbors = [lines[index + distance], lines[index - distance]];
        const strengthOnlyLine = neighbors.find((line) => (
          line?.strength && !line.query
        ));
        if (strengthOnlyLine?.strength) {
          strength = strengthOnlyLine.strength;
          break;
        }
      }
    }

    const duplicate = readings.some(
      (reading) => reading.query === query && reading.strengthValue === strength?.value,
    );
    if (!duplicate) readings.push({ query, strengthValue: strength?.value });
  }

  return readings;
}

export function isOfficialMedicationMatch(
  reading: OcrMedicationReading,
  medication: MedicationCandidate,
) {
  if (reading.strengthValue === undefined) return false;
  return selectOfficialMedicationCandidate(
    reading.query,
    reading.strengthValue,
    [medication],
  ).status === "matched";
}

async function searchOfficialMedication(reading: OcrMedicationReading) {
  const response = await fetch(
    `/api/medications/search?q=${encodeURIComponent(reading.query)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!response.ok) return { searchSucceeded: false };

  const payload = await response.json() as MedicationSearchResponse;
  const medications = payload.medications ?? [];
  if (medications.length === 0 || reading.strengthValue === undefined) {
    return { searchSucceeded: true };
  }

  const selection = selectOfficialMedicationCandidate(
    reading.query,
    reading.strengthValue,
    medications,
  );
  if (selection.status !== "matched") return { searchSucceeded: true };

  const matchedMedication = selection.medication;
  if (!matchedMedication.catalogId) {
    return { searchSucceeded: true, medication: matchedMedication };
  }

  const detailResponse = await fetch(
    `/api/medications/${encodeURIComponent(matchedMedication.catalogId)}`,
    { cache: "no-store", signal: AbortSignal.timeout(12_000) },
  ).catch(() => undefined);
  if (!detailResponse?.ok) {
    return { searchSucceeded: true, medication: matchedMedication };
  }
  const detailPayload = await detailResponse.json() as { medication?: MedicationCandidate };

  return {
    searchSucceeded: true,
    medication: detailPayload.medication ?? matchedMedication,
  };
}

export async function matchMedicationReadings(
  readings: OcrMedicationReading[],
  searchMedication: (
    reading: OcrMedicationReading,
  ) => Promise<OfficialMedicationSearchResult> = searchOfficialMedication,
) {
  const matches = await Promise.all(
    readings.map((reading) =>
      searchMedication(reading).catch(
        (): OfficialMedicationSearchResult => ({ searchSucceeded: false }),
      ),
    ),
  );
  const seenCatalogIds = new Set<string>();
  const medications: MedicationCandidate[] = [];

  for (const match of matches) {
    const medication = match.medication;
    if (!medication) continue;
    if (medication.catalogId && seenCatalogIds.has(medication.catalogId)) continue;
    if (medication.catalogId) seenCatalogIds.add(medication.catalogId);
    medications.push(medication);
  }

  return {
    medications,
    searchSuccessCount: matches.filter((match) => match.searchSucceeded).length,
    matchCount: matches.filter((match) => Boolean(match.medication)).length,
  };
}

export async function recognizePrescriptionPhoto(
  photo: Blob,
  reportDiagnostics?: PhotoQaReporter,
) {
  const startedAt = performance.now();
  let diagnostics = createPhotoQaDiagnostics({
    cameraCaptureSucceeded: true,
    jpegCreated: photo.size > 0 && photo.type.startsWith("image/"),
  });
  let workerLoaded = false;
  let ocrStarted = false;
  const report = (patch: Partial<PhotoQaDiagnostics>) => {
    diagnostics = {
      ...diagnostics,
      ...patch,
      timingMs: patch.timingMs ?? diagnostics.timingMs,
    };
    reportDiagnostics?.(diagnostics);
  };

  if (photo.size === 0 || !photo.type.startsWith("image/")) {
    report({ failureStage: "jpeg", timingMs: { ...diagnostics.timingMs, total: performance.now() - startedAt } });
    return { ok: false as const, medications: [], diagnostics };
  }

  try {
    const preparationStartedAt = performance.now();
    const preparedPhoto = await prepareOcrImage(photo);
    diagnostics.timingMs.imagePreparation = performance.now() - preparationStartedAt;

    const workerLoadStartedAt = performance.now();
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker(["kor", "eng"]);
    workerLoaded = true;
    diagnostics.timingMs.workerLoad = performance.now() - workerLoadStartedAt;
    report({ timingMs: { ...diagnostics.timingMs } });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });
      const ocrStartedAt = performance.now();
      ocrStarted = true;
      const result = await worker.recognize(preparedPhoto);
      diagnostics.timingMs.ocr = performance.now() - ocrStartedAt;
      const ocrTextPresent = result.data.text.trim().length > 0;
      report({
        ocrExecuted: true,
        ocrTextPresent,
        failureStage: ocrTextPresent ? undefined : "ocr-text",
        timingMs: { ...diagnostics.timingMs },
      });

      const readings = parseMedicationReadings(result.data.text)
        .filter((reading) => reading.strengthValue !== undefined);
      report({
        candidateCount: readings.length,
        failureStage: readings.length > 0 ? undefined : "candidate-parsing",
      });

      if (readings.length === 0) {
        diagnostics.timingMs.total = performance.now() - startedAt;
        report({
          officialSearchAttemptCount: 0,
          officialSearchSuccessCount: 0,
          officialMatchCount: 0,
          finalResultCount: 0,
          failureStage: ocrTextPresent ? "candidate-parsing" : "ocr-text",
          timingMs: { ...diagnostics.timingMs },
        });
        return { ok: false as const, medications: [], diagnostics };
      }

      const matchingStartedAt = performance.now();
      const matchResult = await matchMedicationReadings(readings);
      diagnostics.timingMs.officialMatching = performance.now() - matchingStartedAt;
      diagnostics.timingMs.total = performance.now() - startedAt;
      const hasOfficialMedicationMatch = matchResult.medications.length > 0
        && matchResult.matchCount > 0;
      report({
        officialSearchAttemptCount: readings.length,
        officialSearchSuccessCount: matchResult.searchSuccessCount,
        officialMatchCount: matchResult.matchCount,
        finalResultCount: matchResult.medications.length,
        failureStage: hasOfficialMedicationMatch
          ? undefined
          : matchResult.searchSuccessCount > 0
            ? "official-match"
            : "official-search",
        timingMs: { ...diagnostics.timingMs },
      });

      return hasOfficialMedicationMatch
        ? { ok: true as const, medications: matchResult.medications, diagnostics }
        : { ok: false as const, medications: [], diagnostics };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch {
    diagnostics.timingMs.total = performance.now() - startedAt;
    report({
      failureStage: workerLoaded && ocrStarted ? "ocr-execution" : "ocr-load",
      timingMs: { ...diagnostics.timingMs },
    });
    return { ok: false as const, medications: [], diagnostics };
  }
}
