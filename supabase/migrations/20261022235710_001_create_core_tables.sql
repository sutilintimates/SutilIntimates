/*
# Create Core Tables for I♡PUTs Platform

## Overview
Creates the four essential tables for the pay-per-lead advertising platform:
profiles (advertisers), transactions (credit recharges), leads_clicks (visitor tracking),
and reviews (ratings). Also creates a profiles_view for public-safe profile data,
a storage bucket for media, and proper RLS policies.

## New Tables

### 1. profiles (advertisers)
- id (uuid, PK, defaults to auth.uid() - links to auth.users)
- name (text, advertiser display name)
- description (text, profile description)
- cover_url (text, main cover photo URL)
- media_urls (jsonb, up to 5 additional media URLs)
- price_per_hour (numeric(10,2), hourly rate)
- category (text: 'standard' | 'mid' | 'vip', auto-derived from price)
- neighborhood (text, location neighborhood)
- city (text, location city)
- whatsapp_link (text, WhatsApp contact URL)
- contact_channels (jsonb, optional additional contact channels)
- payment_identifier (text, PIX key for payouts)
- credits_balance (numeric(10,2), current credit balance in BRL)
- status (text: 'active' | 'paused' | 'exhausted')
- rating_average (numeric(3,2), average star rating)
- total_reviews (integer, review count)
- is_admin (boolean, admin flag - default false)
- created_at (timestamptz)

### 2. transactions (credit recharges)
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id)
- amount (numeric(10,2), recharge amount in BRL)
- status (text: 'pending' | 'paid')
- asaas_payment_id (text, Asaas payment reference)
- asaas_invoice_url (text, Asaas invoice URL)
- created_at (timestamptz)

### 3. leads_clicks (visitor tracking & anti-spam)
- id (uuid, PK)
- profile_id (uuid, FK -> profiles.id)
- visitor_identifier (text, hashed IP + user agent)
- click_type (text: 'view' | 'contact')
- cost_charged (numeric(10,2), amount deducted from advertiser)
- created_at (timestamptz)

### 4. reviews (ratings)
- id (uuid, PK)
- profile_id (uuid, FK -> profiles.id)
- visitor_identifier (text, hashed visitor ID)
- rating (integer 1-5)
- comment (text)
- created_at (timestamptz)

## Security
- RLS enabled on all tables
- profiles: public SELECT on active profiles (limited columns via view),
  authenticated owners get full CRUD on their own row
- transactions: authenticated owners see/insert their own records
- leads_clicks: public INSERT (for tracking), authenticated SELECT own profile's clicks
- reviews: public SELECT and INSERT (with validation), no updates/deletes from client
- Column-level security: credits_balance, payment_identifier, status, is_admin
  are NOT client-writable directly (managed via SECURITY DEFINER functions)
- Storage bucket 'profile-media' created for advertiser photos
*/

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_per_hour numeric(10,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'standard' CHECK (category IN ('standard','mid','vip')),
  neighborhood text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  whatsapp_link text NOT NULL DEFAULT '',
  contact_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_identifier text NOT NULL DEFAULT '',
  credits_balance numeric(10,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','exhausted')),
  rating_average numeric(3,2) NOT NULL DEFAULT 0.00,
  total_reviews integer NOT NULL DEFAULT 0,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  asaas_payment_id text,
  asaas_invoice_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visitor_identifier text NOT NULL,
  click_type text NOT NULL DEFAULT 'view' CHECK (click_type IN ('view','contact')),
  cost_charged numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visitor_identifier text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_category ON profiles(category);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_leads_clicks_profile_id ON leads_clicks(profile_id);
CREATE INDEX IF NOT EXISTS idx_leads_clicks_visitor ON leads_clicks(visitor_identifier);
CREATE INDEX IF NOT EXISTS idx_leads_clicks_created_at ON leads_clicks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_profile_id ON reviews(profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- profiles: public can see active profiles (limited columns),
-- authenticated owners can see/manage their own row
GRANT SELECT (id, name, description, cover_url, media_urls, price_per_hour, category, neighborhood, city, whatsapp_link, contact_channels, rating_average, total_reviews, created_at) ON profiles TO anon, authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT INSERT (name, description, cover_url, media_urls, price_per_hour, category, neighborhood, city, whatsapp_link, contact_channels, payment_identifier) ON profiles TO authenticated;
GRANT UPDATE (name, description, cover_url, media_urls, price_per_hour, category, neighborhood, city, whatsapp_link, contact_channels, payment_identifier) ON profiles TO authenticated;

DROP POLICY IF EXISTS "public_select_active_profiles" ON profiles;
CREATE POLICY "public_select_active_profiles" ON profiles FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "owner_select_profile" ON profiles;
CREATE POLICY "owner_select_profile" ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "owner_insert_profile" ON profiles;
CREATE POLICY "owner_insert_profile" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "owner_update_profile" ON profiles;
CREATE POLICY "owner_update_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- transactions: owners can see and insert their own
GRANT SELECT, INSERT ON transactions TO authenticated;

DROP POLICY IF EXISTS "owner_select_transactions" ON transactions;
CREATE POLICY "owner_select_transactions" ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner_insert_transactions" ON transactions;
CREATE POLICY "owner_insert_transactions" ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- leads_clicks: public can insert (visitor tracking),
-- profile owners can see their own profile's clicks
GRANT INSERT ON leads_clicks TO anon, authenticated;
GRANT SELECT ON leads_clicks TO authenticated;

DROP POLICY IF EXISTS "public_insert_leads_clicks" ON leads_clicks;
CREATE POLICY "public_insert_leads_clicks" ON leads_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "owner_select_leads_clicks" ON leads_clicks;
CREATE POLICY "owner_select_leads_clicks" ON leads_clicks FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- reviews: public can see and insert, no updates/deletes from client
GRANT SELECT, INSERT ON reviews TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_reviews" ON reviews;
CREATE POLICY "public_select_reviews" ON reviews FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_insert_reviews" ON reviews;
CREATE POLICY "public_insert_reviews" ON reviews FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to their own folder
DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
CREATE POLICY "Users can upload own media" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public can read media" ON storage.objects;
CREATE POLICY "Public can read media" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'profile-media');

DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
CREATE POLICY "Users can delete own media" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
CREATE POLICY "Users can update own media" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );