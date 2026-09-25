"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const PHRASES = [
  "Marico el que no compre entradas",
  "¿Se te fue la luz? Ven.",
  "Cobramos a BCV, es decir GRATIS",
  "Aprovecha que es quincena.",
  "Ven y ríete un rato.",
  "Trae a tu ex. No juzgamos.",
];

const TYPE_SPEED_MS = 85;
const DELETE_SPEED_MS = 45;
const HOLD_MS = 1900;
const GAP_MS = 400;

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServer() {
  return false;
}

// The headline wraps instead of shrinking to fit one line: its size
// comes from the viewport (CSS clamp), and the box reserves room for
// the longest phrase — 3 lines on phones/tablets, 2 from lg up — so the page
// never jumps while text is typed and deleted. No JS measuring, so it
// can't be thrown off by the display font loading late.
export function TypewriterHero() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  );

  useEffect(() => {
    if (reducedMotion) return;
    const phrase = PHRASES[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < phrase.length) {
        timeout = setTimeout(
          () => setText(phrase.slice(0, text.length + 1)),
          TYPE_SPEED_MS,
        );
      } else {
        timeout = setTimeout(() => setPhase("deleting"), HOLD_MS);
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(
          () => setText(phrase.slice(0, text.length - 1)),
          DELETE_SPEED_MS,
        );
      } else {
        timeout = setTimeout(() => {
          setPhraseIndex((i) => (i + 1) % PHRASES.length);
          setPhase("typing");
        }, GAP_MS);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, phase, phraseIndex, reducedMotion]);

  const displayText = reducedMotion ? PHRASES[0] : text;

  return (
    <h1 className="min-h-[3em] font-heading text-[clamp(2.25rem,10vw,4.5rem)] leading-none font-extrabold tracking-tight uppercase break-words lg:min-h-[2em]">
      <span aria-hidden="true">
        <span className="tc-text-glow-neutral text-foreground">{displayText}</span>
        <span className="ml-1 inline-block -translate-y-[0.05em] animate-pulse text-highlight tc-text-glow-warm motion-reduce:animate-none">
          ▍
        </span>
      </span>
      <span className="sr-only">{PHRASES.join(". ")}</span>
    </h1>
  );
}
