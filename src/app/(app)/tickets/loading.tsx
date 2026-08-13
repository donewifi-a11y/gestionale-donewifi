import { IntestazionePaginaScheletro, BachecaScheletro } from "@/components/ui/page-skeletons";

export default function TicketsLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <IntestazionePaginaScheletro />
      <BachecaScheletro colonne={3} carte={3} />
    </div>
  );
}
