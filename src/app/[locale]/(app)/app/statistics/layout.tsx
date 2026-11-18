import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function StatisticsLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["History", "Statistics"]}>{children}</ClientMessages>;
}
