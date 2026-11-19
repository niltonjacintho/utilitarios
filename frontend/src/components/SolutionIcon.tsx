import React from 'react';
import { SolutionIconName } from '@/types/hub';

interface SolutionIconProps {
  name: SolutionIconName;
  className?: string;
}

export function SolutionIcon({ name, className = 'w-[22px] h-[22px]' }: SolutionIconProps) {
  switch (name) {
    case 'mindmap':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="6.2" cy="6.2" r="1.7" />
          <circle cx="17.8" cy="6.2" r="1.7" />
          <circle cx="6.2" cy="17.8" r="1.7" />
          <circle cx="17.8" cy="17.8" r="1.7" />
          <path d="M10.4 10.4 7.5 7.5" />
          <path d="M13.6 10.4 16.5 7.5" />
          <path d="M10.4 13.6 7.5 16.5" />
          <path d="M13.6 13.6 16.5 16.5" />
        </svg>
      );

    case 'flowchart':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <rect x="9.5" y="4" width="5" height="4.2" rx="1" />
          <rect x="4.5" y="15.3" width="5.2" height="4.2" rx="1" />
          <rect x="14.3" y="15.3" width="5.2" height="4.2" rx="1" />
          <path d="M12 8.2V12" />
          <path d="M7.1 15.3V12h9.8v3.3" />
        </svg>
      );

    case 'bpmn':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <circle cx="4.8" cy="12" r="1.7" />
          <path d="M6.5 12h2.3" />
          <rect x="8.8" y="8.8" width="6.4" height="6.4" rx="1.4" />
          <path d="M15.2 12h2.3" />
          <path d="m17.5 10.2 2.4 1.8-2.4 1.8" />
        </svg>
      );

    case 'er-studio':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
        >
          <rect x="4.5" y="5" width="6.2" height="4.8" rx="1.2" />
          <rect x="13.3" y="14.2" width="6.2" height="4.8" rx="1.2" />
          <path d="M10.7 7.4h3.9a1.2 1.2 0 0 1 1.2 1.2v5.6" />
        </svg>
      );
  }
}
