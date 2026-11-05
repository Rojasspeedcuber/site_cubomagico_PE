import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container page-section restricted">
      <p className="eyebrow">404 · Não encontrado</p>
      <h1>Este caminho não leva a uma página.</h1>
      <p>O endereço pode ter mudado ou não existir mais.</p>
      <Link href="/" className="button primary">
        Voltar ao acervo
      </Link>
    </div>
  );
}
