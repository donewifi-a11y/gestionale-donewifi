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
      disabled={inCorso}
      onClick={() =>
        startTransition(async () => {
          await logoutTecnicoEsterno();
          router.push("/pose/login");
          router.refresh();
        })
      }
      className="h-11 w-11 p-0"
    >
      <LogOut className="h-5 w-5" strokeWidth={2.25} />
    </Button>
  );
}
