import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center">
            <span className="text-lg font-serif font-semibold tracking-wide">
              Sutil <span className="text-primary">Intimates</span>
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              Acompanhantes
            </Link>
            <Link href="/advertise" className="transition-colors hover:text-foreground">
              Quero Anunciar
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Entrar
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Sutil Intimates. Plataforma +18.
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Plataforma de publicidade para profissionais independentes do acompanhamento, maiores de 18 anos. Não somos agência — conectamos profissionais a interessados. Todo conteúdo é de responsabilidade dos anunciantes.
        </p>
      </div>
    </footer>
  );
}
