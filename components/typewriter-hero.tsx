"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const PHRASES = [
  "Marico el que no compre entradas",
  "¿Se te fue la luz? Ven.",
  "Ven y gasta esa plata.",
  "Ven y ríete un rato.",
  "Trae a tu ex. No juzgamos.",
];

const TYPE_SPEED_MS = 85;
const DELETE_SPEED_MS = 45;
const HOLD_MS = 1900;
const GAP_MS = 400;

// Base size the headline is designed at — shrunk per-phrase only if the
// full phrase would overflow one line at this size.
const BASE_PX_MOBILE = 40;
const BASE_PX_DESKTOP = 64;
const MIN_PX = 22;

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

export function TypewriterHero() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  const [fontSize, setFontSize] = useState(BASE_PX_MOBILE);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

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

  // Recompute the font size once per phrase (not per keystroke) so it
  // stays stable while typing/deleting, and refit on resize.
  useEffect(() => {
    function fit() {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;

      const base = window.innerWidth >= 640 ? BASE_PX_DESKTOP : BASE_PX_MOBILE;
      measure.style.fontSize = `${base}px`;
      measure.textContent = PHRASES[phraseIndex];

      const containerWidth = container.clientWidth;
      const textWidth = measure.scrollWidth;
      const scale = textWidth > 0 ? containerWidth / textWidth : 1;
      const size = Math.max(MIN_PX, Math.min(base, base * scale));
      setFontSize(size);
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [phraseIndex]);

  const displayText = reducedMotion ? PHRASES[0] : text;

  return (
    <div ref={containerRef} className="min-h-[3.25rem] sm:min-h-[5rem]">
      <h1
        className="whitespace-nowrap font-heading font-extrabold uppercase leading-tight tracking-tighter"
        style={{ fontSize }}
      >
        <span aria-hidden="true">
          <span className="text-foreground tc-text-glow-neutral">
            {displayText}
          </span>
          <span className="ml-0.5 inline-block animate-pulse text-highlight tc-text-glow-warm motion-reduce:animate-none">
            ▍
          </span>
        </span>
        <span className="sr-only">{PHRASES.join(". ")}</span>
      </h1>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 whitespace-nowrap font-heading font-extrabold uppercase tracking-tighter opacity-0"
      />
    </div>
  );
}
