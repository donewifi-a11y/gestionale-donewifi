import { IntestazionePaginaScheletro, BachecaScheletro } from "@/components/ui/page-skeletons";

export default function LavorazioniLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <IntestazionePaginaScheletro />
      <BachecaScheletro colonne={3} carte={2} />
    </div>
  );
}
