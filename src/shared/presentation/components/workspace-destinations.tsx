export const workspaceDestinations = [
  {
    href: "/app",
    key: "today",
    path: "M4 11h16M8 3v4m8-4v4M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 10h3v3H8z",
  },
  { href: "/decks", key: "decks", path: "m5 8 7-4 7 4-7 4-7-4Zm0 4 7 4 7-4M5 16l7 4 7-4" },
  {
    href: "/concepts",
    key: "concepts",
    path: "M4 4h5a4 4 0 0 1 3 1.4A4 4 0 0 1 15 4h5v15h-5a4 4 0 0 0-3 1 4 4 0 0 0-3-1H4V4Zm8 2v14",
  },
  { href: "/app/statistics", key: "statistics", path: "M5 20V10m7 10V4m7 16v-7M3 20h18" },
  { href: "/app/settings", key: "settings", path: "M4 7h16M4 17h16M8 4v6m8 4v6" },
  { href: "/import", key: "import", path: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" },
  { href: "/app/history", key: "history", path: "M4 8a9 9 0 1 1-1 7M3 3v6h6m3-3v6l4 2" },
] as const;

export function isWorkspaceDestinationActive(pathname: string, href: string) {
  return href === "/app"
    ? pathname === "/app" || pathname.startsWith("/app/study")
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
