import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <ClientMessages
      namespaces={["AccountDeletion", "DataExport", "DataRestore", "Pwa", "Settings", "Theme"]}
    >
      {children}
    </ClientMessages>
  );
}
