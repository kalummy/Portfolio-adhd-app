import type { MoodRecord } from "@/lib/types";

export type NewMoodRecord = Omit<MoodRecord, "id"> & {
  memberSummary: string;
};

export interface MoodRepository {
  listAll(): Promise<MoodRecord[]>;
  save(record: NewMoodRecord): Promise<MoodRecord>;
}
