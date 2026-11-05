"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page-section restricted">
      <h1>Algo não carregou como esperado.</h1>
      <p>
        Tente novamente. Se o problema continuar, volte ao acervo em alguns
        instantes.
      </p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
