import { useTranslations } from "next-intl";

export function StudioCredit() {
  const t = useTranslations("Home");

  return (
    <p className="text-sm leading-relaxed text-(--color-ink-muted)">
      <span className="block">{t("credit")}</span>
      <small className="block text-xs">{t("copyright")}</small>
    </p>
  );
}
