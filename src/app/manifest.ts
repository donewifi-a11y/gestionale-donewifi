import type { MetadataRoute } from "next";

// ★ NUOVA (2026-09-09, "procedi con tutte" — proposta 1 dell'artifact
// "Notifiche in Azione": pallino sull'icona dell'app) — perché il badge
// sull'icona (Badging API, vedi lib/notifiche-chat.ts) comparisca
// davvero sulla taskbar/dock, il gestionale deve poter essere installato
// come app — questo manifest è quello che i browser leggono per offrire
// "Installa app". Nessun cambiamento per chi lo usa da una scheda
// normale del browser, come oggi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestionale Done Wifi",
    short_name: "Done Wifi",
    description: "Gestionale CRM interno — Done Wifi",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfbfa",
    theme_color: "#CF000A",
    icons: [{ src: "/icon.png", sizes: "310x310", type: "image/png" }],
  };
}
