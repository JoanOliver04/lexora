export const THEMES = ["system", "light", "dark"] as const;
export type AccountTheme = (typeof THEMES)[number];

export interface Preferences {
  uiLocale: "es" | "en";
  theme: AccountTheme;
  timeZone: string;
  dailyNewLimit: number;
  maximumReviews: number | null;
  showIntervals: boolean;
}

export interface PreferencesSnapshot extends Preferences {
  courseId: string;
  profileVersion: string;
  settingsVersion: string;
  courses: { id: string; title: string }[];
}
