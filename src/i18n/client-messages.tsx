import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import type englishMessages from "../../messages/en.json";

type Namespace = keyof typeof englishMessages;

/** Server-rendered text uses the full catalog. Send only the namespaces used below. */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Namespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace]]))}
    >
      {children}
    </NextIntlClientProvider>
  );
}
