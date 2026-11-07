import { ProfileCategory } from './types';

export const PRICING = {
  standard: { costPerClick: 15, label: 'Standard', minPrice: 0, maxPrice: 250 },
  mid: { costPerClick: 25, label: 'Mid', minPrice: 251, maxPrice: 400 },
  vip: { costPerClick: 35, label: 'VIP', minPrice: 401, maxPrice: Infinity },
} as const;

export const BOOST_CLICKS = 8;
export const PROFILE_SELECT = [
  'id', 'name', 'description', 'cover_url', 'media_urls', 'price_per_hour', 'category',
  'neighborhood', 'city', 'whatsapp_link', 'contact_channels', 'payment_identifier',
  'credits_balance', 'status', 'rating_average', 'total_reviews', 'is_admin', 'created_at',
].join(', ');
export const BOOST_DURATION_DAYS = 10;

export const RECHARGE_MULTIPLIERS = [1, 2, 4, 8, 15, 30] as const;

export function getRechargePackages(cpc: number) {
  return RECHARGE_MULTIPLIERS.map((clicks) => ({
    clicks,
    amount: clicks * cpc,
    label: clicks === 1 ? `${clicks}x` : `${clicks}x`,
  }));
}

export function getBoostCost(cpc: number): number {
  return BOOST_CLICKS * cpc;
}

export function getCategoryFromPrice(price: number): ProfileCategory {
  if (price <= 250) return 'standard';
  if (price <= 400) return 'mid';
  return 'vip';
}

export function getCostPerClick(category: ProfileCategory): number {
  return PRICING[category].costPerClick;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora mesmo';
  if (diffMins < 60) return `há ${diffMins} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 30) return `há ${diffDays}d`;
  return date.toLocaleDateString('pt-BR');
}

export function getVisitorIdentifier(): string {
  if (typeof window === 'undefined') return 'server';

  const stored = localStorage.getItem('visitor_id');
  if (stored) return stored;

  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    Math.random().toString(36),
  ].join('|');

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const id = 'v_' + Math.abs(hash).toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  localStorage.setItem('visitor_id', id);
  return id;
}
