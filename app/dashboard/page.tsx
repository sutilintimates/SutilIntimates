'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { TaxIdDialog } from '@/components/tax-id-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Wallet, Eye, MessageCircle, Pause, Play, Trash2, Edit3,
  AlertTriangle, DollarSign, BarChart3, Flame, Upload, X,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  formatCurrency, formatRelativeTime, getRechargePackages, getCostPerClick,
  getBoostCost, BOOST_DURATION_DAYS, PRICING, getCategoryFromPrice,
} from '@/lib/constants';
import { getProfileMediaUrl, prepareImageForUpload } from '@/lib/media';
import { getRpcRow } from '@/lib/utils';
import type { DashboardStats, BoostResult } from '@/lib/types';

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: 'Ativo', class: 'bg-success/90 text-white' },
  paused: { label: 'Pausado', class: 'bg-warning/90 text-white' },
  exhausted: { label: 'Sem créditos', class: 'bg-destructive/90 text-white' },
};

export default function DashboardPage() {
  const { session, profile, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<{ pixQrCode: string | null; pixCopyPaste: string | null; invoiceUrl: string | null } | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [boostLoading, setBoostLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [hasTaxId, setHasTaxId] = useState<boolean | null>(null);
  const [showTaxIdDialog, setShowTaxIdDialog] = useState(false);
  const [pendingRechargeAmount, setPendingRechargeAmount] = useState(0);

  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const editCoverInputRef = useRef<HTMLInputElement>(null);
  const editMediaInputRef = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(async () => {
    if (!session) return;
    setLoadingStats(true);
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    if (error) {
      console.error('Stats error:', error);
    } else {
      setStats(getRpcRow(data as unknown as DashboardStats | DashboardStats[]));
    }
    const { data: taxIdData, error: taxIdError } = await supabase.rpc('has_cpf_cnpj');
    if (!taxIdError) setHasTaxId(taxIdData === true);
    setLoadingStats(false);
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (profile?.is_admin) {
      router.push('/admin');
      return;
    }
    if (session && !profile) {
      router.push('/profile-setup');
      return;
    }
    loadStats();
  }, [authLoading, session, profile, router, loadStats]);

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
      setEditDesc(profile.description);
      setEditPrice(String(profile.price_per_hour));
      setEditCity(profile.city);
      setEditNeighborhood(profile.neighborhood);
      setEditWhatsapp(profile.whatsapp_link);
      setEditCoverUrl(profile.cover_url);
      setEditMediaUrls(profile.media_urls || []);
    }
  }, [profile]);

  if (authLoading || (!session && !authLoading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return null;

  const cpc = stats?.cost_per_click || getCostPerClick(profile.category);
  const isLowBalance = (stats?.credits_balance || 0) < cpc * 2;
  const isExhausted = profile.status === 'exhausted' || stats?.profile_status === 'exhausted';
  const isPaused = profile.status === 'paused' || stats?.profile_status === 'paused';
  const hasActiveBoost = !!stats?.boost_expires_at;
  const boostCost = getBoostCost(cpc);

  const handleTogglePause = async () => {
    setActionLoading(true);
    const { data, error } = await supabase.rpc('toggle_profile_pause');
    if (error) {
      toast.error('Erro ao alterar status do perfil.');
    } else {
      const result = getRpcRow(data as unknown as { success: boolean; new_status: string } | Array<{ success: boolean; new_status: string }>);
      if (result?.success) {
        toast.success(
          result.new_status === 'paused' ? 'Perfil pausado. Não aparecerá na vitrine.' :
          result.new_status === 'active' ? 'Perfil reativado! Voltou a aparecer na vitrine.' :
          'Perfil sem créditos. Recarregue para reativar.'
        );
        await refreshProfile();
        await loadStats();
      }
    }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    const { data, error } = await supabase.rpc('delete_profile');
    if (error) {
      toast.error('Erro ao excluir conta.');
      setActionLoading(false);
      return;
    }
    const result = getRpcRow(data as unknown as { success: boolean; message: string } | Array<{ success: boolean; message: string }>);
    if (result?.success) {
      toast.success('Conta excluída com sucesso.');
      await supabase.auth.signOut();
      router.push('/');
    }
    setActionLoading(false);
  };

  const handleSaveEdit = async () => {
    if (!session) return;
    setActionLoading(true);
    const price = parseFloat(editPrice) || 0;
    const { error } = await supabase.from('profiles').update({
      name: editName.trim(),
      description: editDesc.trim(),
      price_per_hour: price,
      category: getCategoryFromPrice(price),
      city: editCity.trim(),
      neighborhood: editNeighborhood.trim(),
      whatsapp_link: editWhatsapp.trim(),
      cover_url: editCoverUrl,
      media_urls: editMediaUrls,
    }).eq('id', session.user.id);

    if (error) {
      toast.error('Erro ao salvar alterações.');
    } else {
      toast.success('Perfil atualizado com sucesso!');
      setShowEditDialog(false);
      await refreshProfile();
      await loadStats();
    }
    setActionLoading(false);
  };

  const handleRecharge = (amount: number) => {
    if (hasTaxId === false) {
      setPendingRechargeAmount(amount);
      setShowTaxIdDialog(true);
      return;
    }
    createCharge(amount);
  };

  const createCharge = async (amount: number) => {
    if (!session) return;
    setSelectedAmount(amount);
    setPaymentLoading(true);
    setShowPaymentDialog(true);
    setPaymentData(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            amount,
            billingType: 'PIX',
            userEmail: session.user.email,
            userName: profile?.name,
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (errBody.code === 'MISSING_CPF_CNPJ') {
          setHasTaxId(false);
          setPendingRechargeAmount(amount);
          setShowPaymentDialog(false);
          setShowTaxIdDialog(true);
          setPaymentLoading(false);
          return;
        }
        toast.error(errBody.error || 'Não foi possível gerar o pagamento. Tente novamente.');
        setShowPaymentDialog(false);
        setPaymentLoading(false);
        return;
      }

      const data = await response.json();
      setPaymentData({
        pixQrCode: data.pixQrCode || null,
        pixCopyPaste: data.pixCopyPaste || null,
        invoiceUrl: data.invoiceUrl || null,
      });
    } catch {
      toast.error('Não foi possível gerar o pagamento. Tente novamente.');
      setShowPaymentDialog(false);
    }
    setPaymentLoading(false);
  };

  const handleTaxIdSaved = async () => {
    setShowTaxIdDialog(false);
    setHasTaxId(true);
    if (pendingRechargeAmount > 0) await createCharge(pendingRechargeAmount);
  };

  const goToWallet = () => {
    setActiveTab('wallet');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBoostClick = () => {
    if ((stats?.credits_balance || 0) < boostCost) {
      toast.error('Créditos insuficientes', {
        description: `Você precisa de ${formatCurrency(boostCost)} para ativar o Destaque. Recarregue seus créditos na Carteira.`,
      });
      goToWallet();
      return;
    }
    handleActivateBoost();
  };

  const handleActivateBoost = async () => {
    setBoostLoading(true);
    const { data, error } = await supabase.rpc('activate_boost');
    if (error) {
      toast.error('Erro ao ativar destaque.');
    } else {
      const result = getRpcRow(data as unknown as BoostResult | BoostResult[]);
      if (result?.success) {
        toast.success(`Destaque ativado! Válido até ${new Date(result.boost_expires).toLocaleDateString('pt-BR')}.`);
        await refreshProfile();
        await loadStats();
      } else {
        toast.error(result?.message || 'Não foi possível ativar o destaque.');
      }
    }
    setBoostLoading(false);
  };

  const uploadEditCover = async (file: File) => {
    if (!session) return;
    setPhotoUploading(true);
    try {
      const preparedFile = await prepareImageForUpload(file);
      const path = `${session.user.id}/cover-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profile-media').upload(path, preparedFile, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      setEditCoverUrl(getProfileMediaUrl(path));
    } catch {
      toast.error('Não foi possível ler esta foto. Escolha uma imagem JPG, PNG ou WebP.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const uploadEditMedia = async (file: File) => {
    if (!session) return;
    if (editMediaUrls.length >= 5) {
      toast.error('Você pode ter no máximo 5 fotos adicionais.');
      return;
    }
    setPhotoUploading(true);
    try {
      const preparedFile = await prepareImageForUpload(file);
      const path = `${session.user.id}/media-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profile-media').upload(path, preparedFile, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      setEditMediaUrls([...editMediaUrls, getProfileMediaUrl(path)]);
    } catch {
      toast.error('Não foi possível ler esta foto. Escolha uma imagem JPG, PNG ou WebP.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const removeEditMedia = (url: string) => {
    setEditMediaUrls(editMediaUrls.filter((u) => u !== url));
  };

  const rechargePackages = getRechargePackages(cpc).slice(2);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meu Painel</h1>
          <p className="text-sm text-muted-foreground">Bem-vinda, {profile.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusConfig[profile.status]?.class || statusConfig.active.class}>
            {statusConfig[profile.status]?.label || 'Ativo'}
          </Badge>
          {hasActiveBoost && (
            <Badge className="bg-gradient-to-r from-amber-600 to-primary text-white">
              <Flame className="mr-1 h-3 w-3" />
              Destaque ativo
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit3 className="mr-1.5 h-4 w-4" />
            Editar perfil
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="wallet">Carteira</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-primary">Bônus de boas-vindas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Você ganhou de cortesia o direito a um clique bônus de contato de cliente! Ele equivale a {formatCurrency(cpc)} em créditos.
            </p>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<Wallet className="h-5 w-5" />}
              label="Saldo atual"
              value={formatCurrency(stats?.credits_balance || 0)}
              highlight={isLowBalance}
            />
            <StatCard
              icon={<MessageCircle className="h-5 w-5" />}
              label="Cliques de contato"
              value={String(stats?.total_contact_clicks || 0)}
            />
            <StatCard
              icon={<Eye className="h-5 w-5" />}
              label="Visualizações"
              value={String(stats?.total_profile_views || 0)}
            />
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Total gasto"
              value={formatCurrency(stats?.total_spent || 0)}
            />
          </div>

          {/* Boost banner */}
          {hasActiveBoost ? (
            <div className="flex items-center gap-3 rounded-xl border border-amber-600/30 bg-gradient-to-r from-amber-600/10 to-primary/10 p-4">
              <Flame className="h-6 w-6 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Destaque ativo</p>
                <p className="text-xs text-muted-foreground">
                  Seu perfil está em destaque no feed até {stats?.boost_expires_at ? new Date(stats.boost_expires_at).toLocaleDateString('pt-BR') : ''}.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <Flame className="h-6 w-6 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Impulsionamento Destaque</p>
                <p className="text-xs text-muted-foreground">
                  Apareça no topo do feed por {BOOST_DURATION_DAYS} dias. Custo: {formatCurrency(boostCost)} (8 cliques) debitado do seu saldo.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-600 to-primary text-white hover:opacity-90"
                onClick={handleBoostClick}
                disabled={boostLoading}
              >
                {boostLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ativar
              </Button>
            </div>
          )}

          {/* Low balance alert */}
          {isLowBalance && !isExhausted && (
            <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-foreground">Saldo baixo!</p>
                <p className="text-xs text-muted-foreground">
                  Você tem saldo para menos de 2 cliques. Recarregue para não ficar indisponível.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={goToWallet}>
                Recarregar
              </Button>
            </div>
          )}

          {/* Exhausted alert */}
          {isExhausted && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Perfil sem créditos</p>
                <p className="text-xs text-muted-foreground">
                  Seu perfil não está aparecendo na vitrine. Recarregue para voltar ao ar.
                </p>
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={goToWallet}>
                Recarregar agora
              </Button>
            </div>
          )}

          {/* Spending chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Gastos nos últimos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.daily_spending && stats.daily_spending.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.daily_spending}>
                    <defs>
                      <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="rgb(244 63 94)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="rgb(244 63 94)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="spent"
                      stroke="rgb(244 63 94)"
                      fill="url(#colorSpent)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Sem dados de gastos ainda. Seu perfil começará a receber contatos assim que estiver no ar.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profile info summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Categoria" value={PRICING[profile.category]?.label || 'Standard'} />
              <InfoRow label="Preço por hora" value={`${formatCurrency(profile.price_per_hour)}/hora`} />
              <InfoRow label="Custo por clique" value={formatCurrency(cpc)} />
              <InfoRow label="Localização" value={`${profile.neighborhood}, ${profile.city}`} />
              <InfoRow label="Avaliação média" value={
                profile.rating_average > 0
                  ? `${profile.rating_average.toFixed(1)} (${profile.total_reviews} avaliações)`
                  : 'Sem avaliações'
              } />
            </CardContent>
          </Card>

          {/* Profile controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Controles do perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleTogglePause}
                disabled={actionLoading}
              >
                {isPaused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                {isPaused ? 'Reativar perfil' : 'Pausar perfil temporariamente'}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteDialog(true)}
                disabled={actionLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir conta permanentemente
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet Tab */}
        <TabsContent value="wallet" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Carteira
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Balance display */}
              <div className="rounded-xl bg-gradient-to-br from-primary/10 to-transparent p-6 text-center">
                <p className="text-sm text-muted-foreground">Saldo atual</p>
                <p className="mt-1 text-4xl font-bold">{formatCurrency(stats?.credits_balance || 0)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Aproximadamente {Math.floor((stats?.credits_balance || 0) / cpc)} cliques de contato restantes
                </p>
              </div>

              {/* Recharge options */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Recarregar créditos</h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {getRechargePackages(cpc).map((pkg) => (
                    <Button
                      key={pkg.clicks}
                      variant="outline"
                      className="flex flex-col items-center py-4"
                      onClick={() => handleRecharge(pkg.amount)}
                    >
                      <span className="text-base font-bold">{pkg.clicks}x</span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {formatCurrency(pkg.amount)}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Pagamento via PIX. Créditos adicionados automaticamente após confirmação. Todos os valores são múltiplos exatos do seu custo por clique ({formatCurrency(cpc)}) — sem sobras.
                </p>
              </div>

              {/* Recent transactions */}
              {stats?.recent_transactions && stats.recent_transactions.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Transações recentes</h3>
                  <div className="space-y-2">
                    {stats.recent_transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                        <div>
                          <p className="text-sm font-medium">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-muted-foreground">{formatRelativeTime(tx.created_at)}</p>
                        </div>
                        <Badge variant={tx.status === 'paid' ? 'default' : 'secondary'}>
                          {tx.status === 'paid' ? 'Pago' : 'Pendente'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de atividade</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recent_clicks && stats.recent_clicks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Custo</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent_clicks.map((click) => (
                      <TableRow key={click.id}>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-sm">
                            {click.type === 'contact' ? (
                              <><MessageCircle className="h-3.5 w-3.5 text-primary" /> Contato</>
                            ) : (
                              <><Eye className="h-3.5 w-3.5 text-muted-foreground" /> Visualização</>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {click.cost > 0 ? formatCurrency(click.cost) : 'Gratuito'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(click.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma atividade ainda. Seu perfil começará a receber visualizações e contatos assim que estiver no ar.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir conta permanentemente
            </DialogTitle>
            <DialogDescription>
              <strong className="text-destructive">Atenção:</strong> O encerramento da conta resulta na perda permanente de quaisquer saldos remanescentes em créditos, os quais não são reembolsáveis. Seu perfil e todos os dados serão removidos imediatamente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, excluir minha conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>Atualize as informações do seu anúncio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Cover photo */}
            <div className="space-y-2">
              <Label>Foto de capa</Label>
              <div
                onClick={() => editCoverInputRef.current?.click()}
                className="relative flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                {editCoverUrl ? (
                  <>
                    <img src={getProfileMediaUrl(editCoverUrl)} alt="Capa" className="h-full w-full rounded-xl object-contain" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                      <p className="text-sm text-white">Clique para trocar</p>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto mb-1 h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Enviar foto de capa</p>
                  </div>
                )}
              </div>
              <input
                ref={editCoverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadEditCover(e.target.files[0])}
              />
            </div>

            {/* Additional photos */}
            <div className="space-y-2">
              <Label>Fotos adicionais ({editMediaUrls.length}/5)</Label>
              <div className="flex flex-wrap gap-2">
                {editMediaUrls.map((url) => (
                  <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg">
                    <img src={getProfileMediaUrl(url)} alt="Mídia" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => removeEditMedia(url)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {editMediaUrls.length < 5 && (
                  <div
                    onClick={() => editMediaInputRef.current?.click()}
                    className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50"
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <input
                ref={editMediaInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadEditMedia(e.target.files[0])}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Descrição</Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Preço/hora (R$)</Label>
                <Input id="edit-price" type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-city">Cidade</Label>
                <Input id="edit-city" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-neighborhood">Bairro</Label>
              <Input id="edit-neighborhood" value={editNeighborhood} onChange={(e) => setEditNeighborhood(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp</Label>
              <Input id="edit-whatsapp" value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading || photoUploading}>
              {(actionLoading || photoUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaxIdDialog open={showTaxIdDialog} onOpenChange={setShowTaxIdDialog} onSaved={handleTaxIdSaved} />

      {/* Payment dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento via PIX</DialogTitle>
            <DialogDescription>
              {selectedAmount > 0 && `Recarga de ${formatCurrency(selectedAmount)}`}
            </DialogDescription>
          </DialogHeader>
          {paymentLoading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando pagamento...</p>
            </div>
          ) : paymentData ? (
            <div className="space-y-4">
              {paymentData.pixQrCode && (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={`data:image/png;base64,${paymentData.pixQrCode}`}
                    alt="QR Code PIX"
                    className="h-56 w-56 rounded-lg border border-border"
                  />
                  <p className="text-xs text-muted-foreground">Escaneie o QR code com seu banco</p>
                </div>
              )}
              {paymentData.pixCopyPaste && (
                <div className="space-y-2">
                  <Label>PIX copia e cola</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={paymentData.pixCopyPaste}
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(paymentData.pixCopyPaste!);
                        toast.success('Código PIX copiado!');
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Seus créditos serão adicionados automaticamente após o pagamento ser confirmado.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Falha ao gerar pagamento.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-warning/40 bg-warning/5' : 'border-border/60 bg-card/50'}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 pb-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
