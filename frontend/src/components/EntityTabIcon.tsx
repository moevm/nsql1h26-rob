import React from 'react';
import { Activity, AlertTriangle, Bot, ClipboardList, Image as ImageIcon, Users } from 'lucide-react';
import type { EntityKey } from '../crudModals';

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  nav: 'w-4 h-4 md:w-5 md:h-5',
};

export function EntityTabIcon({
  tab,
  size = 'md',
  className = 'text-[#137fec] shrink-0',
}: {
  tab: EntityKey;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const c = `${sizes[size]} ${className}`;
  switch (tab) {
    case 'groups':
      return <Users className={c} />;
    case 'robots':
      return <Bot className={c} />;
    case 'tasks':
      return <ClipboardList className={c} />;
    case 'events':
      return <Activity className={c} />;
    case 'obstacles':
      return <AlertTriangle className={c} />;
    case 'files':
      return <ImageIcon className={c} />;
  }
}
