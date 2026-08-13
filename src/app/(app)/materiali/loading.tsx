import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function MaterialiLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <IntestazionePaginaScheletro conPulsante={false} />
      <ListaScheletro righe={7} />
    </div>
  );
}
