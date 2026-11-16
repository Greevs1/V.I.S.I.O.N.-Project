/**
 * GalileoShell — the persistent Phase 4 workspace shell.
 *
 * Minimal persistent structure:
 *   HEADER — the caller's header, or the default Galileo lockup
 *   NOW    — one subtle contextual item (only when something deserves it)
 *   CENTER — the workspace
 *   BOTTOM — pulse bar (Magic Loop) or the centered utility dock (Home)
 *   ASK    — the persistent global Galileo bar (Vision only)
 *
 * The shell never changes. Only the center workspace transforms contextually.
 *
 * `cinematic` lays the atmospheric background behind the entire experience
 * and drops the shell's own opaque field so it shows through.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ModeIndicator from './ModeIndicator';
import GalileoOrbMark from '@/components/galileo/identity/GalileoOrbMark';
import GalileoNavMenu from './GalileoNavMenu';
import CinematicBackground from './CinematicBackground';

export default function GalileoShell({
  context,
  clientRole,
  mode,
  isAuthenticated,
  hasModel,
  modelCompleteness,
  header = null,
  nowSurface,
  utilityDock,
  children,
  pulseBar,
  galileoBar = null,
  cinematic = false,
  dimmed = false,
}) {
  return (
    <div
      className={`min-h-screen w-full flex flex-col origin-center transition-[transform,opacity] duration-200 ${
        dimmed ? 'scale-[0.985] opacity-55' : ''
      }`}
      style={{
        background: cinematic
          ? 'transparent'
          : 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,168,83,0.03) 0%, transparent 60%), #08080C',
      }}
    >
      {cinematic && <CinematicBackground />}

      {header || (
        <DefaultHeader
          context={context}
          clientRole={clientRole}
          mode={mode}
          isAuthenticated={isAuthenticated}
          hasModel={hasModel}
          modelCompleteness={modelCompleteness}
        />
      )}

      {/* ── NOW — one subtle contextual item (only when deserved) ── */}
      {nowSurface}

      {/* ── CENTER — the workspace ── */}
      {/* The assistant reserves its own strip at the bottom of the scroll region
          ONLY when the shell carries it, so content is never covered by the bar
          (Part 4) and the guest Magic Loop is untouched. */}
      <main
        className="flex-1 flex flex-col overflow-hidden min-h-0 relative"
        style={
          galileoBar
            ? { paddingBottom: 'calc(var(--vision-assistant-space) + env(safe-area-inset-bottom))' }
            : undefined
        }
      >
        {children}

        <AnimatePresence>
          {(pulseBar || utilityDock) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-0 left-0 right-0 px-4 md:px-8 pb-3 z-20 pointer-events-none"
            >
              {pulseBar ? (
                <div className="max-w-[860px] mx-auto pointer-events-auto flex items-end justify-between gap-3">
                  {pulseBar}
                  {utilityDock}
                </div>
              ) : (
                <div className="max-w-[1360px] mx-auto pointer-events-auto flex justify-center">
                  {utilityDock}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Ask Galileo — present at the bottom of every owner-facing surface ──
          It portals itself into the assistant layer, so it stays above the
          workspace overlays and the document viewer rather than living inside
          one of them. */}
      {galileoBar}
    </div>
  );
}

/**
 * DefaultHeader — the discovery-session header. Used by the Magic Loop, where
 * Galileo is the voice the guest meets. The authenticated Vision Home passes
 * its own header instead.
 */
function DefaultHeader({
  context,
  clientRole,
  mode,
  isAuthenticated,
  hasModel,
  modelCompleteness,
}) {
  return (
    <header className="shrink-0 flex items-center justify-between px-5 md:px-8 h-14 z-20">
      <div className="flex items-center gap-3">
        <GalileoOrbMark size="micro" />
        <span className="text-sm font-semibold text-white/80 tracking-wide">Galileo</span>
        {context && (
          <span className="text-[11px] text-white/30 ml-1 hidden sm:inline">
            · {context === 'my_business' ? 'My Business' : 'A Client'}
            {clientRole ? ` · ${clientRole}` : ''}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {hasModel && modelCompleteness != null && modelCompleteness > 0 && (
          <span className="text-[10px] text-white/30 hidden sm:inline">
            Business Intelligence: {modelCompleteness}%
          </span>
        )}
        {hasModel && <ModeIndicator mode={mode} />}
        {isAuthenticated && <GalileoNavMenu />}
        <Link to="/journey" className="text-[11px] text-white/25 hover:text-white/50">
          Exit
        </Link>
      </div>
    </header>
  );
}