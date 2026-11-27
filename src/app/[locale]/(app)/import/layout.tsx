import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function ImportLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["Import", "Library", "Eoi"]}>{children}</ClientMessages>;
}
