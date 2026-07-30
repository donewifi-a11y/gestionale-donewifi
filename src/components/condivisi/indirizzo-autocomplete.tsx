"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

// ★ ex componente IndirizzoAutocomplete.html — qui su OpenStreetMap/
// Nominatim invece di Google Places: nessuna chiave API da configurare,
// stesso risultato pratico (suggerimenti mentre si scrive).
export function IndirizzoAutocomplete({
  id,
  name,
  value,
  onChange,
  className,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [aperto, setAperto] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenitoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuori(e: MouseEvent) {
      if (contenitoreRef.current && !contenitoreRef.current.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener("mousedown", onClickFuori);
    return () => document.removeEventListener("mousedown", onClickFuori);
  }, []);

  function onInput(v: string) {
    onChange(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (v.trim().length < 4) {
      setSuggerimenti([]);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      try {
        const risposta = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=it&addressdetails=0&limit=5&q=${encodeURIComponent(v)}`
        );
        const dati = await risposta.json();
        setSuggerimenti((dati as { display_name: string }[]).map((d) => d.display_name));
        setAperto(true);
      } catch {
        setSuggerimenti([]);
      }
    }, 400);
  }

  return (
    <div ref={contenitoreRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => suggerimenti.length > 0 && setAperto(true)}
        autoComplete="off"
        className={className}
      />
      {aperto && suggerimenti.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
          {suggerimenti.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(s);
                setAperto(false);
                setSuggerimenti([]);
              }}
              className="block w-full border-t px-3 py-2 text-left text-xs transition first:border-t-0 hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
