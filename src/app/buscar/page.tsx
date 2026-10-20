import { GooglePlacesConnector } from "@/lib/connectors/google-places";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

export default function Buscar() {
  const st = new GooglePlacesConnector().status();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Buscar clientes</h1>
        <p className="text-sm text-muted">Cada resultado se compara con tus clientes y prospectos antes de guardarse.</p>
      </header>
      <SearchForm googleReady={st.state === "connected"} howTo={st.state === "not_configured" ? st.howTo : undefined} />
    </div>
  );
}
