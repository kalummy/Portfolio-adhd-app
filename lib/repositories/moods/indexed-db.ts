import { getMoodRecords, saveMoodRecord } from "@/lib/indexed-db";
import type { MoodRepository } from "./types";

export const indexedDbMoodRepository: MoodRepository = {
  listAll: getMoodRecords,
  save: saveMoodRecord,
};
