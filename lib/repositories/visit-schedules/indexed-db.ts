import {
  deleteUpcomingVisit,
  getUpcomingVisit,
  saveUpcomingVisit,
} from "@/lib/indexed-db";
import type { VisitScheduleRepository } from "./types";

export const indexedDbVisitScheduleRepository: VisitScheduleRepository = {
  getUpcoming: getUpcomingVisit,
  saveUpcoming: saveUpcomingVisit,
  deleteUpcoming: deleteUpcomingVisit,
};
