"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export interface DettagliIndirizzo {
  via: string;
  comune: string;
  cap: string;
  testoCompleto: string;
}

interface RisultatoNominatim {
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
  };
}

function estraiDettagli(r: RisultatoNominatim): DettagliIndirizzo {
  const a = r.address || {};
  const via = [a.road, a.house_number].filter(Boolean).join(" ");
  const comune = a.city || a.town || a.village || a.municipality || "";
  return { via: via || r.display_name, comune, cap: a.postcode || "", testoCompleto: r.display_name };
}

// ★ ex componente IndirizzoAutocomplete.html — qui su OpenStreetMap/
// Nominatim invece di Google Places: nessuna chiave API da configurare,
// stesso risultato pratico (suggerimenti mentre si scrive). Con
// `onSeleziona` restituisce anche comune/CAP separati (per i form con
// campi indirizzo strutturati, come Segnalazioni) invece del solo testo.
export function IndirizzoAutocomplete({
  id,
  name,
  value,
  onChange,
  onSeleziona,
  className,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  onSeleziona?: (dettagli: DettagliIndirizzo) => void;
  className?: string;
}) {
  const [suggerimenti, setSuggerimenti] = useState<RisultatoNominatim[]>([]);
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
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=it&addressdetails=1&limit=5&q=${encodeURIComponent(v)}`
        );
        const dati = await risposta.json();
        setSuggerimenti(dati as RisultatoNominatim[]);
        setAperto(true);
      } catch {
        setSuggerimenti([]);
      }
    }, 400);
  }

  function scegli(r: RisultatoNominatim) {
    const dettagli = estraiDettagli(r);
    if (onSeleziona) {
      onSeleziona(dettagli);
    } else {
      onChange(dettagli.testoCompleto);
    }
    setAperto(false);
    setSuggerimenti([]);
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
          {suggerimenti.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scegli(r)}
              className="block w-full border-t px-3 py-2 text-left text-xs transition first:border-t-0 hover:bg-muted"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
