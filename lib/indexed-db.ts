import type {
  MedicationDraft,
  MedicationIntakeRecord,
  MoodRecord,
  SavedMedication,
  VisitSchedule,
} from "./types";
import { createSavedMedicationsFromDraft } from "./repositories/medications/create";

const DB_NAME = "addi-mvp";
const DB_VERSION = 3;
const MEDICATION_STORE = "userMedications";
const INTAKE_STORE = "medicationIntakeRecords";
const MOOD_STORE = "moodRecords";
const VISIT_STORE = "visitSchedules";
const UPCOMING_VISIT_ID = "upcoming";

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

export async function saveMedicationDraft(draft: MedicationDraft): Promise<SavedMedication[]> {
  const saved = createSavedMedicationsFromDraft(draft);
  await saveSavedMedications(saved);
  return saved;
}

export async function saveSavedMedications(medications: SavedMedication[]): Promise<void> {
  if (medications.length === 0) return;

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDICATION_STORE, "readwrite");
    const store = transaction.objectStore(MEDICATION_STORE);
    medications.forEach((medication) => store.add(medication));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("복용약을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("복용약 저장이 중단됐어요."));
  });

  database.close();
}

export async function getAllSavedMedications(): Promise<SavedMedication[]> {
  const database = await openDatabase();
  const result = await new Promise<SavedMedication[]>((resolve, reject) => {
    const request = database
      .transaction(MEDICATION_STORE, "readonly")
      .objectStore(MEDICATION_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as SavedMedication[]);
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
  const database = await openDatabase();
  const result = await new Promise<boolean>((resolve, reject) => {
    const request = database
      .transaction(INTAKE_STORE, "readonly")
      .objectStore(INTAKE_STORE)
      .index("medicationId")
      .getKey(medicationId);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error ?? new Error("복용 기록을 확인하지 못했어요."));
  });
  database.close();
  return result;
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

export async function getSavedMedicationsByIds(ids: string[]) {
  const all = await getSavedMedications();
  const idSet = new Set(ids);
  return all.filter((medication) => idSet.has(medication.id));
}

export async function getMedicationIntakeRecords(): Promise<MedicationIntakeRecord[]> {
  const database = await openDatabase();
  const result = await new Promise<MedicationIntakeRecord[]>((resolve, reject) => {
    const request = database
      .transaction(INTAKE_STORE, "readonly")
      .objectStore(INTAKE_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as MedicationIntakeRecord[]);
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
  const id = `${date}:${medicationId}`;
  const record: MedicationIntakeRecord = {
    id,
    medicationId,
    date,
    taken,
    recordedAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INTAKE_STORE, "readwrite");
    const store = transaction.objectStore(INTAKE_STORE);
    if (taken) store.put(record);
    else store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("복용 기록을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("복용 기록 저장이 중단됐어요."));
  });

  database.close();
  return taken ? record : null;
}

export async function getMoodRecordByDate(date: string): Promise<MoodRecord | null> {
  const database = await openDatabase();
  const result = await new Promise<MoodRecord | null>((resolve, reject) => {
    const request = database
      .transaction(MOOD_STORE, "readonly")
      .objectStore(MOOD_STORE)
      .index("date")
      .get(date);
    request.onsuccess = () => resolve((request.result as MoodRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("감정 기록을 불러오지 못했어요."));
  });
  database.close();
  return result;
}

export async function getMoodRecords(): Promise<MoodRecord[]> {
  const database = await openDatabase();
  const result = await new Promise<MoodRecord[]>((resolve, reject) => {
    const request = database
      .transaction(MOOD_STORE, "readonly")
      .objectStore(MOOD_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as MoodRecord[]);
    request.onerror = () => reject(request.error ?? new Error("감정 기록을 불러오지 못했어요."));
  });
  database.close();
  return result;
}

export async function saveMoodRecord(
  record: Omit<MoodRecord, "id">,
): Promise<MoodRecord> {
  const saved: MoodRecord = { ...record, id: record.date };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MOOD_STORE, "readwrite");
    transaction.objectStore(MOOD_STORE).put(saved);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("감정 기록을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("감정 기록 저장이 중단됐어요."));
  });
  database.close();
  return saved;
}

export async function getUpcomingVisit(): Promise<VisitSchedule | null> {
  const database = await openDatabase();
  const result = await new Promise<VisitSchedule | null>((resolve, reject) => {
    const request = database
      .transaction(VISIT_STORE, "readonly")
      .objectStore(VISIT_STORE)
      .get(UPCOMING_VISIT_ID);
    request.onsuccess = () => resolve((request.result as VisitSchedule | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("내원일정을 불러오지 못했어요."));
  });
  database.close();
  return result;
}

export async function saveUpcomingVisit(visitDate: string): Promise<VisitSchedule> {
  const current = await getUpcomingVisit();
  const now = new Date().toISOString();
  const saved: VisitSchedule = {
    id: UPCOMING_VISIT_ID,
    visitDate,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VISIT_STORE, "readwrite");
    transaction.objectStore(VISIT_STORE).put(saved);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("내원일정을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("내원일정 저장이 중단됐어요."));
  });

  database.close();
  return saved;
}

export async function deleteUpcomingVisit(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VISIT_STORE, "readwrite");
    transaction.objectStore(VISIT_STORE).delete(UPCOMING_VISIT_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("내원일정을 삭제하지 못했어요."));
    transaction.onabort = () => reject(transaction.error ?? new Error("내원일정 삭제가 중단됐어요."));
  });
  database.close();
}
