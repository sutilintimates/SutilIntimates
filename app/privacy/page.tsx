'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PrivacyPolicyText } from '@/components/privacy-policy-text';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-wide">
            Política de Privacidade
          </h1>
          <p className="text-sm text-muted-foreground">Sutil Intimates — Última atualização: 05/11/2026</p>
        </div>
      </div>

      <PrivacyPolicyText />

      <div className="mt-12 border-t border-border/50 pt-6">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>
    </div>
  );
}
