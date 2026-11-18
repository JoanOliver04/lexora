import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <ClientMessages namespaces={["Onboarding"]}>{children}</ClientMessages>;
}
