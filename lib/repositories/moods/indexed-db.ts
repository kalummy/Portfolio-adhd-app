import {
  deleteMoodRecordByDate,
  getMoodRecordByDate,
  getMoodRecords,
  saveMoodRecord,
} from "@/lib/indexed-db";
import { sortMoodRecordsNewestFirst } from "@/lib/mood-history";
import type { MoodRepository } from "./types";

export const indexedDbMoodRepository: MoodRepository = {
  listAll: getMoodRecords,
  async listRecent(startDate, endDate) {
    return sortMoodRecordsNewestFirst(
      (await getMoodRecords()).filter(
        (record) => record.date >= startDate && record.date <= endDate,
      ),
    );
  },
  findByDate: getMoodRecordByDate,
  save: saveMoodRecord,
  deleteByDate: deleteMoodRecordByDate,
};
