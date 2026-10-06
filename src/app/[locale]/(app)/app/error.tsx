"use client";

import { DashboardError } from "./dashboard-error";

export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-12 sm:px-6">
      <DashboardError retry={retry} />
    </main>
  );
}
