'use client';

import { useState, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, X, MapPin, DollarSign, MessageCircle } from 'lucide-react';
import { getCategoryFromPrice, getCostPerClick, formatCurrency, PRICING } from '@/lib/constants';
import { getProfileMediaUrl, prepareImageForUpload } from '@/lib/media';
import type { ProfileCategory, ContactChannel } from '@/lib/types';
import { normalizeWhatsappUrl } from '@/lib/whatsapp';

export default function ProfileSetupPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [pricePerHour, setPricePerHour] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
  const [paymentIdentifier, setPaymentIdentifier] = useState('');
  const [extraChannels, setExtraChannels] = useState<ContactChannel[]>([]);

  const price = parseFloat(pricePerHour) || 0;
  const category: ProfileCategory = getCategoryFromPrice(price);
  const costPerClick = getCostPerClick(category);

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    router.push('/login');
    return null;
  }

  const uploadCover = async (file: File) => {
    if (!session) return;
    setUploading(true);

    try {
      const preparedFile = await prepareImageForUpload(file);
      const path = `${session.user.id}/cover-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profile-media').upload(path, preparedFile, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      setCoverUrl(getProfileMediaUrl(path));
    } catch {
      toast.error('Não foi possível ler esta foto. Escolha uma imagem JPG, PNG ou WebP.');
    } finally {
      setUploading(false);
    }
  };

  const uploadMedia = async (file: File) => {
    if (!session) return;
    if (mediaUrls.length >= 5) {
      toast.error('Você pode enviar no máximo 5 fotos adicionais.');
      return;
    }
    setUploading(true);

    try {
      const preparedFile = await prepareImageForUpload(file);
      const path = `${session.user.id}/media-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profile-media').upload(path, preparedFile, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      setMediaUrls([...mediaUrls, getProfileMediaUrl(path)]);
    } catch {
      toast.error('Não foi possível ler esta foto. Escolha uma imagem JPG, PNG ou WebP.');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = (url: string) => {
    setMediaUrls(mediaUrls.filter((u) => u !== url));
  };

  const handleAddChannel = () => {
    setExtraChannels([...extraChannels, { type: 'telegram', label: '', url: '' }]);
  };

  const updateChannel = (idx: number, field: keyof ContactChannel, value: string) => {
    const updated = [...extraChannels];
    updated[idx] = { ...updated[idx], [field]: value };
    setExtraChannels(updated);
  };

  const removeChannel = (idx: number) => {
    setExtraChannels(extraChannels.filter((_, i) => i !== idx));
  };

  const canProceedStep1 = name.trim() && description.trim();
  const canProceedStep2 = coverUrl && city.trim() && neighborhood.trim();
  const whatsappUrl = normalizeWhatsappUrl(whatsappLink);
  const canSubmit = whatsappUrl !== null && price > 0;

  const handleSubmit = async () => {
    if (!session || !whatsappUrl) return;
    setSaving(true);

    const validChannels = extraChannels.filter((c) => c.url.trim() && c.label.trim());

    const { error } = await supabase.from('profiles').insert({
      id: session.user.id,
      name: name.trim(),
      description: description.trim(),
      cover_url: coverUrl,
      media_urls: mediaUrls,
      price_per_hour: price,
      category,
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      whatsapp_link: whatsappUrl,
      contact_channels: validChannels,
      payment_identifier: paymentIdentifier.trim(),
    });

    if (error) {
      toast.error('Erro ao salvar perfil. Tente novamente.');
      setSaving(false);
      return;
    }

    setSavedSuccess(true);

    try {
      await supabase.rpc('claim_free_welcome_credit');
    } catch {
      // Non-blocking — credit is best-effort
    }

    toast.success('Perfil publicado! Você ganhou 1 clique grátis. Entre novamente para acessar seu painel.');
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.push('/login?msg=profile_created');
    }, 1800);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Monte seu perfil</h1>
        <p className="mt-2 text-muted-foreground">Passo {step} de 3 — leva menos de 5 minutos</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all ${
              s <= step ? 'w-8 bg-primary' : 'w-8 bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Sobre você</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome ou apelido</Label>
              <Input
                id="name"
                placeholder="Como quer ser conhecida"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Descrição</Label>
              <Textarea
                id="desc"
                placeholder="Conte sobre seu atendimento, horários, diferenciais e o que oferece. Seja clara e objetiva para atrair os contatos certos."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">{description.length}/500 caracteres</p>
            </div>
          </CardContent>
          <div className="flex justify-end p-6">
            <Button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Próximo
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Photos + Location + Price */}
      {step === 2 && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Fotos e localização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cover photo */}
            <div className="space-y-2">
              <Label>Foto de capa</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                {coverUrl ? (
                  <>
                    <img
                      src={getProfileMediaUrl(coverUrl)}
                      alt="Capa"
                      className="h-full w-full rounded-xl object-contain"
                      onError={() => toast.error('A foto não pôde ser carregada. Tente enviar novamente.')}
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                      <p className="text-sm text-white">Clique para trocar</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Clique para enviar foto de capa</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
              />
            </div>

            {/* Additional media */}
            <div className="space-y-2">
              <Label>Fotos adicionais (até 5)</Label>
              <div className="flex flex-wrap gap-3">
                {mediaUrls.map((url) => (
                  <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg">
                    <img
                      src={getProfileMediaUrl(url)}
                      alt="Mídia"
                      className="h-full w-full object-cover"
                      onError={() => toast.error('Uma das fotos não pôde ser carregada.')}
                    />
                    <button
                      onClick={() => removeMedia(url)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {mediaUrls.length < 5 && (
                  <div
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0])}
              />
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="city"
                    placeholder="São Paulo"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  placeholder="Pinheiros"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Preço por hora (R$)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="price"
                  type="number"
                  placeholder="300"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                  className="pl-9"
                />
              </div>
              {price > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <Badge
                    className={
                      category === 'vip' ? 'bg-amber-500/90 text-white' :
                      category === 'mid' ? 'bg-sky-500/90 text-white' :
                      'bg-slate-500/90 text-white'
                    }
                  >
                    Categoria {PRICING[category].label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Custo por clique de contato: {formatCurrency(costPerClick)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
          <div className="flex justify-between p-6">
            <Button variant="outline" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2 || uploading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Próximo
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Contact */}
      {step === 3 && (
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* WhatsApp */}
            <div className="space-y-2">
              <Label htmlFor="whatsapp">Link do WhatsApp</Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="whatsapp"
                  placeholder="https://wa.me/5511999999999 ou https://api.whatsapp.com/send?phone=..."
                  value={whatsappLink}
                  onChange={(e) => setWhatsappLink(e.target.value)}
                  className="pl-9"
                />
              </div>
              {whatsappLink.trim() && !whatsappUrl ? (
                <p className="text-xs text-destructive">Use um link wa.me ou api.whatsapp.com, ou o número com DDI 55 e DDD.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Aceita links wa.me e api.whatsapp.com, ou o número com DDI 55 e DDD.</p>
              )}
            </div>

            {/* Extra channels */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Canais alternativos (opcional)</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddChannel}>
                  Adicionar
                </Button>
              </div>
              {extraChannels.map((ch, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={ch.type}
                    onChange={(e) => updateChannel(idx, 'type', e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="telegram">Telegram</option>
                    <option value="phone">Telefone</option>
                    <option value="whatsapp">WhatsApp Extra</option>
                  </select>
                  <Input
                    placeholder="Nome do canal"
                    value={ch.label}
                    onChange={(e) => updateChannel(idx, 'label', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Link ou número"
                    value={ch.url}
                    onChange={(e) => updateChannel(idx, 'url', e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeChannel(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Payment identifier */}
            <div className="space-y-2">
              <Label htmlFor="payment">Chave PIX para repasses (opcional)</Label>
              <Input
                id="payment"
                placeholder="email, telefone, CPF ou chave aleatória"
                value={paymentIdentifier}
                onChange={(e) => setPaymentIdentifier(e.target.value)}
              />
            </div>

            {/* Info about how it works */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="font-semibold text-sm">Como funciona a Sutil Intimates</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Após salvar, seu perfil começa sem saldo. Recarregue com qualquer valor múltiplo do seu custo por clique ({formatCurrency(costPerClick)}) para ficar visível na vitrine. Você também pode ativar o <strong>Destaque</strong> para aparecer no topo do feed por 10 dias.
              </p>
            </div>
          </CardContent>
          <div className="flex justify-between p-6">
            <Button variant="outline" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || saving || uploading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar e publicar perfil
            </Button>
          </div>
        </Card>
      )}

      {/* Success overlay during redirect */}
      {savedSuccess && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <h2 className="text-xl font-bold">Perfil publicado!</h2>
            <p className="text-sm text-muted-foreground">Levando você ao painel...</p>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}
