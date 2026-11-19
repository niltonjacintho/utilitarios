import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Protótipos — Plataforma de modelagem e diagramas',
  description: 'Hub de soluções de modelagem e diagramas (MindMap, Flowchart, BPMN e ER Studio).',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#F5F7FA] font-sans text-[#0C2340] antialiased">
        {children}
      </body>
    </html>
  );
}
