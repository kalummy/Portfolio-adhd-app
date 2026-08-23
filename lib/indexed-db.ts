import type {
  MedicationDraft,
  MedicationIntakeRecord,
  MoodRecord,
  SavedMedication,
  VisitSchedule,
} from "./types";
import { createClientId } from "./client-id";
import { createSavedMedicationsFromDraft } from "./repositories/medications/create";
import { assertValidVisitDate } from "./repositories/visit-schedules/validation";
import { getGuestDatasetReservationDecision } from "./guest-dataset-reservation";
import type { NewMoodRecord } from "./repositories/moods/types";

const DB_NAME = "addi-mvp";
const DB_VERSION = 7;
const MEDICATION_STORE = "userMedications";
const INTAKE_STORE = "medicationIntakeRecords";
const INTAKE_DATASET_STORE = "medicationIntakeDatasetMetadata";
const MOOD_STORE = "moodRecords";
const VISIT_STORE = "visitSchedules";
const UPCOMING_VISIT_ID = "upcoming";
const INTAKE_DATASET_STATE_ID = "active";

type MedicationIntakeDatasetClaim = {
  datasetId: string;
  claimedUserId: string;
  claimedAt: string;
};

type GuestMedicationDatasetClaim = {
  datasetId: string;
  medicationIds: string[];
  intakeRecordIds: string[];
  moodRecordIds: string[];
  reservedByUserId?: string;
  claimedUserId: string;
  claimedAt: string;
  createdAt: string;
  visitSchedule?: VisitSchedule;
};

type GuestVisitMutation = {
  kind: "upsert";
  schedule: VisitSchedule;
};

type LegacyMedicationIntakeDatasetState = {
  id: typeof INTAKE_DATASET_STATE_ID;
  activeDatasetId: string;
  activeRecordIds?: string[];
  reservedByUserId?: string;
  reservedAt?: string;
  claims?: MedicationIntakeDatasetClaim[];
};

type GuestMedicationDatasetState = {
  id: typeof INTAKE_DATASET_STATE_ID;
  activeDatasetId: string;
  medicationIds: string[];
  intakeRecordIds: string[];
  moodRecordIds: string[];
  createdAt: string;
  reservedByUserId?: string;
  reservedAt?: string;
  claims: GuestMedicationDatasetClaim[];
  visitMutation: GuestVisitMutation | null;
};

export type ReservedGuestMedicationDataset = {
  datasetId: string;
  medications: SavedMedication[];
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
  visitSchedule: VisitSchedule | null;
};

export type ClaimedGuestIntakeRecoveryCandidate = {
  datasetId: string;
  claimedUserId: string;
  claimedAt: string;
  medication: SavedMedication;
  intakeRecord: MedicationIntakeRecord;
  reason: "missing-server-medication";
};

export type ReservedMedicationIntakeDataset = {
  datasetId: string;
  records: MedicationIntakeRecord[];
};

function createGuestMedicationDatasetState(
  medicationIds: string[] = [],
  intakeRecordIds: string[] = [],
  visitMutation: GuestVisitMutation | null = null,
): GuestMedicationDatasetState {
  return {
    id: INTAKE_DATASET_STATE_ID,
    activeDatasetId: createClientId(),
    medicationIds,
    intakeRecordIds,
    moodRecordIds: [],
    createdAt: new Date().toISOString(),
    claims: [],
    visitMutation,
  };
}

function toStringKeys(keys: IDBValidKey[]) {
  return keys.filter((key): key is string => typeof key === "string");
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function normalizeGuestMedicationDatasetState(
  existing: LegacyMedicationIntakeDatasetState | GuestMedicationDatasetState | undefined,
  medicationIds: string[],
  intakeRecordIds: string[],
  legacyVisit: VisitSchedule | undefined,
): GuestMedicationDatasetState {
  if (!existing) {
    return createGuestMedicationDatasetState(
      medicationIds,
      intakeRecordIds,
      legacyVisit ? { kind: "upsert", schedule: legacyVisit } : null,
    );
  }

  const maybeGuest = existing as Partial<GuestMedicationDatasetState>;
  const legacyClaims = Array.isArray(existing.claims) ? existing.claims : [];
  return {
    id: INTAKE_DATASET_STATE_ID,
    activeDatasetId: typeof existing.activeDatasetId === "string"
      ? existing.activeDatasetId
      : createClientId(),
    medicationIds: Array.isArray(maybeGuest.medicationIds)
      ? uniqueIds(maybeGuest.medicationIds)
      : medicationIds,
    intakeRecordIds: Array.isArray(maybeGuest.intakeRecordIds)
      ? uniqueIds(maybeGuest.intakeRecordIds)
      : uniqueIds(
          "activeRecordIds" in existing && Array.isArray(existing.activeRecordIds)
            ? existing.activeRecordIds
            : intakeRecordIds,
        ),
    // Mood records created before ownership metadata existed remain legacy-only.
    // Never infer ownership by scanning the raw mood store.
    moodRecordIds: Array.isArray(maybeGuest.moodRecordIds)
      ? uniqueIds(maybeGuest.moodRecordIds)
      : [],
    createdAt: typeof maybeGuest.createdAt === "string"
      ? maybeGuest.createdAt
      : new Date().toISOString(),
    reservedByUserId: existing.reservedByUserId,
    reservedAt: existing.reservedAt,
    claims: legacyClaims.map((claim) => ({
      datasetId: claim.datasetId,
      medicationIds: "medicationIds" in claim && Array.isArray(claim.medicationIds)
        ? uniqueIds(claim.medicationIds)
        : [],
      intakeRecordIds: "intakeRecordIds" in claim && Array.isArray(claim.intakeRecordIds)
        ? uniqueIds(claim.intakeRecordIds)
        : [],
      moodRecordIds: "moodRecordIds" in claim && Array.isArray(claim.moodRecordIds)
        ? uniqueIds(claim.moodRecordIds)
        : [],
      reservedByUserId: "reservedByUserId" in claim && typeof claim.reservedByUserId === "string"
        ? claim.reservedByUserId
        : undefined,
      claimedUserId: claim.claimedUserId,
      claimedAt: claim.claimedAt,
      createdAt: "createdAt" in claim && typeof claim.createdAt === "string"
        ? claim.createdAt
        : claim.claimedAt,
      visitSchedule: "visitSchedule" in claim
        ? claim.visitSchedule as VisitSchedule | undefined
        : undefined,
    })),
    visitMutation: "visitMutation" in maybeGuest
      ? maybeGuest.visitMutation as GuestVisitMutation | null
      : legacyVisit
        ? { kind: "upsert", schedule: legacyVisit }
        : null,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MEDICATION_STORE)) {
        const store = database.createObjectStore(MEDICATION_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(INTAKE_STORE)) {
        const store = database.createObjectStore(INTAKE_STORE, { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("medicationId", "medicationId");
      }
      if (!database.objectStoreNames.contains(INTAKE_DATASET_STORE)) {
        database.createObjectStore(INTAKE_DATASET_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MOOD_STORE)) {
        const store = database.createObjectStore(MOOD_STORE, { keyPath: "id" });
        store.createIndex("date", "date", { unique: true });
      }
      if (!database.objectStoreNames.contains(VISIT_STORE)) {
        database.createObjectStore(VISIT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없어요."));
  });
}

async function ensureGuestMedicationDatasetState(
  database: IDBDatabase,
): Promise<GuestMedicationDatasetState> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [MEDICATION_STORE, INTAKE_STORE, INTAKE_DATASET_STORE, VISIT_STORE],
      "readwrite",
    );
    const medicationStore = transaction.objectStore(MEDICATION_STORE);
    const intakeStore = transaction.objectStore(INTAKE_STORE);
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const visitStore = transaction.objectStore(VISIT_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
    let state: GuestMedicationDatasetState | null = null;

    stateRequest.onsuccess = () => {
      const existing = stateRequest.result as
        | LegacyMedicationIntakeDatasetState
        | GuestMedicationDatasetState
        | undefined;
      const medicationKeysRequest = medicationStore.getAllKeys();
      medicationKeysRequest.onsuccess = () => {
        const intakeKeysRequest = intakeStore.getAllKeys();
        intakeKeysRequest.onsuccess = () => {
          const visitRequest = visitStore.get(UPCOMING_VISIT_ID);
          visitRequest.onsuccess = () => {
            state = normalizeGuestMedicationDatasetState(
              existing,
              toStringKeys(medicationKeysRequest.result),
              toStringKeys(intakeKeysRequest.result),
              visitRequest.result as VisitSchedule | undefined,
            );
            metadataStore.put(state);
          };
        };
      };
    };
    transaction.oncomplete = () => {
      if (state) resolve(state);
      else reject(new Error("복용 기록 데이터셋을 준비하지 못했어요."));
    };
    transaction.onerror = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋을 준비하지 못했어요."),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋 준비가 중단됐어요."),
    );
  });
}

export async function saveMedicationDraft(draft: MedicationDraft): Promise<SavedMedication[]> {
  const saved = createSavedMedicationsFromDraft(draft);
  await saveSavedMedications(saved);
  return saved;
}

export async function saveSavedMedications(medications: SavedMedication[]): Promise<void> {
  if (medications.length === 0) return;

  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [MEDICATION_STORE, INTAKE_DATASET_STORE],
      "readwrite",
    );
    const medicationStore = transaction.objectStore(MEDICATION_STORE);
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
    stateRequest.onsuccess = () => {
      const state = stateRequest.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }

      const medicationIds = new Set(state.medicationIds);
      medications.forEach((medication) => {
        medicationStore.add(medication);
        medicationIds.add(medication.id);
      });
      metadataStore.put({ ...state, medicationIds: [...medicationIds] });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("복용약을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("복용약 저장이 중단됐어요."));
  });

  database.close();
}

export async function getAllSavedMedications(): Promise<SavedMedication[]> {
  const database = await openDatabase();
  const dataset = await ensureGuestMedicationDatasetState(database);
  const result = await new Promise<SavedMedication[]>((resolve, reject) => {
    const request = database
      .transaction(MEDICATION_STORE, "readonly")
      .objectStore(MEDICATION_STORE)
      .getAll();
    request.onsuccess = () => {
      const medicationIds = new Set(dataset.medicationIds);
      resolve(
        (request.result as SavedMedication[]).filter(
          (medication) => medicationIds.has(medication.id),
        ),
      );
    };
    request.onerror = () => reject(request.error ?? new Error("복용약을 불러오지 못했어요."));
  });
  database.close();
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSavedMedications(): Promise<SavedMedication[]> {
  const all = await getAllSavedMedications();
  return all.filter((medication) => medication.active !== false);
}

export async function hasMedicationIntakeHistory(medicationId: string): Promise<boolean> {
  const records = await getMedicationIntakeRecords();
  return records.some((record) => record.medicationId === medicationId && record.taken);
}

export async function deactivateSavedMedication(medicationId: string): Promise<SavedMedication> {
  const database = await openDatabase();
  const result = await new Promise<SavedMedication>((resolve, reject) => {
    const transaction = database.transaction(MEDICATION_STORE, "readwrite");
    const store = transaction.objectStore(MEDICATION_STORE);
    const request = store.get(medicationId);
    let deactivated: SavedMedication | null = null;

    request.onsuccess = () => {
      const medication = request.result as SavedMedication | undefined;
      if (!medication) {
        transaction.abort();
        return;
      }

      deactivated = {
        ...medication,
        active: false,
        deactivatedAt: new Date().toISOString(),
      };
      store.put(deactivated);
    };
    request.onerror = () => reject(request.error ?? new Error("복용약을 찾지 못했어요."));
    transaction.oncomplete = () => {
      if (deactivated) resolve(deactivated);
      else reject(new Error("복용약을 찾지 못했어요."));
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("복용약을 삭제하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("복용약을 찾지 못했어요."));
  });
  database.close();
  return result;
}

export async function updateSavedMedicationSchedule(
  medicationId: string,
  patch: {
    schedule?: SavedMedication["schedule"];
    scheduledTime?: SavedMedication["scheduledTime"];
  },
): Promise<SavedMedication> {
  const database = await openDatabase();
  const result = await new Promise<SavedMedication>((resolve, reject) => {
    const transaction = database.transaction(MEDICATION_STORE, "readwrite");
    const store = transaction.objectStore(MEDICATION_STORE);
    const request = store.get(medicationId);
    let updated: SavedMedication | null = null;

    request.onsuccess = () => {
      const medication = request.result as SavedMedication | undefined;
      if (!medication) {
        transaction.abort();
        return;
      }

      updated = {
        ...medication,
        ...(Object.hasOwn(patch, "schedule") ? { schedule: patch.schedule } : {}),
        ...(Object.hasOwn(patch, "scheduledTime")
          ? { scheduledTime: patch.scheduledTime }
          : {}),
      };
      store.put(updated);
    };
    request.onerror = () => reject(request.error ?? new Error("복용약을 찾지 못했어요."));
    transaction.oncomplete = () => {
      if (updated) resolve(updated);
      else reject(new Error("복용약을 찾지 못했어요."));
    };
    transaction.onerror = () => reject(
      transaction.error ?? new Error("복용 일정을 수정하지 못했어요."),
    );
    transaction.onabort = () => reject(new Error("복용약을 찾지 못했어요."));
  });
  database.close();
  return result;
}

export async function getSavedMedicationsByIds(ids: string[]) {
  const all = await getSavedMedications();
  const idSet = new Set(ids);
  return all.filter((medication) => idSet.has(medication.id));
}

export async function getMedicationIntakeRecords(): Promise<MedicationIntakeRecord[]> {
  const database = await openDatabase();
  const dataset = await ensureGuestMedicationDatasetState(database);
  const result = await new Promise<MedicationIntakeRecord[]>((resolve, reject) => {
    const request = database
      .transaction(INTAKE_STORE, "readonly")
      .objectStore(INTAKE_STORE)
      .getAll();
    request.onsuccess = () => {
      const activeRecordIds = new Set(dataset.intakeRecordIds);
      resolve(
        (request.result as MedicationIntakeRecord[]).filter(
          (record) => activeRecordIds.has(record.id),
        ),
      );
    };
    request.onerror = () => reject(request.error ?? new Error("복용 기록을 불러오지 못했어요."));
  });
  database.close();
  return result;
}

export async function getMedicationIntakeRecordsByDate(date: string) {
  const records = await getMedicationIntakeRecords();
  return records.filter((record) => record.date === date && record.taken);
}

export async function setMedicationTaken(
  medicationId: string,
  date: string,
  taken: boolean,
): Promise<MedicationIntakeRecord | null> {
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);
  const id = `${date}:${medicationId}`;
  const record: MedicationIntakeRecord = {
    id,
    medicationId,
    date,
    taken,
    recordedAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [INTAKE_STORE, INTAKE_DATASET_STORE],
      "readwrite",
    );
    const store = transaction.objectStore(INTAKE_STORE);
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
    stateRequest.onsuccess = () => {
      const state = stateRequest.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }

      const activeRecordIds = new Set(state.intakeRecordIds);
      if (taken) {
        store.put(record);
        activeRecordIds.add(id);
      } else {
        store.delete(id);
        activeRecordIds.delete(id);
      }
      metadataStore.put({ ...state, intakeRecordIds: [...activeRecordIds] });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("복용 기록을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("복용 기록 저장이 중단됐어요."));
  });

  database.close();
  return taken ? record : null;
}

export async function reserveGuestMedicationDatasetForUser(
  userId: string,
): Promise<ReservedGuestMedicationDataset | null> {
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);

  let result: ReservedGuestMedicationDataset | null;
  try {
    result = await new Promise<ReservedGuestMedicationDataset | null>((resolve, reject) => {
      const transaction = database.transaction(
        [MEDICATION_STORE, INTAKE_STORE, INTAKE_DATASET_STORE, MOOD_STORE, VISIT_STORE],
        "readwrite",
      );
      const medicationStore = transaction.objectStore(MEDICATION_STORE);
      const intakeStore = transaction.objectStore(INTAKE_STORE);
      const moodStore = transaction.objectStore(MOOD_STORE);
      const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
      const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
      let reservation: ReservedGuestMedicationDataset | null = null;
      let reservationError: Error | null = null;

      stateRequest.onsuccess = () => {
        const state = stateRequest.result as GuestMedicationDatasetState | undefined;
        if (
          !state
          || (
            state.medicationIds.length === 0
            && state.intakeRecordIds.length === 0
            && state.moodRecordIds.length === 0
            && state.visitMutation === null
          )
        ) return;
        const reservationDecision = getGuestDatasetReservationDecision(state, userId);
        if (reservationDecision === "locked") {
          reservationError = new Error("guest_dataset_reserved_by_another_user");
          return;
        }

        metadataStore.put({
          ...state,
          reservedByUserId: userId,
          reservedAt: reservationDecision === "same-user"
            ? state.reservedAt ?? new Date().toISOString()
            : new Date().toISOString(),
        });

        const medicationsRequest = medicationStore.getAll();
        medicationsRequest.onsuccess = () => {
          const recordsRequest = intakeStore.getAll();
          recordsRequest.onsuccess = () => {
            const moodsRequest = moodStore.getAll();
            moodsRequest.onsuccess = () => {
              const medicationIds = new Set(state.medicationIds);
              const intakeRecordIds = new Set(state.intakeRecordIds);
              const moodRecordIds = new Set(state.moodRecordIds);
              reservation = {
                datasetId: state.activeDatasetId,
                medications: (medicationsRequest.result as SavedMedication[]).filter(
                  (medication) => medicationIds.has(medication.id),
                ),
                intakeRecords: (recordsRequest.result as MedicationIntakeRecord[]).filter(
                  (record) => intakeRecordIds.has(record.id),
                ),
                moodRecords: (moodsRequest.result as MoodRecord[]).filter(
                  (record) => moodRecordIds.has(record.id),
                ),
                visitSchedule: state.visitMutation?.kind === "upsert"
                  ? state.visitMutation.schedule
                  : null,
              };
            };
          };
        };
      };
      transaction.oncomplete = () => {
        if (reservationError) reject(reservationError);
        else resolve(reservation);
      };
      transaction.onerror = () => reject(
        transaction.error ?? new Error("복용 기록 데이터셋을 예약하지 못했어요."),
      );
      transaction.onabort = () => reject(
        transaction.error ?? new Error("복용 기록 데이터셋 예약이 중단됐어요."),
      );
    });
  } finally {
    database.close();
  }

  return result;
}

export async function completeGuestMedicationDatasetClaim(
  datasetId: string,
  userId: string,
): Promise<void> {
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INTAKE_DATASET_STORE, "readwrite");
    const store = transaction.objectStore(INTAKE_DATASET_STORE);
    const request = store.get(INTAKE_DATASET_STATE_ID);

    request.onsuccess = () => {
      const state = request.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }

      const existingClaim = state.claims.find((claim) => claim.datasetId === datasetId);
      if (existingClaim) {
        if (existingClaim.claimedUserId !== userId) transaction.abort();
        return;
      }
      if (
        state.activeDatasetId !== datasetId
        || state.reservedByUserId !== userId
      ) {
        transaction.abort();
        return;
      }

      const claimedAt = new Date().toISOString();
      store.put({
        id: INTAKE_DATASET_STATE_ID,
        activeDatasetId: createClientId(),
        medicationIds: [],
        intakeRecordIds: [],
        moodRecordIds: [],
        createdAt: new Date().toISOString(),
        visitMutation: null,
        claims: [
          ...state.claims,
          {
            datasetId,
            medicationIds: state.medicationIds,
            intakeRecordIds: state.intakeRecordIds,
            moodRecordIds: state.moodRecordIds,
            reservedByUserId: state.reservedByUserId,
            claimedUserId: userId,
            claimedAt,
            createdAt: state.createdAt,
            visitSchedule: state.visitMutation?.kind === "upsert"
              ? state.visitMutation.schedule
              : undefined,
          },
        ],
      } satisfies GuestMedicationDatasetState);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋을 귀속하지 못했어요."),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋 귀속이 중단됐어요."),
    );
  });

  database.close();
}

export async function releaseGuestMedicationDatasetReservation(
  datasetId: string,
  userId: string,
): Promise<void> {
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INTAKE_DATASET_STORE, "readwrite");
    const store = transaction.objectStore(INTAKE_DATASET_STORE);
    const request = store.get(INTAKE_DATASET_STATE_ID);
    request.onsuccess = () => {
      const state = request.result as GuestMedicationDatasetState | undefined;
      if (
        !state
        || state.activeDatasetId !== datasetId
        || state.reservedByUserId !== userId
      ) return;

      const { reservedByUserId: _reservedByUserId, reservedAt: _reservedAt, ...released } = state;
      store.put(released);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋 예약을 해제하지 못했어요."),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("복용 기록 데이터셋 예약 해제가 중단됐어요."),
    );
  });

  database.close();
}

export async function reserveMedicationIntakeDatasetForUser(
  userId: string,
): Promise<ReservedMedicationIntakeDataset | null> {
  const reservation = await reserveGuestMedicationDatasetForUser(userId);
  return reservation
    ? { datasetId: reservation.datasetId, records: reservation.intakeRecords }
    : null;
}

export async function completeMedicationIntakeDatasetClaim(
  datasetId: string,
  userId: string,
): Promise<void> {
  await completeGuestMedicationDatasetClaim(datasetId, userId);
}

export async function releaseMedicationIntakeDatasetReservation(
  datasetId: string,
  userId: string,
): Promise<void> {
  await releaseGuestMedicationDatasetReservation(datasetId, userId);
}

export async function findClaimedGuestIntakeRecoveryCandidates(
  userId: string,
  existingServerMedicationIds: string[],
): Promise<ClaimedGuestIntakeRecoveryCandidate[]> {
  const database = await openDatabase();
  const state = await ensureGuestMedicationDatasetState(database);
  const result = await new Promise<ClaimedGuestIntakeRecoveryCandidate[]>((resolve, reject) => {
    const transaction = database.transaction(
      [MEDICATION_STORE, INTAKE_STORE],
      "readonly",
    );
    const medicationRequest = transaction.objectStore(MEDICATION_STORE).getAll();
    const intakeRequest = transaction.objectStore(INTAKE_STORE).getAll();

    transaction.oncomplete = () => {
      const medications = medicationRequest.result as SavedMedication[];
      const intakes = intakeRequest.result as MedicationIntakeRecord[];
      const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
      const intakeById = new Map(intakes.map((record) => [record.id, record]));
      const activeRecordIds = new Set(state.intakeRecordIds);
      const serverMedicationIds = new Set(existingServerMedicationIds);
      const candidates: ClaimedGuestIntakeRecoveryCandidate[] = [];

      state.claims
        .filter((claim) => claim.claimedUserId === userId)
        .forEach((claim) => {
          claim.intakeRecordIds.forEach((recordId) => {
            if (activeRecordIds.has(recordId)) return;

            const intakeRecord = intakeById.get(recordId);
            if (!intakeRecord?.taken) return;

            const medication = medicationById.get(intakeRecord.medicationId);
            if (!medication || serverMedicationIds.has(medication.id)) return;

            candidates.push({
              datasetId: claim.datasetId,
              claimedUserId: claim.claimedUserId,
              claimedAt: claim.claimedAt,
              medication,
              intakeRecord,
              reason: "missing-server-medication",
            });
          });
        });

      resolve(candidates);
    };
    transaction.onerror = () => reject(
      transaction.error ?? new Error("복구 후보 데이터를 확인하지 못했어요."),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("복구 후보 확인이 중단됐어요."),
    );
  });
  database.close();
  return result;
}

export async function getMoodRecordByDate(date: string): Promise<MoodRecord | null> {
  return (await getMoodRecords()).find((record) => record.date === date) ?? null;
}

export async function getMoodRecords(): Promise<MoodRecord[]> {
  const database = await openDatabase();
  const state = await ensureGuestMedicationDatasetState(database);
  const result = await new Promise<MoodRecord[]>((resolve, reject) => {
    const request = database
      .transaction(MOOD_STORE, "readonly")
      .objectStore(MOOD_STORE)
      .getAll();
    request.onsuccess = () => {
      const activeIds = new Set(state.moodRecordIds);
      resolve((request.result as MoodRecord[]).filter((record) => activeIds.has(record.id)));
    };
    request.onerror = () => reject(request.error ?? new Error("감정 기록을 불러오지 못했어요."));
  });
  database.close();
  return result;
}

export async function saveMoodRecord(
  record: NewMoodRecord,
): Promise<MoodRecord> {
  const saved: MoodRecord = { ...record, id: record.date };
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [MOOD_STORE, INTAKE_DATASET_STORE],
      "readwrite",
    );
    const moodStore = transaction.objectStore(MOOD_STORE);
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
    stateRequest.onsuccess = () => {
      const state = stateRequest.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }
      moodStore.put(saved);
      metadataStore.put({
        ...state,
        moodRecordIds: uniqueIds([...state.moodRecordIds, saved.id]),
      } satisfies GuestMedicationDatasetState);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("감정 기록을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("감정 기록 저장이 중단됐어요."));
  });
  database.close();
  return saved;
}

export async function getUpcomingVisit(): Promise<VisitSchedule | null> {
  const database = await openDatabase();
  const state = await ensureGuestMedicationDatasetState(database);
  const result = state.visitMutation?.kind === "upsert"
    ? state.visitMutation.schedule
    : null;
  database.close();
  return result;
}

export async function saveUpcomingVisit(visitDate: string): Promise<VisitSchedule> {
  assertValidVisitDate(visitDate);
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);
  let saved: VisitSchedule | null = null;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [VISIT_STORE, INTAKE_DATASET_STORE],
      "readwrite",
    );
    const visitStore = transaction.objectStore(VISIT_STORE);
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);

    stateRequest.onsuccess = () => {
      const state = stateRequest.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }

      const current = state.visitMutation?.kind === "upsert"
        ? state.visitMutation.schedule
        : null;
      const now = new Date().toISOString();
      saved = {
        id: UPCOMING_VISIT_ID,
        visitDate,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      visitStore.put(saved);
      metadataStore.put({
        ...state,
        visitMutation: { kind: "upsert", schedule: saved },
      } satisfies GuestMedicationDatasetState);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("내원일정을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("내원일정 저장이 중단됐어요."));
  });

  database.close();
  if (!saved) throw new Error("내원일정을 저장하지 못했어요.");
  return saved;
}

export async function deleteUpcomingVisit(): Promise<void> {
  const database = await openDatabase();
  await ensureGuestMedicationDatasetState(database);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [VISIT_STORE, INTAKE_DATASET_STORE],
      "readwrite",
    );
    const metadataStore = transaction.objectStore(INTAKE_DATASET_STORE);
    const stateRequest = metadataStore.get(INTAKE_DATASET_STATE_ID);
    stateRequest.onsuccess = () => {
      const state = stateRequest.result as GuestMedicationDatasetState | undefined;
      if (!state) {
        transaction.abort();
        return;
      }

      transaction.objectStore(VISIT_STORE).delete(UPCOMING_VISIT_ID);
      metadataStore.put({
        ...state,
        visitMutation: null,
      } satisfies GuestMedicationDatasetState);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("내원일정을 삭제하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("내원일정 삭제가 중단됐어요."));
  });
  database.close();
}
