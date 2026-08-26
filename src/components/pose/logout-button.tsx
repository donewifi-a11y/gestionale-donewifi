"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutTecnicoEsterno } from "@/app/pose/actions";

export function LogoutTecnicoEsternoButton() {
  const router = useRouter();
  const [inCorso, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={inCorso}
      onClick={() =>
        startTransition(async () => {
          await logoutTecnicoEsterno();
          router.push("/pose/login");
          router.refresh();
        })
      }
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
    </Button>
  );
}
