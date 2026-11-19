import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Modelador de Fluxogramas — Protótipo',
  description:
    'Aplicação de modelagem de fluxogramas com raias, geração por IA a partir de texto corrido, validação, comentários e exportação rica.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="h-screen overflow-hidden bg-[#F8FAFC] font-sans text-[#0F172A] antialiased">
        {children}
      </body>
    </html>
  );
}
