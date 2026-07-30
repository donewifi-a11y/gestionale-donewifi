"use client";

import { useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Eraser } from "lucide-react";

export interface FirmaPadHandle {
  /** Restituisce un PNG in base64, o stringa vuota se non è stato firmato nulla. */
  ottieniDataUrl: () => string;
}

// ★ Firma cliente su schermo (ex campo firma di Installazione/Lavorazione)
// — un semplice canvas touch/mouse, niente libreria esterna.
export const FirmaPad = forwardRef<FirmaPadHandle>(function FirmaPad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const disegnando = useRef(false);
  const [vuoto, setVuoto] = useState(true);

  useImperativeHandle(ref, () => ({
    ottieniDataUrl: () => {
      if (vuoto || !canvasRef.current) return "";
      return canvasRef.current.toDataURL("image/png");
    },
  }));

  function posizione(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    disegnando.current = true;
    const { x, y } = posizione(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!disegnando.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posizione(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1b2430";
    ctx.lineTo(x, y);
    ctx.stroke();
    setVuoto(false);
  }

  function onPointerUp() {
    disegnando.current = false;
  }

  function pulisci() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVuoto(true);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="w-full touch-none rounded-lg border bg-background"
        style={{ height: 140 }}
      />
      <button
        type="button"
        onClick={pulisci}
        className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Eraser className="h-3.5 w-3.5" strokeWidth={2.25} />
        Cancella firma
      </button>
    </div>
  );
});
