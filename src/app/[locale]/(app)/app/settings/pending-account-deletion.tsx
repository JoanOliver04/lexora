"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/presentation/components";
import { resumeAccountDeletionAction } from "./deletion-actions";
import { logoutAction } from "@/app/[locale]/(auth)/actions";

export function PendingAccountDeletion({ locale }: { locale: string }) {
  const t = useTranslations("AccountDeletion");
  const [failed, resume, busy] = useActionState(
    resumeAccountDeletionAction.bind(null, locale),
    false,
  );
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-12">
      <h1 className="text-2xl font-semibold">{t("pendingTitle")}</h1>
      <p>{t("errors.cleanup-pending")}</p>
      <form action={resume}>
        <Button type="submit" disabled={busy}>
          {t(busy ? "deleting" : "resume")}
        </Button>
      </form>
      {failed && <p role="status">{t("retryCleanup")}</p>}
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {t("signOut")}
        </Button>
      </form>
    </main>
  );
}
