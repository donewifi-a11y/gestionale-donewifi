/**
 * Checklist delle variabili d'ambiente critiche, letta dalla pagina
 * `/sistema` (riservata admin) — pensata per far notare in un colpo
 * d'occhio una variabile mancante o palesemente malformata, invece di
 * scoprirlo solo quando una funzionalità smette silenziosamente di
 * funzionare (vedi CRON_SECRET incollato nel campo "Note" invece che
 * "Value" su Vercel, mai fatto notare da nessuna parte finché non è stato
 * cercato a mano). Solo booleani/formato — i valori veri non vengono mai
 * esposti da qui.
 */
export interface VoceEnv {
  chiave: string;
  presente: boolean;
  formatoValido: boolean | null; // null = nessun controllo di formato applicabile
  nota: string;
}

function controlla(chiave: string, validatore?: (v: string) => boolean, nota = ""): VoceEnv {
  const valore = process.env[chiave];
  const presente = !!valore && valore.trim() !== "";
  return {
    chiave,
    presente,
    formatoValido: presente && validatore ? validatore(valore!.trim()) : null,
    nota,
  };
}

const esadecimaleLungo = (v: string) => /^[a-f0-9]{32,}$/i.test(v);
const chiaveSupabase = (v: string) => v.startsWith("eyJ");
const chiavePrivataGoogle = (v: string) => v.includes("PRIVATE KEY") || v.includes("BEGIN");

export function checklistEnv(): { gruppo: string; voci: VoceEnv[] }[] {
  return [
    {
      gruppo: "Supabase",
      voci: [
        controlla("NEXT_PUBLIC_SUPABASE_URL"),
        controlla("NEXT_PUBLIC_SUPABASE_ANON_KEY", chiaveSupabase),
        controlla("SUPABASE_SERVICE_ROLE_KEY", chiaveSupabase, "Bypassa la RLS — usata dal modulo pubblico Richiesta Dati e da tutte le azioni admin."),
      ],
    },
    {
      gruppo: "Cron (/api/cron/*)",
      voci: [
        controlla("CRON_SECRET", esadecimaleLungo, "Senza questa, le rotte cron sono disabilitate in produzione (per sicurezza) invece che aperte a chiunque."),
      ],
    },
    {
      gruppo: "Email (SMTP — 3 caselle di reparto)",
      voci: [
        controlla("SMTP_USER_COMMERCIALE"),
        controlla("SMTP_PASS_COMMERCIALE"),
        controlla("SMTP_USER_ANALISI_RETE"),
        controlla("SMTP_PASS_ANALISI_RETE"),
        controlla("SMTP_USER_FATTURAZIONE"),
        controlla("SMTP_PASS_FATTURAZIONE"),
      ],
    },
    {
      gruppo: "Telegram",
      voci: [controlla("TELEGRAM_BOT_TOKEN", (v) => /^\d+:[\w-]+$/.test(v))],
    },
    {
      gruppo: "Google Calendar",
      voci: [
        controlla("GOOGLE_SERVICE_ACCOUNT_EMAIL", (v) => v.includes("@") && v.includes(".iam.gserviceaccount.com")),
        controlla("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", chiavePrivataGoogle),
        controlla("GOOGLE_CALENDAR_ID"),
      ],
    },
    {
      gruppo: "Anagrafica Clienti (ponte Aruba)",
      voci: [controlla("ARUBA_BRIDGE_URL"), controlla("ARUBA_BRIDGE_SECRET")],
    },
  ];
}
