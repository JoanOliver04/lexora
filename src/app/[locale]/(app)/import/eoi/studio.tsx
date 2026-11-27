"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  skills,
  parseEoiPack,
  templatePack,
  exerciseContent,
  type EoiCard,
  type Skill,
  type EoiPack,
  type EoiSource,
} from "@/modules/library/domain/eoi";
import { ListeningExam } from "@/modules/library/presentation/listening-exam";
import { EoiExercise } from "@/modules/library/presentation/eoi-exercise";
import type { EoiLoaded, EoiPreview } from "@/composition/eoi";
import { eoiFromCsv } from "@/composition/import-browser";
import { submitEoi } from "./actions";

const field = "block min-h-11 w-full rounded border bg-transparent p-2";
const button = "min-h-11 rounded border px-3";
function Field({
  label,
  value,
  change,
  multiline = false,
}: {
  label: string;
  value: string;
  change: (s: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      {label}
      {multiline ? (
        <textarea
          className={field}
          rows={3}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input className={field} value={value} onChange={(e) => change(e.target.value)} />
      )}
    </label>
  );
}
function download(pack: EoiPack) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.download = pack.key + ".lexora.json";
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function nextKey(prefix: string, keys: string[]) {
  let i = 1;
  while (keys.includes(prefix + i)) i++;
  return prefix + i;
}
function cardContent(card: EoiCard, source: EoiSource | undefined, hashes: Record<string, string>) {
  return {
    mode: "basic_recognition" as const,
    promptText: card.prompt,
    answerText: card.answer,
    hintText: null,
    clozeAnswers: [],
    ...exerciseContent(
      card,
      source ? { ...source, hash: source.audio ? hashes[source.audio] : undefined } : undefined,
    ),
  };
}
export function EoiStudio({
  initial,
  cardKey,
  draftId,
}: {
  initial: EoiLoaded | null;
  draftId: string;
  cardKey?: string | undefined;
}) {
  const t = useTranslations("Eoi"),
    [pack, setPack] = useState<EoiPack>(initial?.pack ?? templatePack("reading", draftId)),
    [ci, setCi] = useState(
      Math.max(0, initial?.pack.cards.findIndex((c) => c.key === cardKey) ?? 0),
    ),
    [si, setSi] = useState(0);
  const [preview, setPreview] = useState<EoiPreview | null>(null),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [show, setShow] = useState(false),
    [exam, setExam] = useState(false);
  const [hashes, setHashes] = useState<Record<string, string>>(initial?.hashes ?? {});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const allocatedUrls = useRef<Record<string, string>>({});
  const dirty = useRef(false);
  useEffect(() => {
    const urls = allocatedUrls.current;
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const files = useRef(new Map<string, File>());
  const card = pack.cards[ci]!,
    source = pack.sources[si],
    usedSource = pack.sources.find((s) => s.key === card.source);
  function update(p: EoiPack) {
    dirty.current = true;
    setPack(p);
    setPreview(null);
    setResult("");
    setError("");
    setShow(false);
    setExam(false);
  }
  function updateCard(changes: Partial<EoiCard>) {
    update({ ...pack, cards: pack.cards.map((c, i) => (i === ci ? { ...c, ...changes } : c)) });
  }
  function updateSource(changes: Partial<EoiSource>) {
    update({ ...pack, sources: pack.sources.map((s, i) => (i === si ? { ...s, ...changes } : s)) });
  }
  async function audio(file: File) {
    if (file.size > 4194304) throw Error(t("audioSize"));
    const bytes = await file.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (
      hashes[file.name] &&
      hashes[file.name] !== digest &&
      pack.sources.some((s) => s.key !== source?.key && s.audio === file.name)
    )
      throw Error(t("audioCollision"));
    allocatedUrls.current[digest] ??= URL.createObjectURL(file);
    setPreviewUrls({ ...allocatedUrls.current });
    files.current.set(file.name, file);
    setHashes((old) => ({ ...old, [file.name]: digest }));
    setPreview(null);
    return file.name;
  }
  async function submit(apply: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const validated = parseEoiPack(JSON.stringify(pack));
      if (apply) {
        for (const s of validated.sources) {
          if (!s.audio) continue;
          const f = files.current.get(s.audio);
          if (!f) continue;
          const types: Record<string, string> = {
            mp3: "audio/mpeg",
            m4a: "audio/mp4",
            ogg: "audio/ogg",
            wav: "audio/wav",
            webm: "audio/webm",
          };
          const res = await fetch("/api/eoi/audio/" + hashes[s.audio], {
            method: "PUT",
            headers: { "Content-Type": types[s.audio.split(".").pop()!.toLowerCase()]! },
            body: f,
          });
          if (!res.ok) throw Error(t("audioError"));
        }
      }
      const r = await submitEoi(
        JSON.stringify(validated),
        hashes,
        apply ? preview?.token : undefined,
      );
      if ("error" in r) throw Error(r.error);
      if (r.preview) setPreview(r.preview);
      if (r.deck) {
        dirty.current = false;
        setResult(r.deck);
        setPreview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("invalid"));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  const c = cardContent(card, usedSource, hashes);
  const model = usedSource?.audio && previewUrls[hashes[usedSource.audio] ?? ""];
  if (model) {
    if (c.exercise.audio) c.exercise.audio = model;
    c.solution.audio = model;
  }
  return (
    <div className="flex flex-col gap-4">
      <p>{t("intro")}</p>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <label>
          {t("load")}
          <input
            className={field}
            type="file"
            accept=".json,.csv,.tsv,.txt"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 1000000) throw Error(t("invalid"));
                const body = await f.text();
                const p = /\.json$/i.test(f.name)
                  ? parseEoiPack(body)
                  : await eoiFromCsv(
                      f.name,
                      body,
                      pack.skill === "grammar" ? "grammar" : "vocabulary",
                    );
                if (initial && (p.key !== initial.pack.key || p.skill !== initial.pack.skill))
                  throw Error(t("invalid"));
                if (dirty.current && !window.confirm(t("replaceDraft"))) return;
                update(p);
                setCi(0);
                setSi(0);
                setHashes(initial?.hashes ?? {});
                files.current.clear();
              } catch (err) {
                setError(
                  err instanceof Error && err.message.startsWith("CSV:")
                    ? err.message
                    : t("invalid"),
                );
              }
            }}
          />
        </label>
        <label>
          {t("template")}
          <select
            className={field}
            value={pack.skill}
            disabled={!!initial}
            onChange={(e) => {
              if (dirty.current && !window.confirm(t("replaceDraft"))) return;
              update(templatePack(e.target.value as Skill, draftId));
              dirty.current = false;
              setCi(0);
              setSi(0);
              setHashes({});
              files.current.clear();
            }}
          >
            {skills.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t("title")}
          value={pack.title}
          change={(title) => update({ ...pack, title })}
        />
        <label>
          {t("packKey")}
          <input
            className={field}
            readOnly={!!initial}
            value={pack.key}
            onChange={(e) => update({ ...pack, key: e.target.value })}
          />
        </label>
        <details>
          <summary className="cursor-pointer font-semibold">{t("sources")}</summary>
          <div className="flex flex-col gap-2">
            {pack.sources.length > 0 && (
              <select
                className={field}
                aria-label={t("source")}
                value={si}
                onChange={(e) => setSi(+e.target.value)}
              >
                {pack.sources.map((s, i) => (
                  <option key={i} value={i}>
                    {s.title} ({s.key})
                  </option>
                ))}
              </select>
            )}
            {source && (
              <>
                <Field
                  label={t("sourceKey")}
                  value={source.key}
                  change={(key) => {
                    update({
                      ...pack,
                      sources: pack.sources.map((s, i) => (i === si ? { ...s, key } : s)),
                      cards: pack.cards.map((c) =>
                        c.source === source.key ? { ...c, source: key } : c,
                      ),
                    });
                  }}
                />
                <Field
                  label={t("title")}
                  value={source.title}
                  change={(title) => updateSource({ title })}
                />
                <Field
                  multiline
                  label={t("passage")}
                  value={source.text ?? ""}
                  change={(text) => updateSource({ text: text || undefined })}
                />
                <Field
                  multiline
                  label={t("transcript")}
                  value={source.transcript ?? ""}
                  change={(v) => updateSource({ transcript: v || undefined })}
                />
                <label>
                  {t("audioFile")} {source.audio}
                  <input
                    type="file"
                    accept=".mp3,.ogg,.m4a,.wav,.webm"
                    className={field}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        try {
                          const name = await audio(f);
                          updateSource({ audio: name });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("audioError"));
                        }
                    }}
                  />
                </label>
                {source.audio && hashes[source.audio] && (
                  <a
                    className="underline"
                    download={source.audio}
                    href={
                      previewUrls[hashes[source.audio]!] ??
                      "/api/eoi/audio/" +
                        hashes[source.audio] +
                        "?download=" +
                        encodeURIComponent(source.audio)
                    }
                  >
                    {t("downloadAudio")}
                  </a>
                )}
              </>
            )}
            <button
              className={button}
              type="button"
              onClick={() => {
                setSi(pack.sources.length);
                update({
                  ...pack,
                  sources: [
                    ...pack.sources,
                    {
                      key: nextKey(
                        "s",
                        pack.sources.map((s) => s.key),
                      ),
                      title: t("source"),
                    },
                  ],
                });
              }}
            >
              {t("addSource")}
            </button>
            {source && !pack.cards.some((q) => q.source === source.key) && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  const sources = pack.sources.filter((_, i) => i !== si);
                  setSi(Math.max(0, Math.min(si, sources.length - 1)));
                  update({ ...pack, sources });
                }}
              >
                {t("removeSource")}
              </button>
            )}
          </div>
        </details>
        <label>
          {t("card")}
          <select
            className={field}
            value={ci}
            onChange={(e) => {
              setCi(+e.target.value);
              setShow(false);
            }}
          >
            {pack.cards.map((c, i) => (
              <option key={i} value={i}>
                {i + 1}. {c.prompt}
              </option>
            ))}
          </select>
        </label>
        <Field label={t("cardKey")} value={card.key} change={(key) => updateCard({ key })} />
        <label>
          {t("format")}
          <select
            className={field}
            value={card.type}
            onChange={(e) => updateCard({ type: e.target.value as EoiCard["type"] })}
          >
            {(pack.skill === "vocabulary"
              ? (["word"] as const)
              : (["short", "choice", "written", "oral", "imitate", "produce"] as const)
            ).map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("source")}
          <select
            className={field}
            value={card.source ?? ""}
            onChange={(e) => updateCard({ source: e.target.value || undefined })}
          >
            <option value="">—</option>
            {pack.sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <Field
          multiline
          label={t("prompt")}
          value={card.prompt}
          change={(prompt) => updateCard({ prompt })}
        />
        <Field
          multiline
          label={t("model")}
          value={card.answer}
          change={(answer) => updateCard({ answer })}
        />
        {(
          ["alternatives", "criteria", "tags", ...(card.type === "choice" ? ["options"] : [])] as (
            "alternatives" | "criteria" | "tags" | "options"
          )[]
        ).map((k) => (
          <Field
            key={k}
            multiline
            label={t(k)}
            value={card[k].join("\n")}
            change={(val) => updateCard({ [k]: val ? val.split("\n") : [] })}
          />
        ))}
        <Field
          label={t("evidence")}
          value={card.evidence ?? ""}
          change={(v) => updateCard({ evidence: v || undefined })}
        />
        {pack.skill === "pronunciation" && (
          <Field
            label={t("emphasis")}
            value={card.emphasis ?? ""}
            change={(v) => updateCard({ emphasis: v || undefined })}
          />
        )}
        {usedSource?.audio && (
          <div className="flex gap-2">
            {([0, 1] as const).map((i) => (
              <label key={i}>
                {i === 0 ? t("from") : t("to")}
                <input
                  className={field}
                  type="number"
                  min="0"
                  step=".1"
                  value={card.clip?.[i] ?? ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      updateCard({ clip: undefined });
                      return;
                    }
                    const v: [number, number] = [...(card.clip ?? [0, 1])];
                    v[i] = Number(e.target.value);
                    updateCard({ clip: v });
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setCi(pack.cards.length);
              update({
                ...pack,
                cards: [
                  ...pack.cards,
                  {
                    ...card,
                    key: nextKey(
                      "q",
                      pack.cards.map((c) => c.key),
                    ),
                    prompt: "",
                    answer: "",
                  },
                ],
              });
            }}
          >
            {t("addCard")}
          </button>
          <button
            type="button"
            className={button}
            disabled={pack.cards.length < 2}
            onClick={() => {
              const cards = pack.cards.filter((_, index) => index !== ci);
              setCi(Math.min(ci, cards.length - 1));
              update({ ...pack, cards });
            }}
          >
            {t("removeCard")}
          </button>
          <button type="button" className={button} onClick={() => setShow((v) => !v)}>
            {t("showModel")}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              try {
                download(parseEoiPack(JSON.stringify(pack)));
              } catch {
                setError(t("invalid"));
              }
            }}
          >
            {t("download")}
          </button>
        </div>
        <section className="rounded border p-4">
          <h2>{t("previewCard")}</h2>
          <p>{card.prompt}</p>
          <EoiExercise key={ci + ":" + card.type} front={c} revealed={show ? c : null} />
          {show && <p>{card.answer}</p>}
          {card.type === "word" && (
            <div className="mt-3 border-t pt-2">
              <p>{t("reverse")}</p>
              <p>{card.answer}</p>
              {show && <p>{card.prompt}</p>}
            </div>
          )}
        </section>
        {pack.skill === "listening" && (
          <button className={button} type="button" onClick={() => setExam(!exam)}>
            {t("exam")}
          </button>
        )}
        {exam && <ListeningExam pack={pack} hashes={hashes} previews={previewUrls} />}
        <button className={button} type="button" onClick={() => void submit(false)}>
          {t("preview")}
        </button>
        {preview && (
          <section aria-live="polite">
            <p>
              {t("counts", {
                created: preview.new,
                linked: preview.linked,
                updated: preview.updated,
                removed: preview.removed,
              })}
            </p>
            {preview.variants.map((v) => (
              <p key={v.front}>
                {v.front} — {v.current} · {v.incoming}
              </p>
            ))}
            <button className={button} type="button" onClick={() => void submit(true)}>
              {t("save")}
            </button>
          </section>
        )}
      </fieldset>
      {error && (
        <p role="alert">
          {t("problem")} {error}
        </p>
      )}
      {result && (
        <Link className="underline" href={"/decks/" + result}>
          {t("openDeck")}
        </Link>
      )}
    </div>
  );
}
