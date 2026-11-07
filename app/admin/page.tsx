'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Users, DollarSign, MessageCircle, Eye, Pause, Play, Search, Settings, Save, Gift, Smartphone, Trash2, AlertTriangle, Webhook, Copy, CheckCircle, XCircle, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/constants';
import { getRpcRow } from '@/lib/utils';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AppConfig {
  cfg_key: string;
  cfg_value: string;
}

interface WebhookEventRow {
  ev_event_id: string;
  ev_event_type: string;
  ev_payment_id: string | null;
  ev_transaction_id: string | null;
  ev_user_id: string | null;
  ev_profile_name: string;
  ev_expected_amount: number | null;
  ev_received_amount: number | null;
  ev_customer_id: string | null;
  ev_external_reference: string | null;
  ev_processing_status: string;
  ev_rejection_reason: string | null;
  ev_received_at: string;
  ev_processed_at: string | null;
}

interface AdminStats {
  total_profiles: number;
  active_profiles: number;
  paused_profiles: number;
  exhausted_profiles: number;
  total_revenue: number;
  total_bonus_credits: number;
  total_paid_contact_clicks: number;
  total_contact_clicks: number;
  total_profile_views: number;
  unique_visitors: number;
  recent_profiles: Array<{
    id: string; name: string; city: string; status: string;
    credits_balance: number; created_at: string;
  }>;
  recent_transactions: Array<{
    id: string; user_id: string; amount: number; status: string;
    created_at: string; profile_name: string; is_bonus: boolean;
  }>;
}

interface AdminProfile {
  pid: string;
  pname: string;
  pcity: string;
  pcategory: string;
  pstatus: string;
  pcredits_balance: number;
  pprice_per_hour: number;
  prating_average: number;
  ptotal_reviews: number;
  ptotal_spent: number;
  ptotal_contact_clicks: number;
  ptotal_views: number;
  pcreated_at: string;
}

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: 'Ativo', class: 'bg-success/90 text-white' },
  paused: { label: 'Pausado', class: 'bg-warning/90 text-white' },
  exhausted: { label: 'Sem créditos', class: 'bg-destructive/90 text-white' },
};

export default function AdminPage() {
  const { session, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [profilesList, setProfilesList] = useState<AdminProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [asaasConfig, setAsaasConfig] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; profile: AdminProfile | null }>({ open: false, profile: null });
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRow[]>([]);
  const [webhookToken, setWebhookToken] = useState('');
  const [newToken, setNewToken] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/asaas-webhook`;

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [statsRes, profilesRes] = await Promise.all([
      supabase.rpc('get_admin_stats'),
      supabase.rpc('get_admin_profiles'),
    ]);

    if (statsRes.data) setStats(getRpcRow(statsRes.data as unknown as AdminStats | AdminStats[]));
    if (profilesRes.data) setProfilesList(profilesRes.data as unknown as AdminProfile[]);

    const { data: configRows } = await supabase.rpc('get_app_config');
    const configMap: Record<string, string> = {};
    for (const row of (configRows as unknown as AppConfig[]) || []) {
      configMap[row.cfg_key] = row.cfg_value;
    }
    setAsaasConfig(configMap);
    setLoadingData(false);
  }, []);

  const loadWebhookData = useCallback(async () => {
    setEventsLoading(true);
    const [tokenRes, eventsRes] = await Promise.all([
      supabase.rpc('get_webhook_token'),
      supabase.rpc('get_webhook_events', { p_limit: 50, p_offset: 0 }),
    ]);
    if (tokenRes.data !== null) setWebhookToken(tokenRes.data as string);
    if (eventsRes.data) setWebhookEvents(eventsRes.data as unknown as WebhookEventRow[]);
    setEventsLoading(false);
  }, []);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copiado para a área de transferência.');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const segments: string[] = [];
    for (let s = 0; s < 4; s++) {
      let seg = '';
      for (let i = 0; i < 12; i++) seg += chars[Math.floor(Math.random() * chars.length)];
      segments.push(seg);
    }
    setNewToken(segments.join('-'));
  };

  const saveWebhookToken = async () => {
    if (!newToken || newToken.length < 32) {
      toast.error('O token deve ter no mínimo 32 caracteres.');
      return;
    }
    setTokenSaving(true);
    const { data, error } = await supabase.rpc('set_webhook_token', { p_token: newToken });
    if (error) {
      toast.error('Erro ao salvar o token.');
    } else {
      const result = getRpcRow(data as unknown as { success: boolean; message: string } | Array<{ success: boolean; message: string }>);
      if (result?.success) {
        toast.success(result.message);
        setWebhookToken(newToken);
        setNewToken('');
      } else {
        toast.error(result?.message || 'Erro ao salvar o token.');
      }
    }
    setTokenSaving(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      router.push('/login');
      return;
    }
    if (!profile?.is_admin) {
      router.push('/dashboard');
      return;
    }
    loadData();
    loadWebhookData();
  }, [authLoading, session, profile, router, loadData, loadWebhookData]);

  const handleToggleProfile = async (profileId: string) => {
    setToggleLoadingId(profileId);
    const { data, error } = await supabase.rpc('admin_toggle_profile', { p_profile_id: profileId });
    if (error) {
      toast.error('Erro ao alterar status do perfil.');
    } else {
      const result = getRpcRow(data as unknown as { success: boolean; new_status: string; message: string } | Array<{ success: boolean; new_status: string; message: string }>);
      if (result?.success) {
        toast.success(result.message);
        await loadData();
      } else {
        toast.error(result?.message || 'Não foi possível alterar o perfil.');
      }
    }
    setToggleLoadingId(null);
  };

  const handleDeleteAccount = async () => {
    if (!deleteDialog.profile) return;
    setDeleteLoadingId(deleteDialog.profile.pid);
    const { data, error } = await supabase.rpc('admin_delete_account', { p_profile_id: deleteDialog.profile.pid });
    if (error) {
      toast.error('Erro ao excluir conta.');
    } else {
      const result = getRpcRow(data as unknown as { success: boolean; message: string } | Array<{ success: boolean; message: string }>);
      if (result?.success) {
        toast.success(result.message);
        await loadData();
      } else {
        toast.error(result?.message || 'Não foi possível excluir a conta.');
      }
    }
    setDeleteLoadingId(null);
    setDeleteDialog({ open: false, profile: null });
  };

  const filteredProfiles = searchQuery.trim()
    ? profilesList.filter((p) =>
        p.pname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.pcity.toLowerCase().includes(searchQuery.toLowerCase()))
    : profilesList;

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile?.is_admin) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Painel Administrativo</h1>
        <p className="text-sm text-muted-foreground">Visão geral da plataforma</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="profiles">Anunciantes</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="asaas">Asaas</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <AdminStatCard icon={<DollarSign className="h-5 w-5" />} label="Receita transferida" value={formatCurrency(stats?.total_revenue || 0)} />
            <AdminStatCard icon={<Gift className="h-5 w-5" />} label="Créditos cortesia" value={formatCurrency(stats?.total_bonus_credits || 0)} />
            <AdminStatCard icon={<MessageCircle className="h-5 w-5" />} label="Cliques pagos" value={String(stats?.total_paid_contact_clicks || 0)} />
            <AdminStatCard icon={<Users className="h-5 w-5" />} label="Total perfis" value={String(stats?.total_profiles || 0)} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <AdminStatCard icon={<Eye className="h-5 w-5" />} label="Visualizações" value={String(stats?.total_profile_views || 0)} />
            <AdminStatCard icon={<Smartphone className="h-5 w-5" />} label="Dispositivos únicos" value={String(stats?.unique_visitors || 0)} />
            <AdminStatCard icon={<MessageCircle className="h-5 w-5" />} label="Total contatos" value={String(stats?.total_contact_clicks || 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status dos perfis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <StatusBox label="Ativos" count={stats?.active_profiles || 0} color="text-success" />
                <StatusBox label="Pausados" count={stats?.paused_profiles || 0} color="text-warning" />
                <StatusBox label="Sem créditos" count={stats?.exhausted_profiles || 0} color="text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anunciantes recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : stats?.recent_profiles && stats.recent_profiles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Saldo</TableHead>
                      <TableHead>Criado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent_profiles.slice(0, 10).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.city}</TableCell>
                        <TableCell>
                          <Badge className={statusConfig[p.status]?.class}>{statusConfig[p.status]?.label}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(p.credits_balance)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatRelativeTime(p.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum anunciante ainda</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transações recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : stats?.recent_transactions && stats.recent_transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anunciante</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent_transactions.slice(0, 10).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.profile_name}</TableCell>
                        <TableCell>{formatCurrency(t.amount)}</TableCell>
                        <TableCell>
                          {t.is_bonus ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">Cortesia</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">PIX</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'paid' ? 'default' : 'secondary'}>
                            {t.status === 'paid' ? 'Pago' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatRelativeTime(t.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma transação ainda</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profiles list with hide/show + delete controls */}
        <TabsContent value="profiles">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Todas as anunciantes</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou cidade..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredProfiles.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Saldo</TableHead>
                        <TableHead>Preço/h</TableHead>
                        <TableHead>Gasto total</TableHead>
                        <TableHead>Contatos</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProfiles.map((p) => (
                        <TableRow key={p.pid}>
                          <TableCell className="font-medium">{p.pname}</TableCell>
                          <TableCell>{p.pcity}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{p.pcategory}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusConfig[p.pstatus]?.class}>
                              {statusConfig[p.pstatus]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatCurrency(p.pcredits_balance)}</TableCell>
                          <TableCell>{formatCurrency(p.pprice_per_hour)}</TableCell>
                          <TableCell>{formatCurrency(p.ptotal_spent)}</TableCell>
                          <TableCell>{p.ptotal_contact_clicks}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={toggleLoadingId === p.pid}
                                onClick={() => handleToggleProfile(p.pid)}
                                className={p.pstatus === 'paused' ? 'text-success' : 'text-warning'}
                              >
                                {toggleLoadingId === p.pid ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : p.pstatus === 'paused' ? (
                                  <Play className="mr-1 h-3.5 w-3.5" />
                                ) : (
                                  <Pause className="mr-1 h-3.5 w-3.5" />
                                )}
                                {p.pstatus === 'paused' ? 'Reativar' : 'Ocultar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteLoadingId === p.pid}
                                onClick={() => setDeleteDialog({ open: true, profile: p })}
                                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                              >
                                {deleteLoadingId === p.pid ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? 'Nenhum perfil encontrado para esta busca' : 'Nenhuma anunciante cadastrada'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings tab — Asaas configuration */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-5 w-5" />
                Configurações do Asaas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Estes dados são usados pelo sistema de pagamentos para gerar cobranças PIX individuais via API. A cada recarga, o sistema cria uma cobrança nova no Asaas com um QR Code e Pix Copia e Cola exclusivos para aquela operação — não é usada uma chave PIX estática compartilhada.
              </p>
              <div className="space-y-2">
                <Label htmlFor="asaas-api-key">Chave da API Asaas</Label>
                <Input
                  id="asaas-api-key"
                  type="password"
                  placeholder="Sua chave de API do Asaas"
                  value={asaasConfig['asaas_api_key'] || ''}
                  onChange={(e) => setAsaasConfig({ ...asaasConfig, asaas_api_key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asaas-api-url">URL da API (ambiente)</Label>
                <Input
                  id="asaas-api-url"
                  placeholder="https://sandbox.asaas.com/api/v3"
                  value={asaasConfig['asaas_api_url'] || ''}
                  onChange={(e) => setAsaasConfig({ ...asaasConfig, asaas_api_url: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Sandbox: https://sandbox.asaas.com/api/v3 — Produção: https://www.asaas.com/api/v3
                </p>
              </div>
              <Button
                onClick={async () => {
                  setConfigLoading(true);
                  const keys = ['asaas_api_key', 'asaas_api_url'];
                  let allOk = true;
                  for (const key of keys) {
                    if (asaasConfig[key] !== undefined) {
                      const { error } = await supabase.rpc('set_app_config', { p_key: key, p_value: asaasConfig[key] || '' });
                      if (error) allOk = false;
                    }
                  }
                  if (allOk) toast.success('Configurações salvas com sucesso!');
                  else toast.error('Erro ao salvar algumas configurações.');
                  setConfigLoading(false);
                }}
                disabled={configLoading}
              >
                {configLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Asaas tab — webhook integration info, token management, event monitoring */}
        <TabsContent value="asaas" className="space-y-6">
          {/* Webhook endpoint info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-5 w-5" />
                Endpoint do Webhook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL pública do webhook</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={WEBHOOK_URL} className="font-mono text-sm" />
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(WEBHOOK_URL, 'url')}>
                    {copiedField === 'url' ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground">Método HTTP</p>
                  <p className="mt-1 font-mono text-sm font-semibold">POST</p>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground">Versão da API</p>
                  <p className="mt-1 font-mono text-sm font-semibold">3</p>
                </div>
                <div className="rounded-lg border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground">Tipo de envio</p>
                  <p className="mt-1 font-mono text-sm font-semibold">SEQUENTIALLY</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auth token management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5" />
                Token de Autenticação do Webhook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Este token deve ser cadastrado no painel do Asaas em &quot;Notificações&quot; &gt; &quot;Webhook&quot;. O Asaas envia este token no cabeçalho <code className="rounded bg-muted px-1 py-0.5 text-xs">asaas-access-token</code> de cada notificação. Não confunda com a chave da API.
              </p>
              {webhookToken ? (
                <div className="space-y-2">
                  <Label>Token atual (copie para cadastrar no Asaas)</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={webhookToken} className="font-mono text-sm" />
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(webhookToken, 'token')}>
                      {copiedField === 'token' ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm text-warning">Nenhum token cadastrado ainda. Gere um novo token abaixo e salve.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Gerar / atualizar token</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Clique em gerar para criar um token aleatório"
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={generateToken}>
                    Gerar
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={saveWebhookToken}
                  disabled={tokenSaving || !newToken}
                >
                  {tokenSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar token
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Events to enable in Asaas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eventos para habilitar no Asaas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">No painel do Asaas, em &quot;Notificações&quot; &gt; &quot;Webhook&quot;, habilite apenas os eventos abaixo:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { event: 'PAYMENT_RECEIVED', desc: 'Pagamento recebido com saldo disponível — libera créditos' },
                  { event: 'PAYMENT_CONFIRMED', desc: 'Pagamento confirmado, saldo ainda não disponível (estado intermediário)' },
                  { event: 'PAYMENT_OVERDUE', desc: 'Cobrança vencida' },
                  { event: 'PAYMENT_DELETED', desc: 'Cobrança removida' },
                  { event: 'PAYMENT_REFUNDED', desc: 'Pagamento estornado totalmente' },
                  { event: 'PAYMENT_PARTIALLY_REFUNDED', desc: 'Pagamento parcialmente estornado' },
                  { event: 'PAYMENT_REFUND_IN_PROGRESS', desc: 'Estorno em processamento' },
                ].map((e) => (
                  <div key={e.event} className="flex items-start gap-2 rounded-lg border border-border/50 p-3">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <div>
                      <p className="font-mono text-sm font-semibold">{e.event}</p>
                      <p className="text-xs text-muted-foreground">{e.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Configuration status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status da Integração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ConfigStatusItem label="Chave da API Asaas" configured={!!asaasConfig['asaas_api_key']} />
                <ConfigStatusItem label="URL da API (ambiente)" configured={!!asaasConfig['asaas_api_url']} />
                <ConfigStatusItem label="Token do webhook" configured={!!webhookToken} />
              </div>
              <div className="rounded-lg border border-border/50 p-4 space-y-2">
                <p className="text-sm font-medium">Backend receptor dos eventos</p>
                <p className="text-sm text-muted-foreground">
                  Os webhooks são recebidos por uma Supabase Edge Function (Deno) em tempo de execução, acessível pela URL pública acima. Nenhum serviço externo intermediário (Cloudflare, ngrok, etc.) é necessário — a Supabase fornece HTTPS e URL estável diretamente.
                </p>
              </div>
              <div className="rounded-lg border border-border/50 p-4 space-y-2">
                <p className="text-sm font-medium">Variáveis que ainda precisam ser configuradas</p>
                <p className="text-sm text-muted-foreground">
                  As credenciais do Asaas (chave da API e URL do ambiente) devem ser definidas na aba &quot;Configurações&quot;. O token do webhook é gerenciado nesta aba.
                </p>
                {!asaasConfig['asaas_api_key'] && (
                  <p className="text-xs text-warning">→ Chave da API Asaas: pendente (aba Configurações)</p>
                )}
                {!asaasConfig['asaas_api_url'] && (
                  <p className="text-xs text-warning">→ URL da API (ambiente): pendente (aba Configurações)</p>
                )}
                {!webhookToken && (
                  <p className="text-xs text-warning">→ Token do webhook: pendente (gere acima)</p>
                )}
              </div>
              <div className="rounded-lg border border-border/50 p-4 space-y-2">
                <p className="text-sm font-medium">Configuração manual no Asaas</p>
                <p className="text-sm text-muted-foreground">
                  Após salvar todas as credenciais, acesse o painel do Asaas e configure:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Vá em &quot;Notificações&quot; &gt; &quot;Webhook&quot;.</li>
                  <li>Insira a URL pública copiada acima.</li>
                  <li>Selecione o método POST e a versão da API 3.</li>
                  <li>Selecione o tipo de envio SEQUENTIALLY.</li>
                  <li>Cole o token de autenticação copiado acima.</li>
                  <li>Habilite os eventos listados acima.</li>
                  <li>Ative o webhook e salve.</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Webhook event monitoring */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Eventos recebidos (monitoramento)</CardTitle>
                <Button size="sm" variant="outline" onClick={loadWebhookData} disabled={eventsLoading}>
                  {eventsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-2">Atualizar</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : webhookEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Anunciante</TableHead>
                        <TableHead>Esperado</TableHead>
                        <TableHead>Recebido</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookEvents.map((ev) => (
                        <TableRow key={ev.ev_event_id}>
                          <TableCell className="font-mono text-xs font-semibold">{ev.ev_event_type}</TableCell>
                          <TableCell className="font-mono text-xs">{ev.ev_payment_id ? ev.ev_payment_id.slice(0, 12) + '…' : '—'}</TableCell>
                          <TableCell className="text-sm">{ev.ev_profile_name || '—'}</TableCell>
                          <TableCell className="text-sm">{ev.ev_expected_amount != null ? formatCurrency(ev.ev_expected_amount) : '—'}</TableCell>
                          <TableCell className="text-sm">{ev.ev_received_amount != null ? formatCurrency(ev.ev_received_amount) : '—'}</TableCell>
                          <TableCell>
                            <EventStatusBadge status={ev.ev_processing_status} />
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-xs text-muted-foreground" title={ev.ev_rejection_reason || ''}>
                            {ev.ev_rejection_reason || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(ev.ev_received_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento recebido ainda</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, profile: open ? deleteDialog.profile : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir conta de anunciante
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente a conta de{' '}
              <strong className="text-foreground">{deleteDialog.profile?.pname}</strong>?
              <br /><br />
              Esta ação removerá todos os dados: perfil, fotos, créditos, transações, cliques e avaliações. O acesso da anunciante será revogado imediatamente. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, profile: null })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteLoadingId !== null}>
              {deleteLoadingId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function StatusBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg border border-border/50 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ConfigStatusItem({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
      {configured ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-warning" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
    processed: { label: 'Processado', class: 'bg-success/90 text-white', icon: <CheckCircle className="mr-1 h-3 w-3" /> },
    ignored: { label: 'Ignorado', class: 'bg-muted text-muted-foreground', icon: <Clock className="mr-1 h-3 w-3" /> },
    rejected: { label: 'Rejeitado', class: 'bg-destructive/90 text-white', icon: <XCircle className="mr-1 h-3 w-3" /> },
    error: { label: 'Erro', class: 'bg-destructive/90 text-white', icon: <AlertTriangle className="mr-1 h-3 w-3" /> },
    persisted: { label: 'Pendente', class: 'bg-warning/90 text-white', icon: <Clock className="mr-1 h-3 w-3" /> },
    pending_retry: { label: 'Reprocessar', class: 'bg-warning/90 text-white', icon: <RefreshCw className="mr-1 h-3 w-3" /> },
  };
  const c = config[status] || { label: status, class: 'bg-muted text-muted-foreground', icon: null };
  return (
    <Badge className={c.class}>
      {c.icon}
      {c.label}
    </Badge>
  );
}
