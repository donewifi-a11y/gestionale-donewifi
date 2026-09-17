"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/**
 * ★ NUOVA (2026-09-17, richiesta esplicita: "l'apertura al centro dello
 * schermo interrompe il flusso di lavoro... un Drawer laterale a scorrimento
 * da destra... lasciando intravedere lo sfondo della Kanban") — stesso
 * primitive Radix di components/ui/dialog.tsx (stessa gestione di focus,
 * Escape, portale), overlay più trasparente e contenuto ancorato a destra
 * invece che centrato: la bacheca resta visibile (anche se non cliccabile,
 * come un Dialog) invece di sparire dietro un velo scuro a piena pagina.
 * Sostituisce, in tutto il gestionale, i Dialog usati per il DETTAGLIO di un
 * record (Ticket, Segnalazione, Cliente, Persona, Utente, Materiale...) —
 * i piccoli dialog di conferma/azione rapida (elimina, invia email, OTP)
 * restano Dialog centrali, dove un pannello laterale largo non avrebbe senso.
 */
function Drawer({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="drawer-overlay"
      // ★ più trasparente del velo del Dialog centrale (bg-black/10 lì) —
      // qui l'overlay copre anche la porzione di schermo a sinistra del
      // pannello, che deve restare leggibile come sfondo, non solo intuibile.
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/5 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DialogPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          // ★ ancorato a destra, altezza piena — sm:w-[56%] copre il
          // "50-60% dello schermo" richiesto su desktop; sotto i 640px
          // (mobile, dove il 56% sarebbe troppo stretto per leggere)
          // occupa quasi tutta la larghezza, come un Dialog vi farebbe
          // comunque. min/max-width tengono il pannello leggibile sia su
          // uno schermo piccolo sia su un monitor molto largo.
          "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col overflow-hidden bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none duration-200 sm:w-[56%] sm:min-w-[420px] sm:max-w-[720px] data-open:animate-in data-open:slide-in-from-right data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-right data-closed:fade-out-0",
          className
        )}
        {...props}
        // ★ stesso principio già in uso nel Dialog centrale (vedi
        // dialog.tsx): un click sullo sfondo visibile a sinistra del
        // pannello (o un Esc premuto per sbaglio a metà di un form) non
        // deve chiudere nulla e perdere dati inseriti — solo la X in alto
        // a destra, o un'azione esplicita del componente.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">{children}</div>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="drawer-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2 z-20"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-2 pb-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="drawer-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}
