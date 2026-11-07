import './globals.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { AgeGate } from '@/components/age-gate';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Sutil Intimates — Acompanhantes na sua região',
  description: 'Encontre acompanhantes independentes verificados na sua região. Contato direto pelo WhatsApp, avaliações reais. Plataforma +18.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${cormorant.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <AgeGate>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </AgeGate>
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
