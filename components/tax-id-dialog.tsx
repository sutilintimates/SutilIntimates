'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PrivacyPolicyText } from '@/components/privacy-policy-text';
import { formatTaxId, isValidTaxId, onlyDigits } from '@/lib/cpf';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';

interface TaxIdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function TaxIdDialog({ open, onOpenChange, onSaved }: TaxIdDialogProps) {
  const [view, setView] = useState<'form' | 'privacy'>('form');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setView('form');
      setError(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!isValidTaxId(value)) {
      setError('Informe um CPF ou CNPJ válido, com todos os dígitos.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('save_cpf_cnpj', { p_document: onlyDigits(value) });
    setSaving(false);
    if (rpcError) {
      setError('Não foi possível salvar seu documento. Tente novamente.');
      return;
    }
    toast.success('Documento salvo com segurança.');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        {view === 'form' ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center font-serif text-2xl">Antes da primeira recarga</DialogTitle>
              <DialogDescription className="text-center">
                Para gerar a cobrança Pix, precisamos do CPF ou CNPJ do titular da conta. Solicitamos
                apenas uma vez e ele fica salvo para as próximas recargas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="tax-id">CPF ou CNPJ</Label>
              <Input
                id="tax-id"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={value}
                onChange={(e) => {
                  setValue(formatTaxId(e.target.value));
                  setError(null);
                }}
                aria-invalid={!!error}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              A Sutil se compromete a seguir uma rigorosa{' '}
              <button
                type="button"
                onClick={() => setView('privacy')}
                className="font-medium text-primary underline underline-offset-4 transition-opacity hover:opacity-80"
              >
                política de privacidade
              </button>
              . Seu documento é guardado em total segredo, nunca é exibido a visitantes e é usado somente
              para emitir suas cobranças de recarga.
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !value}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar e continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Política de Privacidade</DialogTitle>
              <DialogDescription>Sutil Intimates — Última atualização: 05/11/2026</DialogDescription>
            </DialogHeader>

            <PrivacyPolicyText />

            <DialogFooter>
              <Button variant="outline" onClick={() => setView('form')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
