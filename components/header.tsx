'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Moon, Sun, Menu, LayoutDashboard, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const desktopNavLinks = (
    <>
      <Link
        href="/"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Acompanhantes
      </Link>
      {session && profile && !profile.is_admin && (
        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Meu Painel
        </Link>
      )}
      {session && profile?.is_admin && (
        <Link
          href="/admin"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Administração
        </Link>
      )}
      {!session && (
        <Link
          href="/advertise"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Quero Anunciar
        </Link>
      )}
    </>
  );

  const mobileNavLinks = (
    <>
      <Link
        href="/"
        onClick={() => setOpen(false)}
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Acompanhantes
      </Link>
      {session && profile && !profile.is_admin && (
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Meu Painel
        </Link>
      )}
      {session && profile?.is_admin && (
        <Link
          href="/admin"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Administração
        </Link>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/images/1793646134033.jpg"
              alt=""
              aria-hidden="true"
              className="h-9 w-9 rounded-md object-cover ring-1 ring-primary/30"
            />
            <span className="text-xl font-serif font-semibold tracking-wide">
              Sutil <span className="text-primary">Intimates</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {desktopNavLinks}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Alternar tema"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {session ? (
            <div className="hidden items-center gap-2 sm:flex">
              {profile && !profile.is_admin && (
                <Link href="/dashboard">
                  <Button size="sm" variant="ghost">
                    <LayoutDashboard className="mr-1.5 h-4 w-4" />
                    Painel
                  </Button>
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={handleSignOut}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Sair
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">É acompanhante? Entrar</Link>
              </Button>
              <Link href="/advertise">
                <Button size="sm">
                  Quero Anunciar
                </Button>
              </Link>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="mb-6">
                <span className="text-lg font-serif font-semibold tracking-wide">
                  Sutil <span className="text-primary">Intimates</span>
                </span>
              </SheetTitle>
              <nav className="flex flex-col gap-4" onClick={() => setOpen(false)}>
                {mobileNavLinks}
                {session ? (
                  <Button variant="outline" onClick={handleSignOut} className="mt-4 w-full">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </Button>
                ) : (
                  <div className="mt-4 flex flex-col gap-2">
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/login">É acompanhante? Entrar</Link>
                    </Button>
                    <Link href="/advertise" className="w-full">
                      <Button className="w-full">
                        Quero Anunciar
                      </Button>
                    </Link>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
