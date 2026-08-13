import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function CalendarioLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <IntestazionePaginaScheletro conPulsante={false} />
      <ListaScheletro righe={5} />
    </div>
  );
}
