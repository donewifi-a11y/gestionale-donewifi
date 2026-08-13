import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function ArchivioLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <IntestazionePaginaScheletro conPulsante={false} />
      <ListaScheletro righe={6} />
    </div>
  );
}
