import React, { useState } from 'react';
import { type EntityKey } from './crudModals';

const ENTITY_LABEL: Record<EntityKey, string> = {
  groups: 'Groups',
  robots: 'Robots',
  tasks: 'Tasks',
  events: 'Events',
  obstacles: 'Obstacles',
  files: 'Visual logs',
};

export default function App() {
  const [entity, setEntity] = useState<EntityKey>('groups');

  return (
    <div className="flex h-screen bg-[#101922] text-slate-100 font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-[#0b1219] flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-tighter text-blue-500 uppercase">Mission Control</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {(Object.keys(ENTITY_LABEL) as EntityKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setEntity(k)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all ${
                entity === k ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {ENTITY_LABEL[k]}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden grid-pattern">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-[#101922]/80 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-slate-200">{ENTITY_LABEL[entity]}</h2>
        </header>
        <div className="p-8">
           {/* Здесь будет таблица с данными */}
           <p className="text-slate-500 text-sm">Select an entity to view data...</p>
        </div>
      </main>
    </div>
  );
}
