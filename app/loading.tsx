import { Loading } from "@/components/ui";
export default function PageLoading() {
  return (
    <div className="container page-section">
      <Loading label="Carregando página…" />
    </div>
  );
}
