import { HubConfigResponse } from '@/types/hub';

const API_BASE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001/api';

export const FALLBACK_HUB_CONFIG: HubConfigResponse = {
  brand: {
    title: 'Protótipos',
    subtitle: 'Plataforma de modelagem e diagramas',
  },
  user: {
    displayName: 'Jacintho, Nilton',
    initials: 'JN',
  },
  heading: 'Selecione uma solução',
  subheading: 'Escolha a ferramenta para abrir.',
  solutions: [
    {
      id: 'mindmap',
      slug: 'mindmap',
      name: 'MindMap',
      shortDescription: 'Mapas mentais com geração por IA.',
      detailedDescription:
        'Organize ideias em mapas mentais com nós hierárquicos, comentários e compartilhamento. Gere a estrutura a partir de um texto com IA e exporte o mapa em HTML.',
      icon: 'mindmap',
      actionLabel: 'Abrir',
      url: process.env.NEXT_PUBLIC_MINDMAP_URL ?? 'http://localhost:3002',
      order: 1,
    },
    {
      id: 'flowchart',
      slug: 'flowchart',
      name: 'Flowchart',
      shortDescription: 'Fluxogramas a partir de linguagem natural.',
      detailedDescription:
        'Transforme descrições em linguagem natural em fluxogramas estruturados com decisões, etapas e conexões claras. Edite visualmente e exporte seus diagramas com facilidade.',
      icon: 'flowchart',
      actionLabel: 'Abrir',
      url: process.env.NEXT_PUBLIC_FLOWCHART_URL ?? 'http://localhost:3003',
      order: 2,
    },
    {
      id: 'bpmn',
      slug: 'bpmn',
      name: 'BPMN',
      shortDescription: 'Modelagem de processos BPMN 2.0.',
      detailedDescription:
        'Modele processos de negócio seguindo o padrão BPMN 2.0 com piscinas, raias, eventos, atividades e gateways. Padronize a documentação e o compartilhamento de fluxos.',
      icon: 'bpmn',
      actionLabel: 'Abrir',
      order: 3,
    },
    {
      id: 'er-studio',
      slug: 'er-studio',
      name: 'ER Studio',
      shortDescription: 'Modelagem entidade-relacionamento.',
      detailedDescription:
        'Crie diagramas entidade-relacionamento com entidades, atributos, chaves primárias e estrangeiras e cardinalidades. Visualize e documente modelos de dados de forma intuitiva.',
      icon: 'er-studio',
      actionLabel: 'Abrir',
      url: process.env.NEXT_PUBLIC_ERSTUDIO_URL ?? 'http://localhost:3004',
      order: 4,
    },
  ],
};

export async function fetchHubConfig(): Promise<{
  data: HubConfigResponse;
  fromApi: boolean;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/hub`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = (await response.json()) as HubConfigResponse;
    return { data, fromApi: true };
  } catch {
    return { data: FALLBACK_HUB_CONFIG, fromApi: false };
  }
}
