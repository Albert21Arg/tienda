import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404 · PIEZA NO ENCONTRADA</span>
      <h1>Este camino<br /><i>todavía no existe.</i></h1>
      <Link className="button button-dark" href="/">Volver al inicio</Link>
    </main>
  );
}
