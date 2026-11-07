'use client';

import { Star, MapPin, MessageCircle, Flame } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import type { FeedProfile } from '@/lib/types';
import { getProfileMediaUrl } from '@/lib/media';
import { Badge } from '@/components/ui/badge';

const categoryColors: Record<string, string> = {
  standard: 'bg-slate-500/90 text-white',
  mid: 'bg-sky-500/90 text-white',
  vip: 'bg-amber-500/90 text-white',
};

const categoryLabels: Record<string, string> = {
  standard: 'Standard',
  mid: 'Mid',
  vip: 'VIP',
};

export function ProfileCard({ profile, onClick }: { profile: FeedProfile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {profile.cover_url ? (
          <img
            src={getProfileMediaUrl(profile.cover_url)}
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
            alt={profile.name}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="text-3xl font-bold text-muted-foreground/30">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Boost badge */}
        {profile.is_boosted && (
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-600 to-primary px-2 py-0.5 text-xs font-bold text-white shadow-lg">
            <Flame className="h-3 w-3" />
            Destaque
          </div>
        )}

        {/* Category badge */}
        <div className={`absolute ${profile.is_boosted ? 'left-2 top-9' : 'left-2 top-2'}`}>
          <Badge className={categoryColors[profile.category]} variant="secondary">
            {categoryLabels[profile.category]}
          </Badge>
        </div>

        {/* Rating badge */}
        {profile.rating_average > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium text-white">{profile.rating_average.toFixed(1)}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="truncate text-sm font-bold text-white">{profile.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/80">
            {profile.description || 'Descrição ainda não adicionada.'}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{profile.neighborhood}, {profile.city}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-primary">{formatCurrency(profile.price_per_hour)}/hora</span>
            <div className="flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <MessageCircle className="h-3 w-3" />
              Ver mais
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
