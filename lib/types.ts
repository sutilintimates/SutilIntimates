export type ProfileCategory = 'standard' | 'mid' | 'vip';
export type ProfileStatus = 'active' | 'paused' | 'exhausted';
export type ClickType = 'view' | 'contact';
export type TransactionStatus = 'pending' | 'paid';

export interface ContactChannel {
  type: 'whatsapp' | 'telegram' | 'phone';
  label: string;
  url: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  media_urls: string[];
  price_per_hour: number;
  category: ProfileCategory;
  neighborhood: string;
  city: string;
  whatsapp_link: string;
  contact_channels: ContactChannel[];
  payment_identifier: string;
  credits_balance: number;
  status: ProfileStatus;
  rating_average: number;
  total_reviews: number;
  is_admin: boolean;
  created_at: string;
}

export interface FeedProfile {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  media_urls: string[];
  price_per_hour: number;
  category: ProfileCategory;
  neighborhood: string;
  city: string;
  whatsapp_link: string;
  contact_channels: ContactChannel[];
  rating_average: number;
  total_reviews: number;
  created_at: string;
  rank_score: number;
  is_boosted: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  status: TransactionStatus;
  asaas_payment_id: string | null;
  asaas_invoice_url: string | null;
  created_at: string;
}

export interface LeadClick {
  id: string;
  profile_id: string;
  visitor_identifier: string;
  click_type: ClickType;
  cost_charged: number;
  created_at: string;
}

export interface Review {
  id: string;
  profile_id: string;
  visitor_identifier: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface DashboardStats {
  credits_balance: number;
  total_spent: number;
  total_contact_clicks: number;
  total_profile_views: number;
  profile_status: ProfileStatus;
  price_per_hour: number;
  category: ProfileCategory;
  cost_per_click: number;
  recent_clicks: Array<{
    id: string;
    type: ClickType;
    cost: number;
    created_at: string;
  }>;
  recent_transactions: Array<{
    id: string;
    amount: number;
    status: TransactionStatus;
    created_at: string;
  }>;
  daily_spending: Array<{
    date: string;
    spent: number;
  }>;
  boost_expires_at: string | null;
}

export interface ContactClickResult {
  success: boolean;
  already_contacted: boolean;
  cost_charged: number;
  new_balance: number;
  profile_status: string;
  whatsapp_link: string;
  contact_channels: ContactChannel[];
}

export interface ReviewResult {
  success: boolean;
  message: string;
  new_rating_average: number;
  new_total_reviews: number;
}

export interface BoostResult {
  success: boolean;
  message: string;
  boost_expires: string;
  new_balance: number;
}
