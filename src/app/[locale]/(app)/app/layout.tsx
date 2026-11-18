import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["Today"]}>{children}</ClientMessages>;
}
