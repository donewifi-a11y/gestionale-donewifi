// ★ Stessi algoritmi di validazione già in uso nel vecchio gestionale
// (checksum ufficiali, non solo un controllo di formato): evita pratiche
// da correggere a mano dopo l'invio. Funzioni pure, usabili sia lato
// client (feedback immediato) sia lato server (route pubblica).

export interface EsitoValidazione {
  valido: boolean;
  messaggio: string;
}

export function validaCodiceFiscale(valore: string): EsitoValidazione {
  const cf = valore.trim().toUpperCase();
  if (!cf) return { valido: false, messaggio: "Codice fiscale mancante." };
  if (!/^[A-Z0-9]{16}$/.test(cf)) {
    return { valido: false, messaggio: "Il codice fiscale deve essere di 16 caratteri alfanumerici." };
  }

  const dispari: Record<string, number> = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
    K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
    U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
  };
  const pari: Record<string, number> = {
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
    K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
    U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
  };
  const restoALettera = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const corpo = cf.slice(0, 15);
  const fornito = cf.charAt(15);
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const ch = corpo.charAt(i);
    somma += i % 2 === 0 ? dispari[ch] : pari[ch];
  }
  const atteso = restoALettera.charAt(somma % 26);
  if (fornito !== atteso) {
    return { valido: false, messaggio: `Carattere di controllo non valido: atteso "${atteso}".` };
  }
  return { valido: true, messaggio: "Codice fiscale valido." };
}

export function validaPartitaIva(valore: string): EsitoValidazione {
  const piva = valore.trim().replace(/\s+/g, "");
  if (!piva) return { valido: false, messaggio: "Partita IVA mancante." };
  if (!/^\d{11}$/.test(piva)) {
    return { valido: false, messaggio: "La partita IVA deve essere composta da 11 cifre numeriche." };
  }
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const cifra = parseInt(piva.charAt(i), 10);
    if (i % 2 === 0) {
      somma += cifra;
    } else {
      const doppio = cifra * 2;
      somma += doppio > 9 ? doppio - 9 : doppio;
    }
  }
  const attesa = (10 - (somma % 10)) % 10;
  const fornita = parseInt(piva.charAt(10), 10);
  if (fornita !== attesa) {
    return { valido: false, messaggio: `Cifra di controllo non valida: attesa ${attesa}.` };
  }
  return { valido: true, messaggio: "Partita IVA valida." };
}

export function validaIban(valore: string): EsitoValidazione {
  const iban = valore.trim().toUpperCase().replace(/\s+/g, "");
  if (!iban) return { valido: false, messaggio: "IBAN mancante." };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) {
    return { valido: false, messaggio: "Formato IBAN non valido (2 lettere paese + 2 cifre + codice conto)." };
  }
  if (iban.startsWith("IT") && iban.length !== 27) {
    return { valido: false, messaggio: `Un IBAN italiano deve essere lungo 27 caratteri (trovati ${iban.length}).` };
  }
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let numerico = "";
  for (const ch of riordinato) {
    numerico += ch >= "0" && ch <= "9" ? ch : (ch.charCodeAt(0) - "A".charCodeAt(0) + 10).toString();
  }
  let resto = 0;
  for (const ch of numerico) {
    resto = (resto * 10 + parseInt(ch, 10)) % 97;
  }
  if (resto !== 1) {
    return { valido: false, messaggio: "Checksum IBAN non valido." };
  }
  return { valido: true, messaggio: "IBAN valido." };
}

const REGEX_EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validaEmail(valore: string): EsitoValidazione {
  const email = valore.trim();
  if (!email) return { valido: false, messaggio: "Email mancante." };
  if (email.length > 254) return { valido: false, messaggio: "L'indirizzo email è troppo lungo." };
  if (!REGEX_EMAIL.test(email)) return { valido: false, messaggio: "Formato email non valido." };
  return { valido: true, messaggio: "Email valida." };
}
