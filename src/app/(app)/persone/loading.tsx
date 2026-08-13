import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function PersoneLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <IntestazionePaginaScheletro conPulsante={false} />
      <ListaScheletro righe={5} />
    </div>
  );
}
