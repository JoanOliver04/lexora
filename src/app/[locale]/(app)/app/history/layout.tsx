import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["History"]}>{children}</ClientMessages>;
}
