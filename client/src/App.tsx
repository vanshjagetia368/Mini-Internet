/**
 * @file client/src/App.tsx
 *
 * Root application component.
 *
 * ARCHITECTURAL RULE:
 *   This component is responsible for application structure only.
 *   It must NOT contain routing logic, packet forwarding, or any
 *   simulation decision-making.
 *
 * CURRENT STATE — Foundation phase:
 *   - Renders a placeholder canvas area ✓
 *   - NetworkCanvas component: PLACEHOLDER (Phase 2)
 *   - Command panel: NOT YET (Phase 2)
 *   - Simulation controls: NOT YET (Phase 2)
 *   - Event log: NOT YET (Phase 2)
 */

import React from 'react';

/**
 * Placeholder canvas — shows that the layout is working.
 * Will be replaced with the React Flow network canvas in Phase 2.
 *
 * NOTE: This is NOT a fake simulation. It is an honest placeholder
 * that makes the layout testable without implementing features prematurely.
 */
function NetworkCanvasPlaceholder(): React.ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div
          className="mb-4 text-5xl"
          role="img"
          aria-label="Network simulator icon"
        >
          🌐
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-sky-400">
          Mini Internet
        </h1>
        <p className="text-slate-400">
          Network simulation canvas — Phase 2
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Foundation phase: architecture established, UI coming in Phase 2.
        </p>
      </div>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-900">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center border-b border-slate-700 px-4">
        <span className="text-sm font-medium text-slate-300">
          Mini Internet — Network Simulator
        </span>
        <span className="ml-auto text-xs text-slate-600">
          Foundation Phase v0.1.0
        </span>
      </header>

      {/* ── Main workspace ────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left sidebar — device palette (Phase 2) */}
        <aside className="flex w-48 shrink-0 flex-col border-r border-slate-700 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Devices
          </p>
          <p className="mt-2 text-xs text-slate-600">Phase 2</p>
        </aside>

        {/* Canvas area */}
        <section className="flex flex-1 flex-col overflow-hidden">
          <NetworkCanvasPlaceholder />
        </section>

        {/* Right sidebar — properties panel (Phase 2) */}
        <aside className="flex w-64 shrink-0 flex-col border-l border-slate-700 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Properties
          </p>
          <p className="mt-2 text-xs text-slate-600">Phase 2</p>
        </aside>
      </main>

      {/* ── Bottom panel — event log (Phase 2) ────────────────────── */}
      <footer className="flex h-32 shrink-0 flex-col border-t border-slate-700 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Event Log
        </p>
        <p className="mt-1 text-xs text-slate-600">Phase 2</p>
      </footer>
    </div>
  );
}
