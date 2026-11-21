import { getTranslations } from "next-intl/server";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import {
  getCurrentUserId,
  getGoogleAvailability,
  isRegistrationOpen,
} from "@/composition/identity";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

export async function SessionControls({ locale }: { locale: string }) {
  const [userId, t] = await Promise.all([getCurrentUserId(), getTranslations("Auth")]);

  if (!userId) {
    const registrationOpen = isRegistrationOpen() || (await getGoogleAvailability()).signUp;
    return (
      <>
        {registrationOpen && (
          <Link href="/signup" className="home-primary">
            {t("signup.title")}
          </Link>
        )}
        <Link href="/login" className={registrationOpen ? "home-secondary" : "home-primary"}>
          {t("login.submit")}
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/app" className="home-primary">
        {t("openApp")}
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {t("logout")}
        </Button>
      </form>
    </>
  );
}
