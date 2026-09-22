import type { ClassOverview } from "./class-sim";

/**
 * Shared API payload types for the teacher lens surfaces (TEACHER-2).
 * Mirrors GET /api/teacher/course-data.
 */

export interface BankStats {
  totalQuestions: number;
  totalMarks: number;
}

export interface SwitchableCourse {
  slug: string;
  label: string;
  code: string;
  level: string;
}

export interface TeacherCourseData {
  class: ClassOverview;
  bank: BankStats;
  switchable: SwitchableCourse[];
}
