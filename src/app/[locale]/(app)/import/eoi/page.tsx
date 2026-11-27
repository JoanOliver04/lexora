import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getEoiPack } from "@/composition/eoi";
import { parseStudySessionId } from "@/modules/study/application/study-session";
import { EoiStudio } from "./studio";
export default async function EoiPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deck?: string; card?: string; fromStudy?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await getActiveCourseForCurrentUser())) redirect("/" + locale + "/onboarding");
  const { deck, card, fromStudy } = await searchParams;
  const session = parseStudySessionId(fromStudy);
  const concepts = await getTranslations("Concepts");
  const data = deck ? await getEoiPack(deck) : null;
  if (deck && !data) notFound();
  const t = await getTranslations("Eoi");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8">
      <Link href={session ? "/app/study/" + session : "/import"} className="underline">
        {session ? concepts("items.backToReview") : t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("studio")}</h1>
      <EoiStudio draftId={crypto.randomUUID()} initial={data} cardKey={card} />
    </main>
  );
}
