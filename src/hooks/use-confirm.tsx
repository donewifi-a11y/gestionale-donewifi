"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OpzioniConferma = {
  titolo: string;
  descrizione?: string;
  testoConferma?: string;
  distruttivo?: boolean;
};

/**
 * ★ NUOVA (2026-09-18, audit — backlog "prompt()/confirm() nativi del browser")
 * — sostituisce window.confirm(), che su mobile appare come un popup di
 * sistema fuori dal controllo grafico dell'app (stile inconsistente, testo
 * troncato su schermi piccoli) e blocca l'intero thread JS. Uso: const { confirm,
 * ConfirmDialog } = useConfirm(); ... if (!(await confirm({ titolo, descrizione })))
 * return; — e renderizzare <ConfirmDialog /> una volta nel componente.
 */
export function useConfirm() {
  const [opzioni, setOpzioni] = useState<OpzioniConferma | null>(null);
  const risolviRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opzioni: OpzioniConferma) => {
    return new Promise<boolean>((resolve) => {
      risolviRef.current = resolve;
      setOpzioni(opzioni);
    });
  }, []);

  function chiudi(esito: boolean) {
    risolviRef.current?.(esito);
    risolviRef.current = null;
    setOpzioni(null);
  }

  function ConfirmDialog() {
    return (
      <Dialog open={opzioni !== null} onOpenChange={(aperto) => !aperto && chiudi(false)}>
        {opzioni && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{opzioni.titolo}</DialogTitle>
              {opzioni.descrizione && <DialogDescription>{opzioni.descrizione}</DialogDescription>}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => chiudi(false)}>
                Annulla
              </Button>
              <Button variant={opzioni.distruttivo ? "destructive" : "default"} onClick={() => chiudi(true)}>
                {opzioni.testoConferma ?? "Conferma"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    );
  }

  return { confirm, ConfirmDialog };
}
