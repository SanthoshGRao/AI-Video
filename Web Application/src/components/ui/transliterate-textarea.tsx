"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/ui";

/**
 * Textarea with Kannada/Hindi transliteration suggestions.
 *
 * Deliberately does NOT auto-commit on space, unlike a normal IME. These scripts
 * are Kanglish — "investment", "RTC" and "40 feet" must stay in Latin while only
 * the Kannada words convert. Auto-committing would mangle every English word, so
 * space keeps what you typed and you actively accept a suggestion (Enter/Tab, or
 * 1-5) only on the words you want in Kannada script.
 */

/** Languages whose scripts benefit from transliteration input. */
const LANG_TO_CODE: Record<string, string> = {
  kannada: "kn",
  kannada_english: "kn",
  hindi_english: "hi",
};

export function supportsTransliteration(projectLanguage?: string | null) {
  return !!projectLanguage && projectLanguage in LANG_TO_CODE;
}

/** CSS properties the mirror element must share for caret math to line up. */
const MIRROR_PROPS = [
  "box-sizing", "border-bottom-width", "border-left-width", "border-right-width",
  "border-top-width", "font-family", "font-size", "font-style", "font-variant",
  "font-weight", "letter-spacing", "line-height", "padding-bottom", "padding-left",
  "padding-right", "padding-top", "text-align", "text-indent", "text-transform",
  "word-spacing",
];

/**
 * Pixel offset of the caret inside a textarea, by rendering an invisible clone
 * of the text and measuring where a marker span lands.
 */
function getCaretCoords(el: HTMLTextAreaElement, position: number) {
  const computed = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRROR_PROPS) {
    mirror.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    width: computed.width,
    top: "0",
    left: "0",
  });

  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  // Needs non-empty content to have a measurable box.
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop - el.scrollTop;
  const left = marker.offsetLeft - el.scrollLeft;
  const lineHeight = parseInt(computed.lineHeight, 10) || 20;
  document.body.removeChild(mirror);

  return { top: top + lineHeight, left };
}

/** The run of Latin letters immediately before the caret, if the caret sits at its end. */
function activeWordAt(value: string, caret: number) {
  if (caret === 0) return null;
  // A following letter means the caret is mid-word; suggestions would be wrong.
  if (/[a-zA-Z]/.test(value[caret] ?? "")) return null;

  let start = caret;
  while (start > 0 && /[a-zA-Z]/.test(value[start - 1])) start--;
  if (start === caret) return null;

  return { word: value.slice(start, caret), start };
}

type Props = Omit<React.ComponentProps<typeof Textarea>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** Project language; transliteration is inert unless it's a supported one. */
  language?: string | null;
};

export function TransliterateTextarea({
  value,
  onChange,
  language,
  className,
  onKeyDown,
  ...props
}: Props) {
  const langCode = language ? LANG_TO_CODE[language] : undefined;
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const cacheRef = React.useRef(new Map<string, string[]>());

  const [enabled, setEnabled] = React.useState(true);
  const [candidates, setCandidates] = React.useState<string[]>([]);
  const [highlighted, setHighlighted] = React.useState(0);
  const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);
  // The word the visible candidates belong to; guards against a slow response
  // overwriting suggestions for a word the user has since moved past.
  const [target, setTarget] = React.useState<{ word: string; start: number } | null>(null);

  const active = enabled && !!langCode;

  const dismiss = React.useCallback(() => {
    setCandidates([]);
    setTarget(null);
    setAnchor(null);
    setHighlighted(0);
  }, []);

  // Look up the word at the caret, debounced, and place the popup under it.
  React.useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el || el.selectionStart !== el.selectionEnd) return dismiss();

    const found = activeWordAt(value, el.selectionStart);
    if (!found) return dismiss();

    const key = `${langCode}:${found.word}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setCandidates(cached);
      setTarget(found);
      setHighlighted(0);
      setAnchor(getCaretCoords(el, found.start));
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/transliterate?text=${encodeURIComponent(found.word)}&lang=${langCode}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        const list: string[] = Array.isArray(data.candidates) ? data.candidates : [];
        cacheRef.current.set(key, list);
        if (list.length === 0) return dismiss();
        setCandidates(list);
        setTarget(found);
        setHighlighted(0);
        if (ref.current) setAnchor(getCaretCoords(ref.current, found.start));
      } catch {
        // Aborted or offline — leave the text as plain Latin.
      }
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, active, langCode, dismiss]);

  const accept = React.useCallback(
    (candidate: string) => {
      if (!target) return;
      const next =
        value.slice(0, target.start) + candidate + value.slice(target.start + target.word.length);
      onChange(next);
      dismiss();

      // Restore the caret to just after the inserted word.
      const caret = target.start + candidate.length;
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.setSelectionRange(caret, caret);
      });
    },
    [target, value, onChange, dismiss]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => (h + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => (h - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        accept(candidates[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      // 1-5 pick a candidate directly.
      if (/^[1-5]$/.test(e.key) && candidates[Number(e.key) - 1]) {
        e.preventDefault();
        accept(candidates[Number(e.key) - 1]);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(dismiss, 150)}
        className={className}
      />

      {langCode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEnabled((v) => !v);
            dismiss();
          }}
          title={
            enabled
              ? "Kannada typing on — type in English letters, press Enter to convert"
              : "Kannada typing off"
          }
          className={cn(
            "absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            enabled
              ? "bg-primary/10 text-primary"
              : "bg-slate-100 text-slate-400 hover:text-slate-600"
          )}
        >
          {langCode === "kn" ? "ಕ" : "हि"}
        </button>
      )}

      {active && candidates.length > 0 && anchor && (
        <ul
          className="absolute z-50 min-w-[9rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          style={{ top: anchor.top, left: anchor.left }}
          onMouseDown={(e) => e.preventDefault()} // keep textarea focus
        >
          {candidates.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => accept(c)}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-2.5 py-1 text-left text-sm",
                  i === highlighted ? "bg-primary/10 text-primary" : "text-slate-700"
                )}
              >
                <span>{c}</span>
                <span className="text-[10px] text-slate-400">{i + 1}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-2.5 pt-1 text-[10px] text-slate-400">
            Enter to accept · Esc to keep English
          </li>
        </ul>
      )}
    </div>
  );
}
