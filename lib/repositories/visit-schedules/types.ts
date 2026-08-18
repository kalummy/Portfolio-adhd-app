import type { VisitSchedule } from "@/lib/types";

export interface VisitScheduleRepository {
  getUpcoming(): Promise<VisitSchedule | null>;
  saveUpcoming(visitDate: string): Promise<VisitSchedule>;
  deleteUpcoming(): Promise<void>;
}
