import type { CefrLevel } from "@/modules/courses/domain/onboarding";

export interface ActiveCourse {
  id: string;
  title: string;
  targetLocale: string;
  targetLanguageName: string | null;
  declaredLevel: CefrLevel | null;
  startLevel: CefrLevel | null;
}

export interface WorkspaceProfile {
  course: ActiveCourse | null;
  timeZone: string;
  theme: string;
  onboardingComplete: boolean;
}

export interface ActiveCourseRepository {
  readWorkspaceProfile(userId: string): Promise<WorkspaceProfile | null>;
}
