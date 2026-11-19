import React from 'react';
import { HubShell } from '@/components/HubShell';
import { fetchHubConfig } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { data } = await fetchHubConfig();

  return <HubShell config={data} />;
}
