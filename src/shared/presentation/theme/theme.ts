export const THEME_STORAGE_KEY = "lexora-theme";

export const themePreferences = ["light", "dark", "system"] as const;

/**
 * Lo que el usuario elige. `system` no es un tema: es «sigue al sistema
 * operativo», y por eso hay que distinguirlo de haber elegido claro
 * explicitamente. Sin esa distincion, alguien que quiere seguir al sistema
 * queda anclado al valor que tuviera el dia que abrio la aplicacion.
 */
export type ThemePreference = (typeof themePreferences)[number];

/** Lo que acaba aplicado al documento. Aqui `system` ya esta resuelto. */
export type ResolvedTheme = "light" | "dark";
