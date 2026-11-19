import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { HubConfigResponse, HubSolution } from './hub.types';

@Injectable()
export class HubService {
  private readonly solutions: HubSolution[] = [
    {
      id: 'mindmap',
      slug: 'mindmap',
      name: 'MindMap',
      shortDescription: 'Mapas mentais com geração por IA.',
      detailedDescription:
        'Organize ideias em mapas mentais com nós hierárquicos, comentários e compartilhamento. Gere a estrutura a partir de um texto com IA e exporte o mapa em HTML.',
      icon: 'mindmap',
      actionLabel: 'Abrir',
      url: process.env.MINDMAP_APP_URL ?? 'http://localhost:3002',
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
      url: process.env.FLOWCHART_APP_URL ?? 'http://localhost:3003',
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
      url: process.env.ERSTUDIO_APP_URL ?? 'http://localhost:3004',
      order: 4,
    },
  ];

  getHubConfig(authUser?: AuthUser | null): HubConfigResponse {
    return {
      brand: {
        title: 'Protótipos',
        subtitle: 'Plataforma de modelagem e diagramas',
      },
      user: authUser
        ? {
            displayName: authUser.name,
            initials: authUser.initials,
          }
        : {
            displayName: 'Visitante',
            initials: 'VS',
          },
      heading: 'Selecione uma solução',
      subheading: 'Escolha a ferramenta para abrir.',
      solutions: this.getSolutions(),
    };
  }

  getSolutions(): HubSolution[] {
    return [...this.solutions].sort((a, b) => a.order - b.order);
  }

  getSolutionBySlug(slug: string): HubSolution {
    const solution = this.solutions.find((item) => item.slug === slug);
    if (!solution) {
      throw new NotFoundException(`Solução "${slug}" não encontrada.`);
    }
    return solution;
  }
}
