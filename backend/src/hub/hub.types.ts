export type SolutionIcon = 'mindmap' | 'flowchart' | 'bpmn' | 'er-studio';

export interface HubSolution {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  detailedDescription: string;
  icon: SolutionIcon;
  actionLabel: string;
  url?: string;
  order: number;
}

export interface HubUser {
  displayName: string;
  initials: string;
}

export interface HubBrand {
  title: string;
  subtitle: string;
}

export interface HubConfigResponse {
  brand: HubBrand;
  user: HubUser;
  heading: string;
  subheading: string;
  solutions: HubSolution[];
}
