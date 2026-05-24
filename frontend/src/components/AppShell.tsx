import { BarChart3, Cpu, LayoutDashboard, Map as MapIcon, Settings } from 'lucide-react';
import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NavLink, useLocation } from 'react-router-dom';
import type { EntityKey } from '../crudModals';
import { ENTITY_LABEL } from '../appConstants';
import { ROUTES } from '../routes/paths';
import { EntityTabIcon } from './EntityTabIcon';

const ENTITY_ORDER: EntityKey[] = ['groups', 'robots', 'tasks', 'events', 'obstacles', 'files'];

function topNavClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2 h-16 px-2 md:px-3 border-b-2 transition-all font-medium text-sm shrink-0 whitespace-nowrap ${
    isActive
      ? 'text-[#137fec] border-[#137fec]'
      : 'text-slate-400 border-transparent hover:text-slate-100 hover:border-slate-700'
  }`;
}

export function AppShell({
  children,
  onLogout,
  userRole,
  username,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  userRole: string | null;
  username: string | null;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-[#101922] text-slate-100 font-sans antialiased">
      <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#101922] px-3 md:px-6 shrink-0 z-50">
        <div className="flex items-center gap-4 md:gap-10 min-w-0 flex-1">
          <NavLink
            to={ROUTES.dashboard}
            className="flex items-center gap-2 md:gap-3 text-[#137fec] hover:opacity-90 transition-opacity shrink-0"
          >
            <Cpu className="w-7 h-7 md:w-8 md:h-8 shrink-0" />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-base md:text-xl font-bold tracking-tight leading-tight truncate">Mission Control</h1>
              <div className="text-[10px] text-slate-500 font-normal">Fleet telemetry</div>
            </div>
          </NavLink>

          <nav className="flex items-stretch gap-1 md:gap-6 overflow-x-auto custom-scrollbar max-w-[min(78vw,52rem)] md:max-w-none">
            <NavLink to={ROUTES.dashboard} end className={topNavClass}>
              <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
              Dashboard
            </NavLink>
            <NavLink to={ROUTES.statistics} end className={topNavClass}>
              <BarChart3 className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
              Statistics
            </NavLink>
            <NavLink to={ROUTES.map} end className={topNavClass}>
              <MapIcon className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
              Map
            </NavLink>
            {ENTITY_ORDER.map((k) => (
              <NavLink key={k} to={ROUTES.entityList(k)} className={topNavClass}>
                <EntityTabIcon tab={k} size="nav" className="shrink-0 text-[#137fec]" />
                {ENTITY_LABEL[k]}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-4 shrink-0 pl-2">
          {(username || userRole) && (
            <span
              className="hidden md:inline text-sm font-medium text-slate-400 truncate max-w-[min(14rem,36vw)]"
              title={username || userRole || ''}
            >
              hello {username || userRole}
            </span>
          )}
          <NavLink
            to={ROUTES.settings}
            end
            title="Import / Export"
            className={({ isActive }) =>
              `h-9 w-9 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${
                isActive
                  ? 'bg-[#137fec] text-white border-[#137fec]'
                  : 'bg-[#137fec]/20 text-[#137fec] border-[#137fec]/40 hover:bg-[#137fec]/30'
              }`
            }
          >
            <Settings className="w-5 h-5" />
          </NavLink>
          <button
            type="button"
            className="text-xs px-2 md:px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/80 transition-colors"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
          >
            <div className="max-w-7xl mx-auto p-4 md:p-6 pb-10">{children}</div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
