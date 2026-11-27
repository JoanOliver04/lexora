"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { answerMatches } from "../domain/eoi";
import type {
  PracticeItemContent,
  PracticeItemPromptContent,
} from "../application/practice-item-content";

type AudioProps = {
  url: string;
  clip?: [number, number] | undefined;
  limit?: number;
  onStarted?: () => void;
  played?: number;
};
export function ModelAudio(props: AudioProps) {
  return <AudioPlayer key={props.url} {...props} />;
}
function AudioPlayer({ url, clip, limit, onStarted, played }: AudioProps) {
  const t = useTranslations("Eoi");
  const el = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false),
    [localCount, setCount] = useState(0);
  const count = played ?? localCount;
  const lock = useRef(false);
  function stop() {
    el.current?.pause();
    setPlaying(false);
  }
  useEffect(() => {
    const a = el.current;
    return () => {
      a?.pause();
    };
  }, [url]);
  async function play() {
    const a = el.current;
    if (!a || lock.current || (limit !== undefined && count >= limit)) return;
    lock.current = true;
    setFailed(false);
    try {
      if (!a.getAttribute("src")) a.src = url;
      a.currentTime = clip?.[0] ?? 0;
      await a.play();
      setPlaying(true);
      setCount((n) => n + 1);
      onStarted?.();
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <audio
        ref={el}
        preload="none"
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
        onTimeUpdate={() => {
          if (clip && el.current && el.current.currentTime >= clip[1]) stop();
        }}
      />
      <button
        className="min-h-11 w-fit underline"
        type="button"
        disabled={!playing && limit !== undefined && count >= limit}
        onClick={() => (playing ? stop() : void play())}
      >
        {playing ? t("stop") : clip ? t("clue") : t("listen")}
      </button>
      {limit !== undefined && <span>{t("listens", { count, limit })}</span>}
      {failed && <span role="alert">{t("audioError")}</span>}
    </div>
  );
}

function Recorder() {
  const t = useTranslations("Eoi"),
    rec = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    objectUrl = useRef(""),
    generation = useRef(0);
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "error">("idle"),
    [url, setUrl] = useState("");
  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(
    () => () => {
      generation.current++;
      if (rec.current?.state === "recording") rec.current.stop();
      release();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  async function record() {
    const token = ++generation.current;
    setState("requesting");
    try {
      if (typeof MediaRecorder === "undefined") throw Error();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== generation.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const recorder = new MediaRecorder(mic);
      rec.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        mic.getTracks().forEach((track) => track.stop());
        if (stream.current === mic) stream.current = null;
        if (token !== generation.current) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
        setUrl(objectUrl.current);
        setState("idle");
      };
      recorder.onerror = () => {
        release();
        if (token === generation.current) setState("error");
      };
      recorder.start();
      setState("recording");
    } catch {
      release();
      if (token === generation.current) setState("error");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="min-h-11 w-fit underline"
        disabled={state === "requesting"}
        onClick={() => (state === "recording" ? rec.current?.stop() : void record())}
      >
        {state === "recording" ? t("finishRecording") : t("record")}
      </button>
      {state === "error" && <p role="status">{t("micError")}</p>}
      {url && (
        <>
          <label>
            {t("listenSelf")}
            <audio className="block max-w-full" controls src={url} />
          </label>
          <button
            type="button"
            className="w-fit underline"
            onClick={() => {
              URL.revokeObjectURL(objectUrl.current);
              objectUrl.current = "";
              setUrl("");
            }}
          >
            {t("discard")}
          </button>
        </>
      )}
    </div>
  );
}
function Marked({ text, part }: { text: string; part?: string | undefined }) {
  const index = part ? text.indexOf(part) : -1;
  if (!part || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{part}</mark>
      {text.slice(index + part.length)}
    </>
  );
}
export function EoiExercise({
  front,
  revealed,
}: {
  front: PracticeItemPromptContent;
  revealed?: PracticeItemContent | null | undefined;
}) {
  const t = useTranslations("Eoi"),
    id = useId(),
    [attempt, setAttempt] = useState("");
  const ex = front.exercise;
  if (!ex) return null;
  const sol = revealed?.solution,
    oral = ["oral", "imitate", "produce"].includes(ex.type);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {ex.passage && (
        <blockquote className="whitespace-pre-wrap border-s-2 ps-3">
          <Marked text={ex.passage} part={sol?.evidence} />
        </blockquote>
      )}
      {ex.audio && <ModelAudio url={ex.audio} />}
      {oral ? (
        <>
          <p>{t("speak")}</p>
          {(ex.type === "imitate" || ex.type === "produce") && <Recorder />}
        </>
      ) : ex.type === "choice" ? (
        <fieldset>
          <legend>{t("select")}</legend>
          {ex.options.map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={id}
                value={option}
                checked={attempt === option}
                onChange={() => setAttempt(option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      ) : (
        <label>
          {t("answer")}
          <textarea
            className="block w-full rounded border p-2"
            rows={ex.type === "written" ? 4 : 2}
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
          />
        </label>
      )}
      {sol && revealed && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {attempt.trim() && ["short", "choice"].includes(ex.type) && (
            <p>
              {answerMatches(attempt, revealed.answerText, sol.alternatives)
                ? t("match")
                : t("compare")}
            </p>
          )}
          {sol.emphasis && (
            <p>
              <Marked text={revealed.answerText} part={sol.emphasis} />
            </p>
          )}
          {sol.audio && (sol.clip || ex.type === "produce") && (
            <ModelAudio url={sol.audio} clip={sol.clip} />
          )}
          {sol.evidence && !ex.passage?.includes(sol.evidence) && (
            <blockquote>{sol.evidence}</blockquote>
          )}
          {sol.transcript && (
            <details>
              <summary>{t("transcript")}</summary>
              <p className="whitespace-pre-wrap">
                <Marked text={sol.transcript} part={sol.evidence} />
              </p>
            </details>
          )}
          {sol.criteria.map((c) => (
            <label className="flex min-h-11 items-center gap-2" key={c}>
              <input type="checkbox" />
              {c}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
