import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function StudyLayout({ children }: { children: ReactNode }) {
  return (
    <ClientMessages
      namespaces={["PracticeCard", "SessionSummary", "StudySession", "StudyDeckPicker", "Eoi"]}
    >
      {children}
    </ClientMessages>
  );
}
