export type SolutionIconName = 'mindmap' | 'flowchart' | 'bpmn' | 'er-studio';

export interface HubSolution {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  detailedDescription: string;
  icon: SolutionIconName;
  actionLabel: string;
  url?: string;
  order: number;
}

export interface HubUser {
  displayName: string;
  initials: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  provider: 'local' | 'google' | 'both';
}

export interface AuthProviders {
  local: boolean;
  google: boolean;
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
