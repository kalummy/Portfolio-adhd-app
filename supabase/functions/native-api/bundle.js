const ADDI_MFDS_KEY = globalThis.Deno?.env.get("ADDI_DEV_MFDS_SERVICE_KEY"); const ADDI_MFDS_PILL_KEY = globalThis.Deno?.env.get("ADDI_DEV_MFDS_PILL_IDENTIFICATION_SERVICE_KEY");

// native-api:injected-client
function createBrowserSupabaseClient() {
  throw new Error("authenticated_client_required");
}

// lib/repositories/medications/mapper.ts
function fromSupabaseScheduledTime(value) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}
function fromSupabaseMedication(row) {
  return {
    id: row.id,
    catalogId: row.catalog_id ?? void 0,
    displayLabel: row.display_label ?? void 0,
    name: row.name,
    ingredientName: row.ingredient_name ?? void 0,
    strengthValue: row.strength_value,
    strengthUnit: row.strength_unit,
    manufacturer: row.manufacturer ?? void 0,
    englishName: row.english_name ?? void 0,
    imagePath: row.image_path,
    productImage: row.product_image ?? void 0,
    fallbackImage: row.fallback_image ?? void 0,
    imageType: row.image_type ?? void 0,
    imageSourceName: row.image_source_name ?? void 0,
    imageSourceUrl: row.image_source_url ?? void 0,
    searchKeywords: row.search_keywords ?? void 0,
    officialMatchStatus: row.official_match_status ?? void 0,
    registrationMethod: row.registration_method,
    schedule: row.schedule,
    scheduledTime: fromSupabaseScheduledTime(row.scheduled_time),
    active: row.active,
    deactivatedAt: row.deactivated_at ?? void 0,
    createdAt: row.created_at
  };
}
function toSupabaseMedication(medication2, userId) {
  return {
    ...toSupabaseMedicationMigrationInput(medication2),
    user_id: userId
  };
}
function toSupabaseMedicationMigrationInput(medication2) {
  return {
    id: medication2.id,
    catalog_id: medication2.catalogId ?? null,
    display_label: medication2.displayLabel ?? null,
    name: medication2.name,
    ingredient_name: medication2.ingredientName ?? null,
    strength_value: medication2.strengthValue,
    strength_unit: medication2.strengthUnit,
    manufacturer: medication2.manufacturer ?? null,
    english_name: medication2.englishName ?? null,
    image_path: medication2.imagePath,
    product_image: medication2.productImage ?? null,
    fallback_image: medication2.fallbackImage ?? null,
    image_type: medication2.imageType ?? null,
    image_source_name: medication2.imageSourceName ?? null,
    image_source_url: medication2.imageSourceUrl ?? null,
    search_keywords: medication2.searchKeywords ?? null,
    official_match_status: medication2.officialMatchStatus ?? null,
    registration_method: medication2.registrationMethod,
    schedule: medication2.schedule,
    scheduled_time: medication2.scheduledTime ?? null,
    active: medication2.active !== false,
    deactivated_at: medication2.deactivatedAt ?? null,
    created_at: medication2.createdAt,
    updated_at: medication2.deactivatedAt ?? medication2.createdAt
  };
}

// lib/repositories/medications/supabase.ts
var MEDICATION_COLUMNS = [
  "id",
  "user_id",
  "catalog_id",
  "display_label",
  "name",
  "ingredient_name",
  "strength_value",
  "strength_unit",
  "manufacturer",
  "english_name",
  "image_path",
  "product_image",
  "fallback_image",
  "image_type",
  "image_source_name",
  "image_source_url",
  "search_keywords",
  "official_match_status",
  "registration_method",
  "schedule",
  "scheduled_time",
  "active",
  "deactivated_at",
  "created_at",
  "updated_at"
].join(",");
function sortByCreatedAt(medications) {
  return medications.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function createSupabaseMedicationRepository(userId, client) {
  const supabase = client ?? createBrowserSupabaseClient();
  async function list(activeOnly) {
    let query = supabase.from("user_medications").select(MEDICATION_COLUMNS).eq("user_id", userId).order("created_at", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return sortByCreatedAt(
      data.map(fromSupabaseMedication)
    );
  }
  return {
    storageBackend: "supabase",
    listActive: () => list(true),
    listAll: () => list(false),
    async createMany(medications) {
      if (medications.length === 0) return [];
      const rows = medications.map((medication2) => toSupabaseMedication(medication2, userId));
      const { data, error } = await supabase.from("user_medications").upsert(rows, { onConflict: "user_id,id" }).select(MEDICATION_COLUMNS);
      if (error) throw error;
      const byId = new Map(
        data.map(fromSupabaseMedication).map((medication2) => [medication2.id, medication2])
      );
      return medications.map((medication2) => byId.get(medication2.id) ?? medication2);
    },
    async migrateInitial(medications) {
      const rows = medications.map(toSupabaseMedicationMigrationInput);
      const { data, error } = await supabase.rpc("migrate_initial_user_medications", {
        p_medications: rows
      });
      if (error) throw error;
      const result = data?.[0];
      return {
        migrated: result?.migrated ?? false,
        insertedCount: result?.inserted_count ?? 0
      };
    },
    async deactivate(id2) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const { data, error } = await supabase.from("user_medications").update({ active: false, deactivated_at: now, updated_at: now }).eq("user_id", userId).eq("id", id2).select(MEDICATION_COLUMNS).single();
      if (error) throw error;
      return fromSupabaseMedication(data);
    },
    async updateSchedule(id2, patch) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const updates = { updated_at: now };
      if (Object.hasOwn(patch, "schedule")) updates.schedule = patch.schedule;
      if (Object.hasOwn(patch, "scheduledTime")) {
        updates.scheduled_time = patch.scheduledTime ?? null;
      }
      const { data, error } = await supabase.from("user_medications").update(updates).eq("user_id", userId).eq("id", id2).select(MEDICATION_COLUMNS).single();
      if (error) throw error;
      return fromSupabaseMedication(data);
    },
    async getByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("user_medications").select(MEDICATION_COLUMNS).eq("user_id", userId).in("id", ids);
      if (error) throw error;
      const byId = new Map(
        data.map(fromSupabaseMedication).map((medication2) => [medication2.id, medication2])
      );
      return ids.flatMap((id2) => {
        const medication2 = byId.get(id2);
        return medication2 ? [medication2] : [];
      });
    }
  };
}

// lib/repositories/intake-records/mapper.ts
function fromSupabaseMedicationIntake(row) {
  return {
    id: `${row.intake_date}:${row.medication_id}`,
    medicationId: row.medication_id,
    date: row.intake_date,
    taken: true,
    recordedAt: row.recorded_at
  };
}
function toSupabaseMedicationIntake(medicationId, date2, recordedAt, userId) {
  return {
    user_id: userId,
    medication_id: medicationId,
    intake_date: date2,
    recorded_at: recordedAt
  };
}
function toSupabaseMedicationIntakeMigrationInput(record2) {
  return {
    medication_id: record2.medicationId,
    intake_date: record2.date,
    recorded_at: record2.recordedAt,
    taken: record2.taken
  };
}

// lib/repositories/intake-records/supabase.ts
var INTAKE_COLUMNS = "user_id,medication_id,intake_date,recorded_at";
function createSupabaseMedicationIntakeRepository(userId, client) {
  const supabase = client ?? createBrowserSupabaseClient();
  async function findByMedicationAndDate(medicationId, date2) {
    const { data, error } = await supabase.from("medication_intake_records").select(INTAKE_COLUMNS).eq("user_id", userId).eq("medication_id", medicationId).eq("intake_date", date2).maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseMedicationIntake(data) : null;
  }
  return {
    async listAll() {
      const { data, error } = await supabase.from("medication_intake_records").select(INTAKE_COLUMNS).eq("user_id", userId).order("intake_date", { ascending: true }).order("recorded_at", { ascending: true });
      if (error) throw error;
      return data.map(
        fromSupabaseMedicationIntake
      );
    },
    async listByDate(date2) {
      const { data, error } = await supabase.from("medication_intake_records").select(INTAKE_COLUMNS).eq("user_id", userId).eq("intake_date", date2).order("recorded_at", { ascending: true });
      if (error) throw error;
      return data.map(
        fromSupabaseMedicationIntake
      );
    },
    async hasHistory(medicationId) {
      const { data, error } = await supabase.from("medication_intake_records").select("medication_id").eq("user_id", userId).eq("medication_id", medicationId).limit(1).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async setTaken(medicationId, date2, taken) {
      if (!taken) {
        const existingRecord = await findByMedicationAndDate(medicationId, date2);
        if (!existingRecord) return null;
        const { data: data2, error: error2 } = await supabase.from("medication_intake_records").delete().eq("user_id", userId).eq("medication_id", medicationId).eq("intake_date", date2).select(INTAKE_COLUMNS).maybeSingle();
        if (error2) throw error2;
        if (!data2 && await findByMedicationAndDate(medicationId, date2)) {
          throw new Error("\uBCF5\uC6A9 \uCDE8\uC18C\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
        }
        return null;
      }
      const row = toSupabaseMedicationIntake(
        medicationId,
        date2,
        (/* @__PURE__ */ new Date()).toISOString(),
        userId
      );
      const { data, error } = await supabase.from("medication_intake_records").upsert(row, {
        onConflict: "user_id,medication_id,intake_date",
        ignoreDuplicates: true
      }).select(INTAKE_COLUMNS).maybeSingle();
      if (error) throw error;
      if (data) {
        return fromSupabaseMedicationIntake(
          data
        );
      }
      return findByMedicationAndDate(medicationId, date2);
    },
    async updateRecordedAt(medicationId, date2, recordedAt) {
      const { data, error } = await supabase.from("medication_intake_records").update({ recorded_at: recordedAt }).eq("user_id", userId).eq("medication_id", medicationId).eq("intake_date", date2).select(INTAKE_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("\uC218\uC815\uD560 \uBCF5\uC6A9 \uC644\uB8CC \uAE30\uB85D\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC5B4\uC694.");
      return fromSupabaseMedicationIntake(
        data
      );
    },
    async migrateInitial(records) {
      const { data, error } = await supabase.rpc(
        "migrate_initial_medication_intake_records",
        {
          p_records: records.map(toSupabaseMedicationIntakeMigrationInput)
        }
      );
      if (error) throw error;
      const result = data?.[0];
      return {
        migrated: result?.migrated ?? false,
        insertedCount: result?.inserted_count ?? 0,
        skippedCount: result?.skipped_count ?? 0
      };
    }
  };
}

// lib/mood-summary.ts
var MOOD_PRESENTATIONS = {
  good: { label: "\uAE30\uBD84\uC774 \uC88B\uC544\uC694", imagePath: "/moods/good.png" },
  lethargic: { label: "\uBB34\uAE30\uB825\uD574\uC694", imagePath: "/moods/lethargic.png" },
  "lethargic-depressed": { label: "\uBB34\uAE30\uB825\uD558\uACE0 \uC6B0\uC6B8\uD574\uC694", imagePath: "/moods/lethargic-depressed.png" },
  "poor-condition": { label: "\uCEE8\uB514\uC158\uC774 \uB098\uBE60\uC694", imagePath: "/moods/poor-condition.png" },
  irritable: { label: "\uC608\uBBFC\uD574\uC694", imagePath: "/moods/irritable.png" }
};
function getMoodPresentation(mood2) {
  return MOOD_PRESENTATIONS[mood2] ?? MOOD_PRESENTATIONS["poor-condition"];
}

// lib/repositories/moods/migration-summary.ts
var MEMBER_SUMMARY_MAX_LENGTH = 300;
function normalizeSummaryText(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function limitSummaryLength(value) {
  return Array.from(value).slice(0, MEMBER_SUMMARY_MAX_LENGTH).join("").trimEnd();
}
function resolveMoodMigrationSummary(record2) {
  if (record2.memberSummary?.trim()) return record2.memberSummary;
  const legacyDiarySummary = normalizeSummaryText(record2.diaryEntries?.join(" ") ?? "");
  if (legacyDiarySummary) return limitSummaryLength(legacyDiarySummary);
  throw new Error("\uC774\uC804\uD560 \uC218 \uC788\uB294 \uAC10\uC815 \uC694\uC57D\uC774 \uC5C6\uB294 \uAE30\uB85D\uC774\uC5D0\uC694.");
}

// lib/repositories/moods/mapper.ts
function fromSupabaseMood(row) {
  const presentation = getMoodPresentation(row.mood);
  return {
    id: row.mood_date,
    date: row.mood_date,
    mood: row.mood,
    moodLabel: presentation.label,
    recordedAt: row.recorded_at,
    diaryEntries: [row.summary],
    memberSummary: row.summary,
    clinicPhrase: row.clinic_phrase ?? row.summary,
    details: row.details ?? void 0,
    catId: row.cat_id ?? null,
    analysisStatus: row.analysis_status ?? null,
    analysisResult: row.analysis_result ?? null,
    analysisVersion: row.analysis_version ?? null,
    analysisModel: row.analysis_model ?? null,
    analysisCreatedAt: row.analysis_created_at ?? null
  };
}
function toSupabaseMood(record2, userId) {
  return {
    ...toSupabaseMoodMigrationInput(record2),
    user_id: userId
  };
}
function toSupabaseMoodMigrationInput(record2) {
  const summary = resolveMoodMigrationSummary(record2);
  return {
    mood_date: record2.date,
    mood: record2.mood,
    recorded_at: record2.recordedAt,
    summary,
    details: record2.details ?? null,
    clinic_phrase: record2.clinicPhrase ?? summary,
    cat_id: record2.catId ?? null,
    analysis_status: record2.analysisStatus ?? null,
    analysis_result: record2.analysisResult ?? null,
    analysis_version: record2.analysisVersion ?? null,
    analysis_model: record2.analysisModel ?? null,
    analysis_created_at: record2.analysisCreatedAt ?? null
  };
}

// lib/repositories/moods/types.ts
var DuplicateMoodRecordError = class extends Error {
  constructor() {
    super("\uC774\uBBF8 \uC774 \uB0A0\uC9DC\uC758 \uAC10\uC815 \uAE30\uB85D\uC774 \uC788\uC5B4\uC694.");
    this.name = "DuplicateMoodRecordError";
  }
};

// lib/repositories/moods/supabase.ts
var LEGACY_COLUMNS = "user_id,mood_date,mood,recorded_at,summary";
var COLUMNS = `${LEGACY_COLUMNS},details,clinic_phrase,cat_id,analysis_status,analysis_result,analysis_version,analysis_model,analysis_created_at`;
function isMissingColumns(error) {
  return Boolean(error?.message && /details|clinic_phrase|cat_id|analysis_/u.test(error.message));
}
function createSupabaseMoodRepository(userId, client) {
  const supabase = client ?? createBrowserSupabaseClient();
  async function listAll() {
    const query = await supabase.from("mood_records").select(COLUMNS).eq("user_id", userId).order("mood_date", { ascending: true }).order("recorded_at", { ascending: true });
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase.from("mood_records").select(LEGACY_COLUMNS).eq("user_id", userId).order("mood_date", { ascending: true });
      if (fallback.error) throw fallback.error;
      return fallback.data.map(fromSupabaseMood);
    }
    if (query.error) throw query.error;
    return query.data.map(fromSupabaseMood);
  }
  async function listRecent(startDate, endDate) {
    const query = await supabase.from("mood_records").select(COLUMNS).eq("user_id", userId).gte("mood_date", startDate).lte("mood_date", endDate).order("mood_date", { ascending: false }).order("recorded_at", { ascending: false });
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase.from("mood_records").select(LEGACY_COLUMNS).eq("user_id", userId).gte("mood_date", startDate).lte("mood_date", endDate).order("mood_date", { ascending: false }).order("recorded_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data.map(fromSupabaseMood);
    }
    if (query.error) throw query.error;
    return query.data.map(fromSupabaseMood);
  }
  async function findByDate(date2) {
    const query = await supabase.from("mood_records").select(COLUMNS).eq("user_id", userId).eq("mood_date", date2).maybeSingle();
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase.from("mood_records").select(LEGACY_COLUMNS).eq("user_id", userId).eq("mood_date", date2).maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data ? fromSupabaseMood(fallback.data) : null;
    }
    if (query.error) throw query.error;
    return query.data ? fromSupabaseMood(query.data) : null;
  }
  return {
    storageBackend: "supabase",
    listAll,
    listRecent,
    findByDate,
    async save(record2) {
      const { data, error } = await supabase.from("mood_records").insert(toSupabaseMood(record2, userId)).select(COLUMNS).single();
      if (error?.code === "23505") throw new DuplicateMoodRecordError();
      if (error) throw error;
      return fromSupabaseMood(data);
    },
    async deleteByDate(date2) {
      const { error } = await supabase.from("mood_records").delete().eq("user_id", userId).eq("mood_date", date2);
      if (error) throw error;
    }
  };
}

// lib/repositories/visit-schedules/mapper.ts
function fromSupabaseVisitSchedule(row) {
  return {
    id: row.visit_id,
    visitDate: row.visit_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toSupabaseVisitSchedule(visit, userId) {
  return {
    ...toSupabaseVisitScheduleMigrationInput(visit),
    user_id: userId
  };
}
function toSupabaseVisitScheduleMigrationInput(visit) {
  return {
    visit_id: visit.id,
    visit_date: visit.visitDate,
    created_at: visit.createdAt,
    updated_at: visit.updatedAt
  };
}

// lib/repositories/visit-schedules/validation.ts
var VISIT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function isValidVisitDate(visitDate) {
  const match = VISIT_DATE_PATTERN.exec(visitDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function assertValidVisitDate(visitDate) {
  if (!isValidVisitDate(visitDate)) {
    throw new Error("\uB0B4\uC6D0\uC77C\uC740 YYYY-MM-DD \uD615\uC2DD\uC758 \uC2E4\uC81C \uB0A0\uC9DC\uC5EC\uC57C \uD574\uC694.");
  }
}

// lib/repositories/visit-schedules/supabase.ts
var VISIT_COLUMNS = "user_id,visit_id,visit_date,created_at,updated_at";
function createSupabaseVisitScheduleRepository(userId, client) {
  const supabase = client ?? createBrowserSupabaseClient();
  async function getUpcoming() {
    const { data, error } = await supabase.from("visit_schedules").select(VISIT_COLUMNS).eq("user_id", userId).eq("visit_id", "upcoming").maybeSingle();
    if (error) throw error;
    return data ? fromSupabaseVisitSchedule(data) : null;
  }
  return {
    getUpcoming,
    async saveUpcoming(visitDate) {
      assertValidVisitDate(visitDate);
      const current = await getUpcoming();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (current) {
        const { data: data2, error: error2 } = await supabase.from("visit_schedules").update({ visit_date: visitDate, updated_at: now }).eq("user_id", userId).eq("visit_id", "upcoming").select(VISIT_COLUMNS).single();
        if (error2) throw error2;
        return fromSupabaseVisitSchedule(
          data2
        );
      }
      const row = toSupabaseVisitSchedule({
        id: "upcoming",
        visitDate,
        createdAt: now,
        updatedAt: now
      }, userId);
      const { data, error } = await supabase.from("visit_schedules").insert(row).select(VISIT_COLUMNS).maybeSingle();
      if (error?.code === "23505") {
        const { data: concurrentData, error: concurrentError } = await supabase.from("visit_schedules").update({ visit_date: visitDate, updated_at: now }).eq("user_id", userId).eq("visit_id", "upcoming").select(VISIT_COLUMNS).single();
        if (concurrentError) throw concurrentError;
        return fromSupabaseVisitSchedule(
          concurrentData
        );
      }
      if (error || !data) throw error ?? new Error("\uB0B4\uC6D0\uC77C\uC815\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
      return fromSupabaseVisitSchedule(
        data
      );
    },
    async deleteUpcoming() {
      const { error } = await supabase.from("visit_schedules").delete().eq("user_id", userId).eq("visit_id", "upcoming");
      if (error) throw error;
    }
  };
}

// lib/account-deletion.ts
var AccountDeletionError = class extends Error {
  constructor(code) {
    super(code);
    this.name = "AccountDeletionError";
    this.code = code;
  }
};
async function deleteAuthenticatedAccount(dependencies) {
  const { user, error: userError } = await dependencies.getCurrentUser();
  if (userError || !user) throw new AccountDeletionError("unauthorized");
  const { error: feedbackError } = await dependencies.deleteFeedback(user.id);
  if (feedbackError) {
    throw new AccountDeletionError("feedback_delete_failed");
  }
  const { error: authError } = await dependencies.deleteAuthUser(user.id);
  if (authError) throw new AccountDeletionError("auth_delete_failed");
}

// lib/mood-analysis.ts
var MOOD_ANALYSIS_VERSION = "mood-daily-v1";
var MOOD_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["todayEmotion", "clinicPhrase"],
  properties: {
    todayEmotion: { type: "array", minItems: 2, maxItems: 3, items: { $ref: "#/$defs/evidencedText" } },
    clinicPhrase: { $ref: "#/$defs/evidencedText" }
  },
  $defs: {
    evidencedText: {
      type: "object",
      additionalProperties: false,
      required: ["text", "evidenceIds"],
      properties: {
        text: { type: "string" },
        evidenceIds: { type: "array", minItems: 1, items: { type: "string" } }
      }
    }
  }
};
var EVIDENCE_CATEGORIES = /* @__PURE__ */ new Set(["medication_effect", "concentration", "emotion", "relationship", "direct_input"]);
function validateMoodAnalysisInput(value) {
  if (!isObject(value) || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value.date) || typeof value.recordedAt !== "string" || Number.isNaN(Date.parse(value.recordedAt)) || typeof value.hasMedicationIntake !== "boolean" || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 24) throw new Error("invalid_input");
  const ids = /* @__PURE__ */ new Set();
  const evidence = value.evidence.map((raw) => {
    if (!isObject(raw) || typeof raw.id !== "string" || !/^[a-z0-9:_-]{1,80}$/u.test(raw.id) || ids.has(raw.id) || typeof raw.category !== "string" || !EVIDENCE_CATEGORIES.has(raw.category) || typeof raw.label !== "string") throw new Error("invalid_input");
    ids.add(raw.id);
    const label = clean(raw.label);
    if (!label || label.length > 300) throw new Error("invalid_input");
    const timeSlots = raw.timeSlots === void 0 ? void 0 : Array.isArray(raw.timeSlots) && raw.timeSlots.every((slot) => slot === "\uC544\uCE68" || slot === "\uC810\uC2EC" || slot === "\uC800\uB141") ? [...new Set(raw.timeSlots)] : (() => {
      throw new Error("invalid_input");
    })();
    return { id: raw.id, category: raw.category, canonicalId: typeof raw.canonicalId === "string" ? raw.canonicalId : void 0, label, timeSlots };
  });
  return { date: value.date, recordedAt: value.recordedAt, hasMedicationIntake: value.hasMedicationIntake, evidence };
}
function clean(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
var FORBIDDEN_MEDICAL_PATTERNS = [
  /용량.{0,12}(부족|많|적|과다|늘|줄|증량|감량)/u,
  /약.{0,10}(맞지 않|바꿔|변경|중단)/u,
  /복용.{0,10}(중단|변경)/u,
  /처방.{0,10}(변경|조절)/u,
  /리바운드/u,
  /(진단|질환|장애)(입니다|으로 보|일 수|같습니다|같아요)/u,
  /(원인|때문)(입니다|으로 보|인 것|일 수)/u,
  /부작용(입니다|으로 보|인 것|일 수)/u,
  /(늘려야|줄여야|중단해야|바꿔야) (합니다|해요|할 것)/u
];
var FORBIDDEN_DISEASE_TOKENS = ["ADHD", "\uC8FC\uC758\uB825\uACB0\uD54D", "\uC6B0\uC6B8\uC99D", "\uBD88\uC548\uC7A5\uC560", "\uBD88\uBA74\uC99D", "\uACF5\uD669\uC7A5\uC560", "\uC591\uADF9\uC131\uC7A5\uC560", "\uC870\uC6B8\uC99D"];
var FORBIDDEN_MEDICATION_NAMES = ["\uCF58\uC11C\uD0C0", "\uBA54\uB514\uD0A4\uB137", "\uD398\uB2C8\uB4DC", "\uC2A4\uD2B8\uB77C\uD14C\uB77C", "\uC544\uD1A0\uBAA9\uC138\uD2F4", "\uBA54\uD2F8\uD398\uB2C8\uB370\uC774\uD2B8"];
var CONCEPT_RULES = [
  { tokens: ["\uB450\uD1B5"], supports: (e) => e.canonicalId === "headache" || e.label.includes("\uB450\uD1B5") },
  { tokens: ["\uC2DD\uC695"], supports: (e) => e.canonicalId === "appetite" || e.canonicalId === "appetite-decrease" || e.label.includes("\uC2DD\uC695") },
  { tokens: ["\uC218\uBA74", "\uC7A0"], supports: (e) => e.canonicalId === "sleep" || /수면|잠/u.test(e.label) },
  { tokens: ["\uB450\uADFC"], supports: (e) => e.canonicalId === "palpitation" || e.label.includes("\uB450\uADFC") },
  { tokens: ["\uBD88\uC548"], supports: (e) => e.canonicalId === "anxious" || e.label.includes("\uBD88\uC548") },
  { tokens: ["\uC6B0\uC6B8"], supports: (e) => e.canonicalId === "depressed" || e.label.includes("\uC6B0\uC6B8") },
  { tokens: ["\uC608\uBBFC"], supports: (e) => e.canonicalId === "irritable" || e.label.includes("\uC608\uBBFC") },
  { tokens: ["\uBB34\uAE30\uB825"], supports: (e) => e.canonicalId === "lethargic" || e.label.includes("\uBB34\uAE30\uB825") },
  { tokens: ["\uCDA9\uB3D9"], supports: (e) => e.canonicalId === "impulsive" || e.label.includes("\uCDA9\uB3D9") },
  { tokens: ["\uACFC\uBAB0\uC785"], supports: (e) => e.canonicalId === "hyperfocus" || e.label.includes("\uACFC\uBAB0\uC785") },
  { tokens: ["\uC9D1\uC911"], supports: (e) => e.category === "concentration" || e.canonicalId === "task" || e.canonicalId === "conversation" || e.canonicalId === "work-focus-difficulty" || e.label.includes("\uC9D1\uC911") },
  { tokens: ["\uC57D\uD6A8", "\uC57D \uD6A8\uACFC", "\uD6A8\uACFC\uAC00", "\uC57D\uC774"], supports: (e) => e.category === "medication_effect" || /약|효과/u.test(e.label) },
  { tokens: ["\uB300\uD654"], supports: (e) => e.canonicalId === "conversation" || e.canonicalId === "conversation-flow" || e.canonicalId === "conversation-understanding" || e.label.includes("\uB300\uD654") },
  { tokens: ["\uC5C5\uBB34", "\uACFC\uC81C"], supports: (e) => e.canonicalId === "task" || e.canonicalId === "work-focus-difficulty" || /업무|과제/u.test(e.label) },
  { tokens: ["\uD560 \uC77C", "\uD560\uC77C", "\uB9C8\uBB34\uB9AC"], supports: (e) => e.canonicalId === "unfinished" || e.canonicalId === "task-completion-difficulty" || /할 ?일|마무리/u.test(e.label) }
];
function validateClinicPhraseQuality(text2) {
  const sentenceCount = text2.split(/[.!?]+/u).map(clean).filter(Boolean).length;
  if (sentenceCount > 3) throw new Error("low_quality_clinic_phrase");
  const repeatedConnectives = ["\uC5B4\uB824\uC6E0\uACE0", "\uD798\uB4E4\uC5C8\uACE0"];
  if (repeatedConnectives.some((phrase) => text2.split(phrase).length - 1 >= 2)) {
    throw new Error("low_quality_clinic_phrase");
  }
  const repeatedEndings = ["\uC5B4\uB824\uC6E0\uC5B4\uC694", "\uD798\uB4E4\uC5C8\uC5B4\uC694", "\uC788\uC5C8\uC5B4\uC694", "\uB290\uAF08\uC5B4\uC694"];
  if (repeatedEndings.some((phrase) => text2.split(phrase).length - 1 >= 3)) {
    throw new Error("low_quality_clinic_phrase");
  }
}
function validateMoodAnalysisResult(value, input) {
  if (!isObject(value) || !Array.isArray(value.todayEmotion) || !isObject(value.clinicPhrase)) throw new Error("invalid_schema");
  const knownIds = new Set(input.evidence.map((item) => item.id));
  const validateItem = (item) => {
    if (!isObject(item) || typeof item.text !== "string" || !Array.isArray(item.evidenceIds)) throw new Error("invalid_schema");
    const text2 = clean(item.text);
    const evidenceIds = [...new Set(item.evidenceIds.filter((id2) => typeof id2 === "string"))];
    if (!text2 || text2.length > 300 || evidenceIds.length === 0 || evidenceIds.some((id2) => !knownIds.has(id2))) throw new Error("invalid_evidence");
    if (FORBIDDEN_MEDICAL_PATTERNS.some((pattern) => pattern.test(text2)) || FORBIDDEN_DISEASE_TOKENS.some((token) => text2.includes(token)) || FORBIDDEN_MEDICATION_NAMES.some((token) => text2.includes(token))) throw new Error("unsafe_medical_claim");
    const citedEvidence = input.evidence.filter((e) => evidenceIds.includes(e.id));
    for (const rule of CONCEPT_RULES) {
      if (rule.tokens.some((token) => text2.includes(token)) && !citedEvidence.some(rule.supports)) throw new Error("unsupported_fact");
    }
    const timeRules = [
      { tokens: ["\uC544\uCE68", "\uC624\uC804"], slots: ["\uC544\uCE68"] },
      { tokens: ["\uC810\uC2EC"], slots: ["\uC810\uC2EC"] },
      { tokens: ["\uC624\uD6C4"], slots: ["\uC810\uC2EC", "\uC800\uB141"] },
      { tokens: ["\uC800\uB141"], slots: ["\uC800\uB141"] }
    ];
    for (const rule of timeRules) {
      if (rule.tokens.some((token) => text2.includes(token)) && !citedEvidence.some((e) => e.timeSlots?.some((slot) => rule.slots.includes(slot)))) throw new Error("unsupported_time");
    }
    if (/최근|반복적으로|계속/u.test(text2) && !citedEvidence.some((e) => /최근|반복적으로|계속/u.test(e.label))) throw new Error("unsupported_frequency");
    return { text: text2, evidenceIds };
  };
  if (value.todayEmotion.length < 2 || value.todayEmotion.length > 3) throw new Error("invalid_schema");
  const clinicPhrase = validateItem(value.clinicPhrase);
  validateClinicPhraseQuality(clinicPhrase.text);
  return { todayEmotion: value.todayEmotion.map(validateItem), clinicPhrase };
}

// lib/openai-mood-provider.ts
var DEFAULT_OPENAI_MOOD_MODEL = "gpt-5-mini";
var MOOD_ANALYSIS_INSTRUCTIONS = `\uC5ED\uD560: \uC0AC\uC6A9\uC790\uC758 \uD558\uB8E8 \uAC10\uC815\uAE30\uB85D\uC744 \uC2E4\uC81C \uC9C4\uB8CC\uC2E4\uC5D0\uC11C \uADF8\uB300\uB85C \uC77D\uAC70\uB098 \uBCF4\uC5EC\uC904 \uC218 \uC788\uB294 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4 1\uC778\uCE6D \uBB38\uC7A5\uC73C\uB85C \uC815\uB9AC\uD55C\uB2E4.

\uC808\uB300 \uADDC\uCE59:
1. evidence\uAC00 \uC720\uC77C\uD55C \uC0AC\uC2E4 \uADFC\uAC70\uB2E4. evidence\uC5D0 \uC5C6\uB294 \uC99D\uC0C1, \uC2DC\uAC04\uB300, \uBE48\uB3C4, \uC57D \uC774\uB984, \uC0AC\uAC74, \uC6D0\uC778, \uAD00\uACC4\uB97C \uCD94\uAC00\uD558\uC9C0 \uC54A\uB294\uB2E4.
2. \uC120\uD0DD label\uC744 \uC27C\uD45C\uB85C \uB098\uC5F4\uD558\uAC70\uB098 \uADF8\uB300\uB85C \uC774\uC5B4 \uBD99\uC774\uC9C0 \uB9D0\uACE0, \uC11C\uB85C \uAD00\uB828\uB41C evidence\uB9CC \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5F0\uACB0\uD55C\uB2E4.
3. \uC9C4\uB2E8, \uC9C8\uD658 \uCD94\uC815, \uC6D0\uC778 \uB2E8\uC815, \uC57D\uBB3C \uBCC0\uACBD, \uBCF5\uC6A9 \uC911\uB2E8, \uC6A9\uB7C9 \uC99D\uAC10, \uB9AC\uBC14\uC6B4\uB4DC\uB098 \uBD80\uC791\uC6A9 \uB2E8\uC815\uC744 \uD558\uC9C0 \uC54A\uB294\uB2E4.
4. \uAD00\uCC30\uACFC \uCCB4\uAC10 \uC911\uC2EC\uC73C\uB85C '~\uD558\uAC8C \uB290\uAEF4\uC84C\uC5B4\uC694', '~\uAC00 \uD568\uAED8 \uB098\uD0C0\uB0AC\uC5B4\uC694', '~\uC778\uC9C0 \uC0C1\uB2F4\uD574\uBCF4\uACE0 \uC2F6\uC5B4\uC694'\uCC98\uB7FC \uC4F4\uB2E4.
5. \uD558\uB8E8 \uAE30\uB85D\uC744 '\uCD5C\uADFC', '\uBC18\uBCF5\uC801\uC73C\uB85C', '\uD3C9\uC18C\uBCF4\uB2E4 \uACC4\uC18D' \uAC19\uC740 \uAE30\uAC04 \uD328\uD134\uC73C\uB85C \uD655\uB300\uD558\uC9C0 \uC54A\uB294\uB2E4.
6. \uC544\uCE68/\uC624\uC804/\uC810\uC2EC/\uC624\uD6C4/\uC800\uB141\uC740 evidence\uC758 timeSlots\uB85C \uC9C1\uC811 \uB4B7\uBC1B\uCE68\uB420 \uB54C\uB9CC \uC4F4\uB2E4.
7. \uAC01 \uBB38\uC7A5 \uAC1D\uCCB4\uC758 evidenceIds\uC5D0\uB294 \uADF8 \uBB38\uC7A5\uC744 \uC9C1\uC811 \uB4B7\uBC1B\uCE68\uD558\uB294 ID\uB9CC \uB123\uB294\uB2E4. \uC785\uB825\uC5D0 \uC5C6\uB294 ID\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4.
8. todayEmotion\uC740 \uC11C\uB85C \uB2E4\uB978 \uAD00\uCC30\uC744 \uB2F4\uC740 2~3\uAC1C \uBB38\uC7A5, clinicPhrase\uB294 1\uC778\uCE6D \uC9C4\uB8CC \uC804\uB2EC \uBB38\uC7A5 1\uAC1C\uB97C \uC904\uBC14\uAFC8 \uC5C6\uB294 \uB2E8\uC77C \uBB38\uB2E8\uC73C\uB85C \uC791\uC131\uD55C\uB2E4.
9. JSON schema \uC678\uC758 \uD14D\uC2A4\uD2B8\uB294 \uCD9C\uB825\uD558\uC9C0 \uC54A\uB294\uB2E4.`;
var MoodAnalysisProviderError = class extends Error {
  constructor(stage, diagnosticCode, providerStatus) {
    super(`mood_analysis_failed:${stage}`);
    this.name = "MoodAnalysisProviderError";
    this.stage = stage;
    this.diagnosticCode = diagnosticCode;
    this.providerStatus = providerStatus;
  }
};
function errorCode(error) {
  return error instanceof Error ? error.message : "unknown_error";
}
function validationStage(code) {
  if (code === "invalid_schema") return "schema_validation";
  if (code === "unsafe_medical_claim") return "medical_safety";
  if (code === "low_quality_clinic_phrase") return "quality_validation";
  if (code === "invalid_evidence" || code.startsWith("unsupported_")) return "evidence_grounding";
  return "provider_runtime";
}
function readProviderErrorCode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "provider_http_error";
  const error = value.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return "provider_http_error";
  const code = error.code ?? error.type;
  return typeof code === "string" && /^[a-z0-9_.-]{1,80}$/iu.test(code) ? code : "provider_http_error";
}
function getMoodAnalysisFailureDiagnostic(error) {
  if (error instanceof MoodAnalysisProviderError) {
    return {
      stage: error.stage,
      code: error.diagnosticCode,
      ...error.providerStatus === void 0 ? {} : { providerStatus: error.providerStatus }
    };
  }
  return { stage: "provider_runtime", code: "unclassified_error" };
}
function createOpenAIMoodRequest(input, model) {
  return {
    model,
    store: false,
    instructions: MOOD_ANALYSIS_INSTRUCTIONS,
    input: JSON.stringify(input),
    reasoning: { effort: "minimal" },
    max_output_tokens: 2e3,
    text: {
      format: {
        type: "json_schema",
        name: "mood_analysis",
        strict: true,
        schema: MOOD_ANALYSIS_SCHEMA
      }
    }
  };
}
function readOutputText(value) {
  const response = value;
  if (response?.status === "incomplete") {
    const details = response.incomplete_details;
    const reason = details && typeof details === "object" && !Array.isArray(details) ? details.reason : void 0;
    throw new Error(
      reason === "max_output_tokens" ? "provider_output_incomplete_max_tokens" : "provider_output_incomplete"
    );
  }
  if (!Array.isArray(response?.output)) throw new Error("provider_output_missing");
  for (const rawItem of response.output) {
    const item = rawItem;
    if (!Array.isArray(item?.content)) continue;
    for (const rawContent of item.content) {
      const content = rawContent;
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error("provider_output_refusal");
    }
  }
  throw new Error("provider_output_missing");
}
async function requestOpenAIMoodAnalysis({
  input,
  apiKey,
  model = DEFAULT_OPENAI_MOOD_MODEL,
  fetchImpl = fetch,
  createdAt = (/* @__PURE__ */ new Date()).toISOString()
}) {
  if (!apiKey.trim() || !model.trim()) {
    throw new MoodAnalysisProviderError("provider_runtime", "provider_not_configured");
  }
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createOpenAIMoodRequest(input, model)),
      signal: AbortSignal.timeout(3e4)
    });
  } catch (error) {
    const code = error instanceof DOMException && error.name === "TimeoutError" ? "provider_timeout" : "provider_fetch_failed";
    throw new MoodAnalysisProviderError("provider_runtime", code);
  }
  if (!response.ok) {
    let code = "provider_http_error";
    try {
      code = readProviderErrorCode(await response.clone().json());
    } catch {
    }
    throw new MoodAnalysisProviderError("provider_http", code, response.status);
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    throw new MoodAnalysisProviderError("response_body", "provider_response_not_json");
  }
  let outputText;
  try {
    outputText = readOutputText(responseBody);
  } catch (error) {
    throw new MoodAnalysisProviderError("output_extract", errorCode(error));
  }
  let rawResult;
  try {
    rawResult = JSON.parse(outputText);
  } catch {
    throw new MoodAnalysisProviderError("output_json", "provider_output_not_json");
  }
  let result;
  try {
    result = validateMoodAnalysisResult(rawResult, input);
  } catch (error) {
    const code = errorCode(error);
    throw new MoodAnalysisProviderError(validationStage(code), code);
  }
  return {
    result,
    version: MOOD_ANALYSIS_VERSION,
    model,
    createdAt
  };
}

// lib/analytics/mood-contract.ts
function classifyMoodAnalysisDiagnostic(diagnostic) {
  if (diagnostic.code === "provider_timeout") return "timeout";
  if (diagnostic.code === "provider_fetch_failed") return "network";
  if (diagnostic.code === "provider_not_configured") return "configuration_error";
  if (diagnostic.stage === "provider_http") return "provider_error";
  if (["response_body", "output_extract", "output_json"].includes(diagnostic.stage)) return "response_error";
  if (["schema_validation", "evidence_grounding", "medical_safety", "quality_validation"].includes(diagnostic.stage)) return "validation_error";
  return "unknown";
}

// lib/medication-utils.ts
var MEDICATION_FALLBACK_IMAGE = "/icons/medication-fallback-64.svg";

// lib/medication-candidates.ts
var DOSAGE_FORMS = [
  "\uAD6C\uAC15\uBD95\uD574\uC815",
  "\uB9AC\uD0C0\uB4DC\uCEA1\uC290",
  "\uC11C\uBC29\uCEA1\uC290",
  "\uC5F0\uC9C8\uCEA1\uC290",
  "\uC7A5\uC6A9\uCEA1\uC290",
  "\uC11C\uBC29\uC815",
  "\uC7A5\uC6A9\uC815",
  "\uCEA1\uC290",
  "\uC2DC\uB7FD",
  "\uC0B0",
  "\uC561",
  "\uC815"
];
function stripStrength(value) {
  return value.replace(
    /\d+(?:[.,]\d+)?\s*(?:mg|㎎|밀리그(?:램|람))/gi,
    ""
  );
}
function normalizeMedicationProductName(value) {
  return stripStrength(value).toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^가-힣a-z0-9]/g, "");
}
function dosageForm(value) {
  const normalized = normalizeMedicationProductName(value);
  return DOSAGE_FORMS.find((form) => normalized.endsWith(form));
}
function candidateNames(candidate) {
  return [candidate.name, candidate.displayLabel].filter((value) => Boolean(value)).map(normalizeMedicationProductName);
}
function selectOfficialMedicationCandidate(name, strengthValue, candidates) {
  const normalizedName = normalizeMedicationProductName(name);
  if (!normalizedName || !Number.isFinite(strengthValue) || strengthValue <= 0) {
    return { status: "not-found" };
  }
  const exactMatches = candidates.filter((candidate) => candidate.catalogId && Math.abs(candidate.strengthValue - strengthValue) < 1e-3 && candidateNames(candidate).includes(normalizedName));
  if (exactMatches.length === 1) {
    return { status: "matched", medication: exactMatches[0] };
  }
  if (exactMatches.length === 0) return { status: "not-found" };
  const requestedForm = dosageForm(name);
  if (!requestedForm) return { status: "ambiguous" };
  const formMatches = exactMatches.filter((candidate) => dosageForm(candidate.name) === requestedForm || dosageForm(candidate.displayLabel ?? "") === requestedForm);
  return formMatches.length === 1 ? { status: "matched", medication: formMatches[0] } : { status: "ambiguous" };
}
function selectOfficialManualMedicationCandidate(name, strengthValue, candidates) {
  const exactSelection = selectOfficialMedicationCandidate(name, strengthValue, candidates);
  if (exactSelection.status !== "not-found") return exactSelection;
  const normalizedName = normalizeMedicationProductName(name);
  if (normalizedName.length < 2 || !Number.isFinite(strengthValue) || strengthValue <= 0) {
    return { status: "not-found" };
  }
  const prefixMatches = candidates.filter((candidate) => candidate.catalogId && Math.abs(candidate.strengthValue - strengthValue) < 1e-3 && candidateNames(candidate).some((candidateName) => candidateName.startsWith(normalizedName)));
  if (prefixMatches.length === 1) {
    return { status: "matched", medication: prefixMatches[0] };
  }
  return prefixMatches.length === 0 ? { status: "not-found" } : { status: "ambiguous" };
}

// lib/medication-images.ts
var MFDS_PILL_IMAGE_SOURCE = "\uC2DD\uD488\uC758\uC57D\uD488\uC548\uC804\uCC98 \uC758\uC57D\uD488 \uB0B1\uC54C\uC2DD\uBCC4\uC815\uBCF4";
var CONCERTA_18_IMAGE = {
  catalogId: "202005265",
  medicationName: "\uCF58\uC11C\uD0C0OROS\uC11C\uBC29\uC815 18mg",
  src: "/medications/concerta-18.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NOwp2F6Iqa"
};
var CONCERTA_27_IMAGE = {
  catalogId: "202005266",
  medicationName: "\uCF58\uC11C\uD0C0OROS\uC11C\uBC29\uC815 27mg",
  src: "/medications/concerta-27.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oikd3yeYfA"
};
var CONCERTA_36_IMAGE = {
  catalogId: "201501271",
  medicationName: "\uCF58\uC11C\uD0C0OROS\uC11C\uBC29\uC815 36mg",
  src: "/medications/concerta-36.png",
  sourceName: "\uC57D\uD559\uC815\uBCF4\uC6D0 \uC758\uC57D\uD488\uC2DD\uBCC4\uC815\uBCF4",
  sourceUrl: "https://www.health.kr/searchDrug/result_take.asp?drug_cd=2015031200004"
};
var CONCERTA_54_IMAGE = {
  catalogId: "201501273",
  medicationName: "\uCF58\uC11C\uD0C0OROS\uC11C\uBC29\uC815 54mg",
  src: "/medications/concerta-54.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pm2KqaUvzy"
};
var MEDIKINET_5_IMAGE = {
  catalogId: "201111086",
  medicationName: "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC290 5mg",
  src: "/medications/medikinet-5.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600111"
};
var MEDIKINET_10_IMAGE = {
  catalogId: "201111088",
  medicationName: "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC290 10mg",
  src: "/medications/medikinet-10.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600117"
};
var MEDIKINET_20_IMAGE = {
  catalogId: "201111091",
  medicationName: "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC290 20mg",
  src: "/medications/medikinet-20.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600126"
};
var MEDIKINET_30_IMAGE = {
  catalogId: "201111093",
  medicationName: "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC290 30mg",
  src: "/medications/medikinet-30.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600123"
};
var MEDIKINET_40_IMAGE = {
  catalogId: "201111087",
  medicationName: "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC290 40mg",
  src: "/medications/medikinet-40.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600114"
};
var ATOMOXINE_10_IMAGE = {
  catalogId: "201401189",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 10mg",
  src: "/medications/atomoxine-10.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154599005608100018"
};
var ATOMOXINE_18_IMAGE = {
  catalogId: "201309921",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 18mg",
  src: "/medications/atomoxine-18.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1rHy"
};
var ATOMOXINE_25_IMAGE = {
  catalogId: "201309920",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 25mg",
  src: "/medications/atomoxine-25.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426794354400087"
};
var ATOMOXINE_40_IMAGE = {
  catalogId: "201307635",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 40mg",
  src: "/medications/atomoxine-40.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426720602800099"
};
var ATOMOXINE_60_IMAGE = {
  catalogId: "201401190",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 60mg",
  src: "/medications/atomoxine-60.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426847266800014"
};
var ATOMOXINE_80_IMAGE = {
  catalogId: "201404924",
  medicationName: "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC290 80mg",
  src: "/medications/atomoxine-80.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426953978800029"
};
var MEDICATION_IMAGE_MAP = {
  "202005265": CONCERTA_18_IMAGE,
  "202005266": CONCERTA_27_IMAGE,
  "201501271": CONCERTA_36_IMAGE,
  "201501273": CONCERTA_54_IMAGE,
  "201111086": MEDIKINET_5_IMAGE,
  "201111088": MEDIKINET_10_IMAGE,
  "201111091": MEDIKINET_20_IMAGE,
  "201111093": MEDIKINET_30_IMAGE,
  "201111087": MEDIKINET_40_IMAGE,
  "201401189": ATOMOXINE_10_IMAGE,
  "201309921": ATOMOXINE_18_IMAGE,
  "201309920": ATOMOXINE_25_IMAGE,
  "201307635": ATOMOXINE_40_IMAGE,
  "201401190": ATOMOXINE_60_IMAGE,
  "201404924": ATOMOXINE_80_IMAGE,
  // Previous local data may still contain this non-current compatibility ID.
  "646902060": CONCERTA_36_IMAGE
};
var LEGACY_MEDICATION_NAME_MAP = {
  "\uCF58\uC11C\uD0C0oros\uC11C\uBC29\uC81518mg": CONCERTA_18_IMAGE,
  "\uCF58\uC11C\uD0C0oros\uC11C\uBC29\uC81527mg": CONCERTA_27_IMAGE,
  "\uCF58\uC11C\uD0C0oros\uC11C\uBC29\uC81536mg": CONCERTA_36_IMAGE,
  "\uCF58\uC11C\uD0C0oros\uC11C\uBC29\uC81554mg": CONCERTA_54_IMAGE,
  "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC2905mg": MEDIKINET_5_IMAGE,
  "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC29010mg": MEDIKINET_10_IMAGE,
  "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC29020mg": MEDIKINET_20_IMAGE,
  "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC29030mg": MEDIKINET_30_IMAGE,
  "\uBA54\uB514\uD0A4\uB137\uB9AC\uD0C0\uB4DC\uCEA1\uC29040mg": MEDIKINET_40_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29010mg": ATOMOXINE_10_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29018mg": ATOMOXINE_18_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29025mg": ATOMOXINE_25_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29040mg": ATOMOXINE_40_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29060mg": ATOMOXINE_60_IMAGE,
  "\uC544\uD1A0\uBAA9\uC2E0\uCEA1\uC29080mg": ATOMOXINE_80_IMAGE
};
function normalizeMedicationName(value) {
  return value.normalize("NFKC").toLowerCase().replace(/밀리그(?:램|람)/g, "mg").replace(/\s+/g, "").trim();
}
function getLocalMedicationProductImage({
  medicationId,
  medicationName
}) {
  const normalizedId = medicationId?.trim();
  if (normalizedId) return MEDICATION_IMAGE_MAP[normalizedId];
  const normalizedName = normalizeMedicationName(medicationName ?? "");
  return LEGACY_MEDICATION_NAME_MAP[normalizedName];
}

// lib/mfds-medications.ts
var PRODUCT_ENDPOINT = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07";
var PRODUCT_DETAIL_ENDPOINT = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06";
var PILL_ENDPOINT = "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03";
var OFFICIAL_IMAGE_KEYS = [
  "ITEM_IMAGE",
  "item_image",
  "itemImage",
  "PRODUCT_IMAGE",
  "product_image",
  "productImage"
];
function getString(item, ...keys) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}
function getApiItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  const root = payload;
  const response = root.response && typeof root.response === "object" ? root.response : root;
  const body = response.body && typeof response.body === "object" ? response.body : void 0;
  if (!body) return [];
  const items = body.items;
  if (Array.isArray(items)) return items.filter(isApiItem);
  if (items && typeof items === "object") {
    const nestedItem = items.item;
    if (Array.isArray(nestedItem)) return nestedItem.filter(isApiItem);
    if (isApiItem(nestedItem)) return [nestedItem];
  }
  return [];
}
function isApiItem(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function encodedServiceKey(serviceKey) {
  return /%[0-9a-f]{2}/i.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
}
function getDrugPermissionServiceKey() {
  const serviceKey = ADDI_MFDS_KEY?.trim();
  if (!serviceKey) throw new Error("\uC2DD\uC57D\uCC98 \uC81C\uD488 \uD5C8\uAC00\uC815\uBCF4 API \uC778\uC99D\uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.");
  return serviceKey;
}
function getPillIdentificationServiceKey() {
  const serviceKey = ADDI_MFDS_PILL_KEY?.trim();
  if (!serviceKey) throw new Error("\uC2DD\uC57D\uCC98 \uB0B1\uC54C\uC2DD\uBCC4 API \uC778\uC99D\uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.");
  return serviceKey;
}
async function fetchItems(endpoint, serviceKey, searchParameter, query) {
  const parameters = new URLSearchParams({
    pageNo: "1",
    numOfRows: "20",
    type: "json",
    [searchParameter]: query
  });
  const requestUrl = `${endpoint}?serviceKey=${encodedServiceKey(serviceKey)}&${parameters.toString()}`;
  const response = await fetch(requestUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8e3)
  });
  if (!response.ok) throw new Error("\uC2DD\uC57D\uCC98 \uC758\uC57D\uD488 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.");
  const responseText = await response.text();
  try {
    const payload = JSON.parse(responseText);
    return getApiItems(payload);
  } catch {
    return parseXmlItems(responseText);
  }
}
function fetchPillItems(searchParameter, query) {
  return fetchItems(
    PILL_ENDPOINT,
    getPillIdentificationServiceKey(),
    searchParameter,
    query
  );
}
function decodeXmlValue(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
function parseXmlItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((itemMatch) => {
    const item = {};
    for (const fieldMatch of itemMatch[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      item[fieldMatch[1]] = decodeXmlValue(fieldMatch[2].trim());
    }
    return item;
  });
}
function parseStrength(item) {
  const sources = [
    getString(item, "ITEM_NAME", "item_name"),
    getString(item, "ITEM_ENG_NAME", "item_eng_name", "itemEngName")
  ];
  for (const source of sources) {
    const match = source.match(/(\d+(?:[.,]\d+)?)\s*(?:mg|㎎|밀리그(?:램|람))/i);
    if (match) return Number(match[1].replace(",", "."));
  }
  return 0;
}
function cleanProductLabel(productName) {
  return productName.replace(/\s*\([^)]*\).*$/, "").replace(/(\d+(?:[.,]\d+)?)\s*밀리그(?:램|람)/gi, "$1mg").replace(/([^\s])(\d+(?:\.\d+)?mg)\b/i, "$1 $2").trim();
}
function productBaseName(label) {
  return label.replace(/\s*\d+(?:\.\d+)?mg\b.*$/i, "").trim() || label;
}
function normalizeOfficialImage(value) {
  if (!value) return void 0;
  let normalizedValue = decodeXmlValue(value.trim());
  if (!/^https?:\/\//i.test(normalizedValue)) {
    try {
      const decodedValue = decodeURIComponent(normalizedValue);
      if (/^https?:\/\//i.test(decodedValue)) normalizedValue = decodedValue;
    } catch {
      return void 0;
    }
  }
  try {
    const url = new URL(normalizedValue);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return void 0;
    if (hostname !== "mfds.go.kr" && !hostname.endsWith(".mfds.go.kr")) return void 0;
    return url.toString();
  } catch {
    return void 0;
  }
}
function officialImageFromItem(item) {
  return normalizeOfficialImage(getString(item, ...OFFICIAL_IMAGE_KEYS));
}
function cleanIngredientName(value) {
  const seen = /* @__PURE__ */ new Set();
  return value.split(/[|/]/).map((ingredient) => ingredient.replace(/\[[^\]]+\]/g, "").trim()).filter((ingredient) => {
    if (!ingredient || seen.has(ingredient)) return false;
    seen.add(ingredient);
    return true;
  }).join("/");
}
function toMedicationCandidate(item, image) {
  const catalogId = getString(
    item,
    "ITEM_SEQ",
    "item_seq",
    "itemSeq",
    "PRDLST_STDR_CODE",
    "prdlst_Stdr_code"
  );
  const rawProductName = getString(item, "ITEM_NAME", "item_name", "itemName");
  if (!catalogId || !rawProductName) return null;
  const displayLabel = cleanProductLabel(rawProductName);
  const officialImage = normalizeOfficialImage(image?.originalUrl ?? "");
  const verifiedLocalImage = getLocalMedicationProductImage({ medicationId: catalogId });
  const productImage = verifiedLocalImage?.src ?? (officialImage ? `/api/medications/image/${catalogId}` : void 0);
  return {
    catalogId,
    displayLabel,
    name: productBaseName(displayLabel),
    ingredientName: cleanIngredientName(getString(
      item,
      "ITEM_INGR_NAME",
      "item_ingr_name",
      "MAIN_ITEM_INGR",
      "main_item_ingr",
      "MATERIAL_NAME",
      "material_name"
    )),
    strengthValue: parseStrength(item),
    strengthUnit: "mg",
    manufacturer: getString(item, "ENTP_NAME", "entp_name", "entpName"),
    englishName: getString(item, "ITEM_ENG_NAME", "item_eng_name", "itemEngName"),
    imagePath: productImage ?? MEDICATION_FALLBACK_IMAGE,
    productImage,
    fallbackImage: MEDICATION_FALLBACK_IMAGE,
    imageType: productImage ? "product" : "fallback",
    imageSourceName: verifiedLocalImage?.sourceName ?? (officialImage ? image?.source === "product" ? "\uC2DD\uD488\uC758\uC57D\uD488\uC548\uC804\uCC98 \uC758\uC57D\uD488 \uC81C\uD488 \uD5C8\uAC00\uC815\uBCF4" : "\uC2DD\uD488\uC758\uC57D\uD488\uC548\uC804\uCC98 \uC758\uC57D\uD488 \uB0B1\uC54C\uC2DD\uBCC4\uC815\uBCF4" : void 0),
    imageSourceUrl: verifiedLocalImage?.sourceUrl ?? officialImage,
    officialMatchStatus: "matched"
  };
}
async function searchMfdsMedications(query) {
  const serviceKey = getDrugPermissionServiceKey();
  const productMatches = await fetchItems(PRODUCT_ENDPOINT, serviceKey, "item_name", query);
  const permitItems = productMatches.length > 0 ? productMatches : await fetchItems(PRODUCT_ENDPOINT, serviceKey, "item_ingr_name", query);
  const seen = /* @__PURE__ */ new Set();
  const medications = permitItems.map((item) => toMedicationCandidate(item)).filter((medication2) => {
    if (!medication2?.catalogId || seen.has(medication2.catalogId)) return false;
    seen.add(medication2.catalogId);
    return true;
  }).slice(0, 20);
  const normalizedQuery = query.replace(/\s/g, "").toLowerCase();
  return medications.sort((left, right) => {
    const leftName = left.name.replace(/\s/g, "").toLowerCase();
    const rightName = right.name.replace(/\s/g, "").toLowerCase();
    const leftStartsWith = leftName.startsWith(normalizedQuery);
    const rightStartsWith = rightName.startsWith(normalizedQuery);
    if (leftStartsWith !== rightStartsWith) return leftStartsWith ? -1 : 1;
    const nameOrder = leftName.localeCompare(rightName, "ko");
    if (nameOrder !== 0) return nameOrder;
    if (left.strengthValue === right.strengthValue) return 0;
    if (left.strengthValue === 0) return 1;
    if (right.strengthValue === 0) return -1;
    return left.strengthValue - right.strengthValue;
  });
}
async function getMfdsMedication(itemSequence) {
  const serviceKey = getDrugPermissionServiceKey();
  const [detailItems, pillItems] = await Promise.all([
    fetchItems(PRODUCT_DETAIL_ENDPOINT, serviceKey, "item_seq", itemSequence),
    fetchPillItems("item_seq", itemSequence).catch(() => [])
  ]);
  const detail = detailItems[0];
  if (!detail) return null;
  const productImage = officialImageFromItem(detail);
  const pillImage = pillItems[0] ? officialImageFromItem(pillItems[0]) : void 0;
  const image = pillImage ? { source: "pill", originalUrl: pillImage } : productImage ? { source: "product", originalUrl: productImage } : void 0;
  return toMedicationCandidate(detail, image);
}
async function matchMfdsManualMedication(name, strengthValue) {
  const candidates = await searchMfdsMedications(name);
  const selection = selectOfficialManualMedicationCandidate(name, strengthValue, candidates);
  if (selection.status !== "matched") return selection;
  const catalogId = selection.medication.catalogId;
  if (!catalogId) return { status: "not-found" };
  const medication2 = await getMfdsMedication(catalogId);
  return medication2 ? { status: "matched", medication: medication2 } : { status: "not-found" };
}
async function getMfdsImageCandidates(itemSequence) {
  const serviceKey = getDrugPermissionServiceKey();
  const [detailItems, pillItems] = await Promise.all([
    fetchItems(PRODUCT_DETAIL_ENDPOINT, serviceKey, "item_seq", itemSequence),
    fetchPillItems("item_seq", itemSequence)
  ]);
  const candidates = [];
  const productImage = detailItems[0] ? officialImageFromItem(detailItems[0]) : void 0;
  const pillImage = pillItems[0] ? officialImageFromItem(pillItems[0]) : void 0;
  if (pillImage) candidates.push({ source: "pill", originalUrl: pillImage });
  if (productImage && productImage !== pillImage) {
    candidates.push({ source: "product", originalUrl: productImage });
  }
  return candidates;
}
function isValidImageBody(bytes, contentType) {
  if (bytes.byteLength < 12 || !contentType.toLowerCase().startsWith("image/")) return false;
  const matches = (...signature) => signature.every((value, index) => bytes[index] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  return matches(255, 216, 255) || matches(137, 80, 78, 71, 13, 10, 26, 10) || ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a" || ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" || matches(66, 77);
}
function upstreamUrls(originalUrl) {
  const parsed = new URL(originalUrl);
  if (parsed.protocol !== "http:") return [parsed.toString()];
  const secureUrl = new URL(parsed);
  secureUrl.protocol = "https:";
  return [secureUrl.toString(), parsed.toString()];
}
async function fetchVerifiedMfdsImage(candidate) {
  const officialUrl = normalizeOfficialImage(candidate.originalUrl);
  if (!officialUrl) return null;
  for (const upstreamUrl of upstreamUrls(officialUrl)) {
    try {
      const response = await fetch(upstreamUrl, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(1e4),
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" }
      });
      const finalUrl = normalizeOfficialImage(response.url);
      const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!response.ok || response.status !== 200 || !finalUrl) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isValidImageBody(bytes, contentType)) continue;
      return {
        ...candidate,
        bytes,
        contentType,
        finalUrl,
        status: response.status
      };
    } catch {
    }
  }
  return null;
}

// lib/kst-date.ts
var KST_TIME_ZONE = "Asia/Seoul";
var KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date2 = new Date(Date.UTC(year, month - 1, day));
  if (date2.getUTCFullYear() !== year || date2.getUTCMonth() !== month - 1 || date2.getUTCDate() !== day) return null;
  return { year, month, day };
}
function isValidDateKey(dateKey) {
  return Boolean(dateKey && parseDateKey(dateKey));
}

// lib/native-api/contracts.ts
var NATIVE_API_ORIGIN = "https://ohobxicxchkaisxxswkk.supabase.co";
var NATIVE_API_PREFIX = "/functions/v1/native-api";
var MAX_BODY_BYTES = 96 * 1024;
var NativeRequestError = class extends Error {
  constructor() {
    super("INVALID_REQUEST");
  }
};
var fail = () => {
  throw new NativeRequestError();
};
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var text = (v, max = 2e3) => typeof v === "string" && v.length <= max;
var id = (v) => text(v, 100) && /^[a-zA-Z0-9_-]+$/.test(v);
var date = (v) => typeof v === "string" && isValidDateKey(v);
var timestamp = (v) => text(v, 40) && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
var schedule = (v) => ["daily", "as-needed", "bedtime"].includes(String(v));
var time = (v) => v === null || text(v, 5) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
function rejectOwner(v) {
  if (Array.isArray(v)) {
    v.forEach(rejectOwner);
    return;
  }
  if (!record(v)) return;
  for (const [key, value] of Object.entries(v)) {
    if (["user_id", "userId", "owner", "__proto__", "constructor", "prototype"].includes(key)) fail();
    rejectOwner(value);
  }
}
function medication(v) {
  if (!record(v) || !id(v.id) || !text(v.name, 200) || !v.name.trim() || !text(v.imagePath, 2048) || !schedule(v.schedule) || !["search", "manual", "photo"].includes(String(v.registrationMethod)) || typeof v.strengthValue !== "number" || !Number.isFinite(v.strengthValue) || v.strengthValue <= 0 || v.strengthUnit !== "mg" || !timestamp(v.createdAt)) return false;
  if (v.scheduledTime !== void 0 && !time(v.scheduledTime)) return false;
  if (v.active !== void 0 && typeof v.active !== "boolean") return false;
  if (v.deactivatedAt !== void 0 && !timestamp(v.deactivatedAt)) return false;
  for (const [key, value] of Object.entries(v)) {
    if (["searchKeywords"].includes(key) && (!Array.isArray(value) || value.length > 100 || !value.every((x) => text(x, 200)))) return false;
    if (!["strengthValue", "active", "scheduledTime", "searchKeywords"].includes(key) && !text(value, 2048)) return false;
  }
  return true;
}
function mood(v) {
  if (!record(v) || !date(v.date) || !timestamp(v.recordedAt) || !Object.hasOwn(MOOD_PRESENTATIONS, String(v.mood)) || (!text(v.memberSummary, 300) || !v.memberSummary.trim()) || !text(v.moodLabel, 100)) return false;
  if (v.clinicPhrase !== void 0 && (!text(v.clinicPhrase, 300) || !v.clinicPhrase.trim())) return false;
  if (v.details !== void 0) {
    if (!record(v.details) || !record(v.details.customText) || !record(v.details.medicationEffectTimings)) return false;
    for (const key of ["medicationEffects", "concentrationStates", "moods", "relationships"]) {
      const a = v.details[key];
      if (a !== void 0 && (!Array.isArray(a) || a.length > 100 || !a.every((x) => text(x, 100)))) return false;
    }
    if (!Object.values(v.details.customText).every((x) => text(x, 2e3))) return false;
    if (!Object.values(v.details.medicationEffectTimings).every((a) => Array.isArray(a) && a.length <= 20 && a.every((x) => text(x, 100)))) return false;
  }
  return true;
}
var methods = {
  medications: ["listAll", "listActive", "createMany", "deactivate", "updateSchedule", "getByIds"],
  medicationIntakes: ["listAll", "listByDate", "hasHistory", "setTaken", "updateRecordedAt"],
  moods: ["listAll", "listRecent", "findByDate", "save", "deleteByDate"],
  visitSchedules: ["getUpcoming", "saveUpcoming", "deleteUpcoming"]
};
function validateRepositoryRequest(body) {
  rejectOwner(body);
  if (!record(body) || Object.keys(body).some((k) => !["repository", "method", "args"].includes(k)) || !Object.hasOwn(methods, String(body.repository)) || !Array.isArray(body.args)) return fail();
  const repository = body.repository;
  const method = String(body.method);
  if (!methods[repository].includes(method)) return fail();
  const a = body.args;
  const zero = ["listAll", "listActive", "getUpcoming", "deleteUpcoming"];
  let valid = zero.includes(method) && a.length === 0;
  if (method === "createMany") valid = a.length === 1 && Array.isArray(a[0]) && a[0].length <= 50 && a[0].every(medication);
  if (method === "getByIds") valid = a.length === 1 && Array.isArray(a[0]) && a[0].length <= 500 && a[0].every(id);
  if (["deactivate", "hasHistory"].includes(method)) valid = a.length === 1 && id(a[0]);
  if (["listByDate", "findByDate", "deleteByDate", "saveUpcoming"].includes(method)) valid = a.length === 1 && date(a[0]);
  if (method === "listRecent") valid = a.length === 2 && date(a[0]) && date(a[1]) && a[0] <= a[1];
  if (method === "setTaken") valid = a.length === 3 && id(a[0]) && date(a[1]) && typeof a[2] === "boolean";
  if (method === "updateRecordedAt") valid = a.length === 3 && id(a[0]) && date(a[1]) && timestamp(a[2]);
  if (method === "updateSchedule") valid = a.length === 2 && id(a[0]) && record(a[1]) && Object.keys(a[1]).length > 0 && Object.keys(a[1]).every((k) => ["schedule", "scheduledTime"].includes(k)) && (a[1].schedule === void 0 || schedule(a[1].schedule)) && (a[1].scheduledTime === void 0 || time(a[1].scheduledTime));
  if (method === "save") valid = a.length === 1 && mood(a[0]);
  if (!valid) return fail();
  return { repository, method, args: a };
}
function nativeApiPath(path) {
  return /^\/api\/(repository|account|moods\/analyze|medications\/(search|manual-match|\d{9}|image\/\d{9}))$/.test(path);
}

// lib/native-api/server.ts
async function readBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new NativeRequestError();
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new NativeRequestError();
  const reader = request.body?.getReader();
  if (!reader) throw new NativeRequestError();
  let length = 0;
  const chunks = [];
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new NativeRequestError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new NativeRequestError();
  }
}
function createNativeApiHandler(deps) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = { "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    const json = (body, status = 200) => Response.json(body, { status, headers });
    if (deps.supabaseUrl !== NATIVE_API_ORIGIN) return json({ code: "ENVIRONMENT_DISABLED" }, 503);
    if (origin && origin !== "https://localhost") return json({ code: "ORIGIN_DENIED" }, 403);
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    const url = new URL(request.url);
    const prefix = [NATIVE_API_PREFIX, "/native-api"].find((value) => url.pathname.startsWith(value + "/"));
    const path = prefix ? "/api/" + url.pathname.slice(prefix.length + 1) : "";
    if (!nativeApiPath(path)) return json({ code: "NOT_FOUND" }, 404);
    const expectedMethod = path === "/api/account" ? "DELETE" : ["/api/repository", "/api/moods/analyze"].includes(path) ? "POST" : "GET";
    if (request.method === "OPTIONS") {
      headers["Access-Control-Allow-Methods"] = expectedMethod;
      headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== expectedMethod) return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("authorization") ?? "");
    if (!match) return json({ code: "UNAUTHORIZED" }, 401);
    let identity;
    try {
      identity = await deps.authenticate(match[1]);
    } catch {
      return json({ code: "UNAUTHORIZED" }, 401);
    }
    const { user, client } = identity;
    if (!user || user.is_anonymous) return json({ code: "UNAUTHORIZED" }, 401);
    try {
      if (path === "/api/repository") {
        const { repository, method, args } = validateRepositoryRequest(await readBody(request));
        const repositories = {
          medications: createSupabaseMedicationRepository(user.id, client),
          medicationIntakes: createSupabaseMedicationIntakeRepository(user.id, client),
          moods: createSupabaseMoodRepository(user.id, client),
          visitSchedules: createSupabaseVisitScheduleRepository(user.id, client)
        };
        const fn = repositories[repository][method];
        return json({ data: await fn(...args) ?? null });
      }
      if (path === "/api/account") {
        if (url.search) throw new NativeRequestError();
        const reader = request.body?.getReader();
        if (reader) for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength) {
            await reader.cancel();
            throw new NativeRequestError();
          }
        }
        const admin = deps.admin();
        await deleteAuthenticatedAccount({
          getCurrentUser: async () => ({ user, error: null }),
          deleteFeedback: async (id2) => await admin.from("feedback").delete().eq("user_id", id2),
          deleteAuthUser: async (id2) => await admin.auth.admin.deleteUser(id2, false)
        });
        return json({ ok: true });
      }
      if (path === "/api/moods/analyze") {
        const body = await readBody(request);
        let input;
        try {
          input = validateMoodAnalysisInput(body?.input);
        } catch {
          throw new NativeRequestError();
        }
        if (!deps.openaiKey) return json({ code: "AI_NOT_CONFIGURED", failure_type: "configuration_error" }, 503);
        try {
          return json(await requestOpenAIMoodAnalysis({ input, apiKey: deps.openaiKey, model: deps.openaiModel || DEFAULT_OPENAI_MOOD_MODEL }));
        } catch (error) {
          return json({ code: "ANALYSIS_FAILED", failure_type: classifyMoodAnalysisDiagnostic(getMoodAnalysisFailureDiagnostic(error)) }, 422);
        }
      }
      if (path === "/api/medications/search") {
        const q = url.searchParams.get("q")?.trim() ?? "";
        if (q.length > 50) throw new NativeRequestError();
        return json({ medications: q ? await searchMfdsMedications(q) : [] });
      }
      if (path === "/api/medications/manual-match") {
        const name = url.searchParams.get("name")?.trim() ?? "";
        const strength = Number(url.searchParams.get("strength"));
        if (!name || name.length > 50 || !Number.isFinite(strength) || strength <= 0) throw new NativeRequestError();
        return json(await matchMfdsManualMedication(name, strength));
      }
      const item = path.split("/").at(-1);
      if (path.startsWith("/api/medications/image/")) {
        for (const candidate of await getMfdsImageCandidates(item)) {
          const image = await fetchVerifiedMfdsImage(candidate);
          if (image) return new Response(new Uint8Array(image.bytes), { headers: { ...headers, "Content-Type": image.contentType, "X-Addi-Image-Source": image.source } });
        }
        return json({ code: "IMAGE_NOT_FOUND" }, 404);
      }
      const medication2 = await getMfdsMedication(item);
      return medication2 ? json({ medication: medication2 }) : json({ code: "NOT_FOUND" }, 404);
    } catch (error) {
      if (error instanceof NativeRequestError) return json({ code: "INVALID_REQUEST" }, 400);
      if (error instanceof DuplicateMoodRecordError) return json({ code: "DUPLICATE_MOOD" }, 409);
      return json({ code: "REQUEST_FAILED" }, 502);
    }
  };
}
export {
  createNativeApiHandler
};
