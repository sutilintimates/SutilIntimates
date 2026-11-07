'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const STORAGE_KEY = 'sutil_age_verified';

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setVerified(true);
    setMounted(true);
  }, []);

  const handleConfirm = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVerified(true);
  };

  const handleDeny = () => {
    window.location.href = 'https://www.google.com';
  };

  if (!mounted) return null;

  if (verified) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 max-w-md animate-scale-in rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-2 text-3xl font-serif font-semibold tracking-wide">
          Sutil <span className="text-primary">Intimates</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Este site contém conteúdo destinado a maiores de 18 anos. Ao continuar, você confirma ter pelo menos 18 anos de idade e concorda com os termos da plataforma.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleConfirm} size="lg" className="w-full">
            Sim, tenho 18 anos ou mais
          </Button>
          <Button onClick={handleDeny} variant="outline" size="lg" className="w-full">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Não, sou menor de idade
          </Button>
        </div>
      </div>
    </div>
  );
}
