import { IntestazionePaginaScheletro, BachecaScheletro } from "@/components/ui/page-skeletons";

export default function SegnalazioniLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <IntestazionePaginaScheletro />
      <BachecaScheletro colonne={4} carte={3} />
    </div>
  );
}
