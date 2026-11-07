'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  MousePointerClick,
  Star,
  Wallet,
  ShieldCheck,
  TrendingUp,
  Gift,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { PRICING, formatCurrency } from '@/lib/constants';

const advantages = [
  {
    icon: <MousePointerClick className="h-6 w-6 text-primary" />,
    title: 'Pague só por contatos reais',
    description:
      'Você só é cobrada quando um cliente clica no seu WhatsApp. Visualizações são grátis — você não paga por curiosos, só por quem realmente quer falar com você.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: 'Proteção anti-spam',
    description:
      'Um mesmo visitante só é cobrado uma vez a cada 24 horas. Clicar novamente no seu WhatsApp dentro desse período é gratuito para ele e não gera custo extra para você. Seus créditos só diminuem com demanda real, sem risco de prejuízo por cliques repetidos.',
  },
  {
    icon: <Wallet className="h-6 w-6 text-primary" />, title: 'Custo por clique justo',
    description:
      'O valor do clique depende do seu preço por hora. Quanto maior o seu preço, maior é o valor que o cliente que contacta está disposto a pagar - e mais vale cada clique.',
  },
  {
    icon: <Star className="h-6 w-6 text-primary" />,
    title: 'Feed democrático',
    description:
      'O destaque não é comprado — é conquistado. Perfis com boas avaliações de clientes ganham posições melhores na vitrine automaticamente. Atendimento de qualidade é recompensado.',
  },
  {
    icon: <Gift className="h-6 w-6 text-primary" />,
    title: 'Crédito de boas-vindas grátis',
    description:
      'Ao criar seu perfil, você ganha o equivalente a 1 clique de contato gratuitamente. É o seu primeiro contato com um cliente por nossa conta.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: 'Você no controle',
    description:
      'Pausa, reativa, edita fotos e informações quando quiser. Sem intermediários, sem agência. Você é independente do começo ao fim.',
  },
  {
    icon: <TrendingUp className="h-6 w-6 text-primary" />,
    title: 'Destaque opcional',
    description:
      'Quer aparecer no topo por 10 dias? Ative o Destaque quando quiser, pagando o equivalente a 8 cliques. Você decide o momento certo.',
  },
];

const pricingTiers = [
  {
    label: PRICING.standard.label,
    range: `Até ${formatCurrency(PRICING.standard.maxPrice)}`,
    cpc: PRICING.standard.costPerClick,
    color: 'bg-slate-500/90',
  },
  {
    label: PRICING.mid.label,
    range: `${formatCurrency(PRICING.mid.minPrice)} – ${formatCurrency(PRICING.mid.maxPrice)}`,
    cpc: PRICING.mid.costPerClick,
    color: 'bg-sky-500/90',
  },
  {
    label: PRICING.vip.label,
    range: `${formatCurrency(PRICING.vip.minPrice)}+`,
    cpc: PRICING.vip.costPerClick,
    color: 'bg-amber-500/90',
  },
];

export default function AdvertisePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-wide">
          Anuncie na Sutil <span className="text-primary">Intimates</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          A plataforma que conecta <strong className="font-semibold text-primary">você</strong> a clientes reais.
          Sem mensalidade, sem intermediários. Você só paga quando um cliente entra em contato.
        </p>
        <a
          href="#create-profile"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-transform hover:translate-y-1"
        >
          Criar meu perfil
          <ChevronDown className="h-5 w-5" />
        </a>
      </div>

      {/* Pricing tiers */}
      <div className="mb-12">
        <h2 className="mb-6 text-center text-xl font-semibold">Como funciona o custo por clique</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {pricingTiers.map((tier) => (
            <Card key={tier.label} className="text-center">
              <CardContent className="pt-6">
                <div className={`mx-auto mb-3 w-fit rounded-full ${tier.color} px-4 py-1 text-sm font-bold text-white`}>
                  {tier.label}
                </div>
                <p className="text-sm text-muted-foreground">{tier.range}</p>
                <p className="mt-3 text-2xl font-bold">{formatCurrency(tier.cpc)}</p>
                <p className="text-xs text-muted-foreground">por clique de contato</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          O seu preço por hora determina automaticamente a sua categoria e o custo de cada clique.
        </p>
      </div>

      {/* Advantages grid */}
      <div className="mb-12">
        <h2 className="mb-6 text-center text-xl font-semibold">Vantagens de anunciar com a gente</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {advantages.map((adv) => (
            <Card key={adv.title} className="transition-colors hover:border-primary/30">
              <CardContent className="flex gap-4 pt-6">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    {adv.icon}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold">{adv.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{adv.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How it works steps */}
      <div className="mb-12">
        <h2 className="mb-6 text-center text-xl font-semibold">Como começar</h2>
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          {[
            { step: '1', title: 'Crie sua conta', desc: 'Email e senha. Leva 30 segundos.' },
            { step: '2', title: 'Monte seu perfil', desc: 'Fotos, descrição, preço e contato. Você define tudo.' },
            { step: '3', title: 'Ganhe seu crédito grátis', desc: '1 clique de contato por nossa conta para começar.' },
            { step: '4', title: 'Receba contatos', desc: 'Clientes te chamam direto no WhatsApp.' },
          ].map((item) => (
            <div key={item.step} className="flex-1 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div id="create-profile" className="scroll-mt-24 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
        <h2 className="font-serif text-2xl font-semibold">Pronta para começar?</h2>
        <p className="mt-2 text-muted-foreground">
          Crie seu perfil agora e ganhe seu primeiro crédito de contato gratuitamente.
        </p>
        <Link href="/register" className="mt-6 inline-block">
          <Button size="lg" className="gap-2">
            Criar meu perfil
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Already have account */}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Já tem uma conta?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>

      {/* Privacy policy */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="font-medium text-amber-600/80 hover:text-amber-600 hover:underline">
          Conheça nossa política de privacidade
        </Link>
      </p>
    </div>
  );
}
