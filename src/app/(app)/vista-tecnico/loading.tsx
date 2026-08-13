import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function VistaTecnicoLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <IntestazionePaginaScheletro conPulsante={false} />
      <ListaScheletro righe={4} />
    </div>
  );
}
