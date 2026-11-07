'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Star,
  MapPin,
  DollarSign,
  MessageCircle,
  Phone,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Flame,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatRelativeTime, getVisitorIdentifier } from '@/lib/constants';
import { getProfileMediaUrl } from '@/lib/media';
import type { FeedProfile, ContactChannel, Review, ContactClickResult, ReviewResult } from '@/lib/types';
import { getRpcRow } from '@/lib/utils';
import { normalizeWhatsappUrl } from '@/lib/whatsapp';

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

const channelIcons: Record<string, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  telegram: Send,
  phone: Phone,
};

export function ProfileDetailModal({
  profile,
  open,
  onOpenChange,
}: {
  profile: FeedProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [contacting, setContacting] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasContacted, setHasContacted] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewAverage, setReviewAverage] = useState(0);

  const allImages = profile
    ? [profile.cover_url, ...(profile.media_urls || [])].filter(Boolean).map(getProfileMediaUrl)
    : [];

  const loadReviews = useCallback(async (profileId: string) => {
    setLoadingReviews(true);
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(20);
    setReviews((data as Review[]) || []);
    const { count } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId);
    setReviewCount(count ?? 0);
    if (data && data.length > 0) {
      setReviewAverage(data.reduce((sum, review) => sum + review.rating, 0) / data.length);
    }
    setLoadingReviews(false);
  }, []);

  const recordView = useCallback(async (profileId: string) => {
    const visitorId = getVisitorIdentifier();
    await supabase.rpc('record_profile_view', {
      p_profile_id: profileId,
      p_visitor_identifier: visitorId,
    });
  }, []);

  useEffect(() => {
    if (profile && open) {
      setCurrentImageIdx(0);
      setReviewCount(profile.total_reviews);
      setReviewAverage(profile.rating_average);
      loadReviews(profile.id);

      const viewTimer = setTimeout(() => {
        recordView(profile.id);
      }, 5000);

      const visitorId = getVisitorIdentifier();
      supabase
        .from('leads_clicks')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('visitor_identifier', visitorId)
        .eq('click_type', 'contact')
        .limit(1)
        .then(({ data }) => setHasContacted(!!data && data.length > 0));

      return () => clearTimeout(viewTimer);
    }
  }, [profile, open, loadReviews, recordView]);

  if (!profile) return null;

  const processClickAndRedirect = async (targetUrl: string, label: string) => {
    if (!profile) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      toast.error(`O link de ${label} desta anunciante está inválido.`);
      return;
    }

    setContacting(true);
    const visitorId = getVisitorIdentifier();

    const { data, error } = await supabase.rpc('process_contact_click', {
      p_profile_id: profile.id,
      p_visitor_identifier: visitorId,
    });

    if (error) {
      toast.error('Erro ao processar contato. Tente novamente.');
      setContacting(false);
      return;
    }

    const result = getRpcRow(data as unknown as ContactClickResult | ContactClickResult[]);
    if (!result) {
      toast.error('Não foi possível confirmar o contato. Tente novamente.');
      setContacting(false);
      return;
    }

    if (!result.success && result.profile_status === 'exhausted') {
      toast.error('Este perfil está temporariamente indisponível. Tente novamente mais tarde.');
      setContacting(false);
      return;
    }

    if (result.already_contacted) {
      toast.info(`Você já iniciou contato nas últimas 24h. Reabrindo ${label} — sem cobrança adicional.`, {
        duration: 5000,
      });
    } else {
      toast.success(`Contato liberado! Abrindo ${label}...`, {
        duration: 4000,
      });
      setHasContacted(true);
    }

    window.location.assign(parsedUrl.toString());
    setContacting(false);
  };

  const handleContact = () => {
    const whatsappUrl = normalizeWhatsappUrl(profile.whatsapp_link);
    if (!whatsappUrl) {
      toast.error('O link de WhatsApp desta anunciante está inválido.');
      return;
    }
    processClickAndRedirect(whatsappUrl, 'WhatsApp');
  };
  const handleExtraChannel = (channel: ContactChannel) =>
    processClickAndRedirect(channel.url, channel.label || channel.type);

  const handleSubmitReview = async () => {
    if (!profile) return;
    setSubmittingReview(true);
    const visitorId = getVisitorIdentifier();

    const { data, error } = await supabase.rpc('submit_review', {
      p_profile_id: profile.id,
      p_visitor_identifier: visitorId,
      p_rating: reviewRating,
      p_comment: reviewComment.trim(),
    });

    if (error) {
      toast.error('Erro ao enviar avaliação.');
      setSubmittingReview(false);
      return;
    }

    const result = getRpcRow(data as unknown as ReviewResult | ReviewResult[]);
    if (!result) {
      toast.error('Não foi possível enviar a avaliação. Tente novamente.');
      setSubmittingReview(false);
      return;
    }

    if (result.success) {
      toast.success(result.message);
      setReviewComment('');
      setReviewRating(5);
      setReviewAverage(result.new_rating_average);
      setReviewCount(result.new_total_reviews);
      loadReviews(profile.id);
    } else {
      toast.error(result.message);
    }
    setSubmittingReview(false);
  };

  const nextImage = () => setCurrentImageIdx((i) => (i + 1) % allImages.length);
  const prevImage = () => setCurrentImageIdx((i) => (i - 1 + allImages.length) % allImages.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{profile.name}</DialogTitle>
        </DialogHeader>

        {/* Gallery — scrolls with content */}
        <div className="relative h-72 w-full flex-shrink-0 overflow-hidden bg-muted sm:h-96">
          {allImages.length > 0 ? (
            <img
              src={allImages[currentImageIdx]}
              alt={profile.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-4xl font-bold text-muted-foreground/30">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {profile.is_boosted && (
            <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
              <Flame className="h-3 w-3" />
              Destaque
            </div>
          )}

          {allImages.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentImageIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="space-y-5 p-5">
          {/* Name + location + category */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{profile.name}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{profile.neighborhood}, {profile.city}</span>
              </div>
            </div>
            <Badge className={`${categoryColors[profile.category]} flex-shrink-0`}>
              {categoryLabels[profile.category]}
            </Badge>
          </div>

          {/* Rating + Price */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              {reviewAverage > 0 ? (
                <>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${
                          s <= Math.round(reviewAverage)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{reviewAverage.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">({reviewCount} avaliações)</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Sem avaliações ainda</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-rose-500" />
              <span className="font-bold">{formatCurrency(profile.price_per_hour)}/hora</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Sobre</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {profile.description || 'Descrição ainda não adicionada.'}
            </p>
          </div>

          {/* Contact buttons */}
          <div className="space-y-3 border-t border-border pt-4">
            <Button
              onClick={handleContact}
              disabled={contacting}
              className="w-full bg-rose-500 text-white hover:bg-rose-600"
              size="lg"
            >
              {contacting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-5 w-5" />
              )}
              Iniciar contato pelo WhatsApp
            </Button>

            {profile.contact_channels && profile.contact_channels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.contact_channels.map((ch, idx) => {
                  const Icon = channelIcons[ch.type] || MessageCircle;
                  return (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleExtraChannel(ch)}
                    >
                      <Icon className="mr-1.5 h-4 w-4" />
                      {ch.label || ch.type}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Avaliações ({reviewCount})</h3>

            {/* Review form */}
            {hasContacted && (
              <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium">Deixe sua avaliação</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setReviewRating(s)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          s <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Conte como foi sua experiência (opcional)"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={2}
                />
                <Button
                  size="sm"
                  onClick={handleSubmitReview}
                  disabled={submittingReview}
                >
                  {submittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar avaliação
                </Button>
              </div>
            )}

            {!hasContacted && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 p-3 text-center">
                Inicie contato com este perfil para poder avaliar
              </p>
            )}

            {/* Reviews list */}
            {loadingReviews ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : reviews.length > 0 ? (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-lg border border-border/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-3 w-3 ${
                              s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(review.created_at)}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma avaliação ainda. Seja o primeiro a avaliar!
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
