"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EsportaPdfButton() {
  return (
    <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" strokeWidth={2.25} />
      Esporta PDF
    </Button>
  );
}
