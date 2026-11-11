"use client";
import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { THEMES, type PreferencesSnapshot } from "@/modules/preferences/domain/preferences";
import { Button, FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";
import { savePreferencesAction, type PreferencesFormState } from "./actions";

const selectClass =
  "min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)";
export function PreferencesForm({
  snapshot,
  locale,
  courseOnly = false,
}: {
  snapshot: PreferencesSnapshot;
  locale: string;
  courseOnly?: boolean;
}) {
  const t = useTranslations("Settings");
  const router = useRouter();
  const theme = useTranslations("Theme");
  const [state, action, pending] = useActionState<PreferencesFormState, FormData>(
    savePreferencesAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(ref, state);
  const errorId = courseOnly ? "course-error" : "settings-error";
  const fieldProps = (name: string, note?: string) => ({
    "aria-invalid": state.fields?.includes(name) || undefined,
    "aria-describedby":
      [note, state.fields?.includes(name) ? errorId : undefined].filter(Boolean).join(" ") ||
      undefined,
  });
  return (
    <form ref={ref} action={action} noValidate className="flex min-w-0 flex-col gap-5">
      <input type="hidden" name="operation" value={courseOnly ? "course" : "preferences"} />
      <input type="hidden" name="profileVersion" value={snapshot.profileVersion} />
      <input type="hidden" name="settingsVersion" value={snapshot.settingsVersion} />
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <FormError id={errorId}>
          <p>{t(`errors.${state.error}`)}</p>
          {(state.error === "conflict" || state.error === "unavailable") && (
            <Button type="button" variant="secondary" onClick={() => router.refresh()}>
              {t("reload")}
            </Button>
          )}
        </FormError>
      )}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="sr-only">{t(courseOnly ? "course" : "preferences")}</legend>
        {courseOnly ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="courseId">{t("course")}</Label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={snapshot.courseId}
              className={selectClass}
              {...fieldProps("courseId")}
            >
              {snapshot.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="text-sm text-(--color-ink-muted)">{t("courseNote")}</p>
          </div>
        ) : (
          <>
            <input type="hidden" name="courseId" value={snapshot.courseId} />
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="uiLocale">{t("language")}</Label>
                <select
                  id="uiLocale"
                  name="uiLocale"
                  defaultValue={snapshot.uiLocale}
                  className={selectClass}
                  {...fieldProps("uiLocale")}
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="theme">{theme("label")}</Label>
                <select
                  id="theme"
                  name="theme"
                  defaultValue={snapshot.theme}
                  className={selectClass}
                  {...fieldProps("theme")}
                >
                  {THEMES.map((v) => (
                    <option key={v} value={v}>
                      {theme(v)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="timeZone">{t("timeZone")}</Label>
              <Input
                id="timeZone"
                name="timeZone"
                defaultValue={snapshot.timeZone}
                maxLength={100}
                required
                list="time-zones"
                autoComplete="off"
                spellCheck={false}
                {...fieldProps("timeZone", "time-zone-note")}
              />
              <datalist id="time-zones">
                {[
                  "Europe/Madrid",
                  "Europe/London",
                  "Atlantic/Canary",
                  "America/Mexico_City",
                  "America/Bogota",
                  "America/Argentina/Buenos_Aires",
                  "America/New_York",
                  "Asia/Tokyo",
                  "UTC",
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <p id="time-zone-note" className="text-sm leading-relaxed text-(--color-ink-muted)">
                {t("timeZoneNote")}
              </p>
            </div>
            <div className="border-t border-(--color-border) pt-5">
              <h3 className="font-semibold break-words">
                {snapshot.courses.find((c) => c.id === snapshot.courseId)?.title}
              </h3>
              <p className="mt-1 text-sm text-(--color-ink-muted)">{t("limitsNote")}</p>
            </div>
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="dailyNewLimit">{t("dailyNewLimit")}</Label>
                <Input
                  id="dailyNewLimit"
                  name="dailyNewLimit"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  defaultValue={snapshot.dailyNewLimit}
                  {...fieldProps("dailyNewLimit")}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="maximumReviews">{t("maximumReviews")}</Label>
                <Input
                  id="maximumReviews"
                  name="maximumReviews"
                  type="number"
                  min={0}
                  max={2000}
                  step={1}
                  defaultValue={snapshot.maximumReviews ?? ""}
                  {...fieldProps("maximumReviews", "reviews-note")}
                />
                <p id="reviews-note" className="text-sm text-(--color-ink-muted)">
                  {t("maximumReviewsNote")}
                </p>
              </div>
            </div>
            <label className="flex min-h-11 items-start gap-3 py-2">
              <input
                name="showIntervals"
                type="checkbox"
                defaultChecked={snapshot.showIntervals}
                className="mt-1 size-5 shrink-0"
              />
              <span className="text-sm leading-relaxed">{t("showIntervals")}</span>
            </label>
          </>
        )}
        <div>
          <Button type="submit">
            {pending ? t("saving") : t(courseOnly ? "switchCourse" : "save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
