import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function DecksLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["Library", "Eoi"]}>{children}</ClientMessages>;
}
