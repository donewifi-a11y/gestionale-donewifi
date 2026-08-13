import { IntestazionePaginaScheletro, ListaScheletro } from "@/components/ui/page-skeletons";

export default function PreventiviLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <IntestazionePaginaScheletro />
      <ListaScheletro righe={6} />
    </div>
  );
}
