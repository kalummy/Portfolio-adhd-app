import type { MoodRecord } from "@/lib/types";

export type NewMoodRecord = Omit<MoodRecord, "id"> & {
  memberSummary: string;
};

export interface MoodRepository {
  listAll(): Promise<MoodRecord[]>;
  listRecent(startDate: string, endDate: string): Promise<MoodRecord[]>;
  findByDate(date: string): Promise<MoodRecord | null>;
  save(record: NewMoodRecord): Promise<MoodRecord>;
  deleteByDate(date: string): Promise<void>;
}

export class DuplicateMoodRecordError extends Error {
  constructor() { super("이미 이 날짜의 감정 기록이 있어요."); this.name = "DuplicateMoodRecordError"; }
}
