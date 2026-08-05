"use client";

import { useState } from "react";
import { MessageCircle, Mail, Copy, Check } from "lucide-react";
import { COLORE_WHATSAPP } from "@/lib/colori-brand";

// ★ stesso pattern già usato per il link "Richiesta Dati" su Segnalazioni —
// estratto qui per essere riusabile anche da Richieste Clienti e Disdetta,
// invece di duplicarlo.
export function InvioLinkCliente({
  url,
  telefono,
  email,
  messaggio,
  oggetto = "Done Wifi",
}: {
  url: string;
  telefono?: string | null;
  email?: string | null;
  messaggio: string;
  oggetto?: string;
}) {
  const [copiato, setCopiato] = useState(false);
  const telefonoIntl = telefono ? "39" + telefono.replace(/\D/g, "").replace(/^0?39/, "").replace(/^0/, "") : "";

  function copiaLink() {
    navigator.clipboard.writeText(url);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 1500);
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-3 rounded-lg bg-muted/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
        &ldquo;{messaggio}&rdquo;
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <a
          href={telefonoIntl ? `https://wa.me/${telefonoIntl}?text=${encodeURIComponent(messaggio)}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!telefonoIntl}
          className={`flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40 ${!telefonoIntl ? "pointer-events-none opacity-40" : ""}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${COLORE_WHATSAPP.badge}`}>
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          WhatsApp
        </a>
        <a
          href={`mailto:${email || ""}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(messaggio)}`}
          className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5b52c9] text-white">
            <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          Email
        </a>
        <button
          onClick={copiaLink}
          className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted-foreground text-background">
            {copiato ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
          </span>
          {copiato ? "Copiato" : "Copia link"}
        </button>
      </div>
    </div>
  );
}
