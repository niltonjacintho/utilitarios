import React, { Suspense } from 'react';
import { LoginView } from '@/components/LoginView';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] text-[#5A6B7C]">
          Carregando...
        </div>
      }
    >
      <LoginView />
    </Suspense>
  );
}
