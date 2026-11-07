'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { ProfileCard } from '@/components/profile-card';
import { ProfileDetailModal } from '@/components/profile-detail-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { FeedProfile } from '@/lib/types';
import { parseJsonArray, parseMediaUrls } from '@/lib/media';

const CATEGORIES = [
  { value: '', label: 'Todos' },
  { value: 'standard', label: 'Standard' },
  { value: 'mid', label: 'Mid' },
  { value: 'vip', label: 'VIP' },
];

export default function Home() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<FeedProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_public_feed', {
      p_limit: 50,
      p_offset: 0,
      p_city: cityFilter || null,
      p_category: categoryFilter || null,
      p_viewer_id: session?.user?.id || null,
    });

    if (error) {
      console.error('Feed error:', error);
      setProfiles([]);
    } else {
      const mapped = (data || []).map((p: Record<string, unknown>) => ({
        ...p,
        media_urls: parseMediaUrls(p.media_urls),
        contact_channels: parseJsonArray(p.contact_channels),
      })) as FeedProfile[];
      setProfiles(mapped);
    }
    setLoading(false);
  }, [cityFilter, categoryFilter, session]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const openProfile = (profile: FeedProfile) => {
    setSelectedProfile(profile);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen">
      {/* Feed section */}
      <section id="feed" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header + Filters */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-wide">
              Sutil <span className="text-primary">Intimates</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Carregando...' : `${profiles.length} acompanhantes disponíveis`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filtros
          </Button>
        </div>

        {/* Filters bar */}
        {showFilters && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4 animate-fade-in sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cidade..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    categoryFilter === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={loadFeed}>
              <Search className="mr-1.5 h-4 w-4" />
              Buscar
            </Button>
          </div>
        )}

        {/* Feed grid */}
        {loading ? (
          <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border/60">
                <Skeleton className="aspect-square w-full rounded-none" />
              </div>
            ))}
          </div>
        ) : profiles.length > 0 ? (
          <>
            <div className="mb-6 text-center">
              <h2 className="text-lg font-semibold text-foreground sm:text-xl">
                Encontre a acompanhante ideal para você
              </h2>
              <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-primary/50" />
            </div>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onClick={() => openProfile(profile)}
              />
            ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-lg font-medium">Nenhuma acompanhante encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tente ajustar os filtros ou volte mais tarde
            </p>
            {(cityFilter || categoryFilter) && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setCityFilter('');
                  setCategoryFilter('');
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        )}
      </section>

      <ProfileDetailModal
        profile={selectedProfile}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
