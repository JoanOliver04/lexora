"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Label } from "@/shared/presentation/components";

export function ImportSource({
  active,
  errorId,
  onSourceChange,
}: {
  active: boolean;
  errorId?: string | undefined;
  onSourceChange: () => void;
}) {
  const t = useTranslations("Import");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const usingFile = mode === "file";

  return (
    <fieldset
      id="import-source"
      tabIndex={-1}
      className="flex min-w-0 scroll-mt-6 flex-col gap-3 rounded-(--radius-surface) border border-(--color-border) p-[clamp(12px,4vw,16px)]"
      disabled={!active}
      onChange={onSourceChange}
    >
      <legend className="px-1 text-sm font-semibold">{t("source.title")}</legend>
      <div className="flex min-w-0 flex-wrap gap-2">
        {(["file", "paste"] as const).map((item) => (
          <label
            key={item}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-(--color-border-strong) px-3 py-2 text-sm has-checked:border-(--color-accent)"
          >
            <input
              type="radio"
              name="import-source"
              className="size-6 shrink-0 accent-(--color-accent)"
              value={item}
              checked={mode === item}
              onChange={() => setMode(item)}
            />
            {t(`source.${item}`)}
          </label>
        ))}
      </div>
      <div className={usingFile ? "flex min-w-0 flex-col gap-2" : "hidden"}>
        <Label htmlFor="import-file">{t("fileLabel")}</Label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"
          className="min-h-11 w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-(--radius-control) file:border-0 file:bg-(--color-accent) file:px-4 file:text-sm file:font-semibold file:text-(--color-on-accent) hover:file:bg-(--color-accent-hover) disabled:file:cursor-not-allowed disabled:file:opacity-50"
          disabled={!usingFile}
          aria-invalid={usingFile && Boolean(errorId) ? true : undefined}
          aria-describedby={
            usingFile && errorId ? `import-file-hint ${errorId}` : "import-file-hint"
          }
        />
        <p id="import-file-hint" className="text-xs text-(--color-ink-muted)">
          {t("fileHint")}
        </p>
      </div>
      <div className={usingFile ? "hidden" : "flex min-w-0 flex-col gap-2"}>
        <Label htmlFor="import-text">{t("source.textLabel")}</Label>
        <textarea
          id="import-text"
          name="import-text"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={usingFile}
          spellCheck={false}
          autoCapitalize="none"
          className="w-full min-w-0 resize-y rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) p-3 text-base"
          aria-invalid={!usingFile && Boolean(errorId) ? true : undefined}
          aria-describedby={
            !usingFile && errorId ? `import-text-hint ${errorId}` : "import-text-hint"
          }
        />
        <p id="import-text-hint" className="text-xs text-(--color-ink-muted)">
          {t("source.textHint")}
        </p>
      </div>
    </fieldset>
  );
}
