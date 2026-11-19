import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ER Studio — Modelagem de DER',
  description:
    'Modelagem entidade-relacionamento com múltiplos SubModels, leitura somente-leitura de DDL do banco, assistente de IA e relatórios ricos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="h-screen overflow-hidden bg-[#F3F6FB] font-sans text-[#0F172A] antialiased">
        {children}
      </body>
    </html>
  );
}
