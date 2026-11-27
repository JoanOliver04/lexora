import { getTranslations } from "next-intl/server";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import {
  getCurrentUserId,
  getGoogleAvailability,
  isRegistrationOpen,
} from "@/composition/identity";
import { Link } from "@/i18n/navigation";

import styles from "./landing.module.css";

export async function SessionControls({
  locale,
  presentation = "header",
}: {
  locale: string;
  presentation?: "header" | "completion";
}) {
  const completion = presentation === "completion";
  const [userId, t] = await Promise.all([getCurrentUserId(), getTranslations("Auth")]);

  if (!userId) {
    const registrationOpen = isRegistrationOpen() || (await getGoogleAvailability()).signUp;
    return (
      <>
        {registrationOpen && (
          <Link href="/signup" className={completion ? styles["demoLink"] : styles["quietAccount"]}>
            {t("signup.title")}
          </Link>
        )}
        <Link
          href="/login"
          className={completion && !registrationOpen ? styles["demoLink"] : styles["account"]}
        >
          {t("login.submit")}
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/app" className={completion ? styles["demoLink"] : styles["account"]}>
        {t("openApp")}
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className={styles["quietAccount"]}>
          {t("logout")}
        </button>
      </form>
    </>
  );
}
