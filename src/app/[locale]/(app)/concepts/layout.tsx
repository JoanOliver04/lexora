import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function ConceptsLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["Concepts", "PracticeCard"]}>{children}</ClientMessages>;
}
