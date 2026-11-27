import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getEoiPack } from "@/composition/eoi";
import { Link } from "@/i18n/navigation";
import { ListeningExam } from "@/modules/library/presentation/listening-exam";
export default async function ListeningBlock({
  params,
}: {
  params: Promise<{ locale: string; deckId: string }>;
}) {
  const { locale, deckId } = await params;
  setRequestLocale(locale);
  const data = await getEoiPack(deckId);
  if (!data || data.pack.skill !== "listening") notFound();
  const t = await getTranslations("Eoi");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8">
      <Link className="underline" href={"/decks/" + deckId}>
        {data.pack.title}
      </Link>
      <h1 className="text-2xl font-semibold">{t("exam")}</h1>
      <ListeningExam pack={data.pack} hashes={data.hashes} />
    </main>
  );
}
