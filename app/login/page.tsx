'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PROFILE_SELECT } from '@/lib/constants';
import type { Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Lock, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('msg') === 'profile_created') {
      toast.success('Perfil publicado! Você ganhou 1 clique grátis. Entre para acessar seu painel.', { duration: 6000 });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error('Email ou senha incorretos. Verifique e tente novamente.');
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', data.user.id)
        .maybeSingle();
      const profile = profileRow as Profile | null;

      if (profile?.is_admin) {
        router.push('/admin');
      } else if (profile && profile.name) {
        router.push('/dashboard');
      } else {
        router.push('/profile-setup');
      }
      toast.success('Bem-vinda de volta!');
    }
  };

  const showCreatedMsg = searchParams.get('msg') === 'profile_created';

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md animate-scale-in">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 text-2xl font-serif font-semibold tracking-wide">
            Sutil <span className="text-primary">Intimates</span>
          </div>
          <CardTitle className="text-2xl">Entrar</CardTitle>
          <CardDescription>Acesse o painel do seu perfil</CardDescription>
        </CardHeader>
        {showCreatedMsg && (
          <div className="mx-6 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>Perfil publicado! Você ganhou 1 clique grátis. Entre novamente para acessar seu painel e ativar seu perfil.</span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <p className="text-sm text-muted-foreground">
              Ainda não tem perfil?{' '}
              <Link href="/advertise" className="font-medium text-primary hover:underline">
                Quero Anunciar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
