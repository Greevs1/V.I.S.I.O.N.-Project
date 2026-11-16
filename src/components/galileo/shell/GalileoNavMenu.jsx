/**
 * GalileoNavMenu — restrained access to the product's destinations.
 *
 * Not a sidebar. A compact contextual menu inside the Vision header, so the
 * user is never trapped in the chrome-less shell while Vision stays dominant.
 *
 * Five destinations, each one real. When the caller can host a Vision
 * workspace, each destination OPENS INSIDE VISION (Part 8/10/11/12/17); the
 * legacy route stays registered for direct links and advisors, it simply stops
 * being where the owner is sent. With no workspace handler the menu falls back
 * to the route, so the Magic Loop and any other caller keep working.
 *
 * Strategic Roadmap was removed here: the 90-Day Sprint is the execution
 * destination, and this menu does not carry two routes to the same work.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  LayoutDashboard,
  FolderOpen,
  Target,
  TrendingUp,
  Flame,
} from 'lucide-react';

// Settings is deliberately NOT a destination: it is account configuration, not
// a place to operate the business, and it already has a home in the account
// control at the right of the header. Every entry here opens a real surface
// inside Vision.
const ROUTE_DESTINATIONS = [
  { label: 'Dashboard', desc: 'Detailed analytics', to: '/dashboard', workspace: 'dashboard', icon: LayoutDashboard },
  { label: '90-Day Sprint', desc: 'Execute your plan', to: '/advisory/command-center', workspace: 'sprint', icon: Flame },
  // Global Rule #1 — this is no longer "go and manage files". It opens the
  // Galileo document overlay over Vision: upload, list, review, viewer.
  { label: 'Data Room', desc: 'Your document & evidence repository', to: '/data-room', workspace: 'data-room', icon: FolderOpen },
  { label: 'Assessments', desc: 'Business health checks', to: '/assessments/profit-gap', workspace: 'assessments', icon: Target },
  { label: 'Valuation', desc: 'Business value & drivers', to: '/advisory/business-valuation', workspace: 'valuation', icon: TrendingUp },
];

export default function GalileoNavMenu({ onOpenSprint, onOpenWorkspace }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const destinations = ROUTE_DESTINATIONS.map((destination) => ({
    ...destination,
    onSelect:
      onOpenWorkspace && destination.workspace
        ? () => onOpenWorkspace(destination.workspace)
        : undefined,
  }));

  // A caller with its own sprint handler but no workspace layer (the Magic
  // Loop) opens the in-shell Playbook instead. ROUTE_DESTINATIONS no longer
  // duplicates a 90-Day Sprint entry, so nothing is listed twice.
  if (onOpenSprint && !onOpenWorkspace) {
    destinations.splice(1, 1, {
      label: '90-Day Sprint',
      desc: 'Execute your plan',
      icon: Flame,
      onSelect: onOpenSprint,
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Destinations"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/85 vision-focus"
      >
        <span className="hidden text-[11.5px] font-medium sm:inline">Destinations</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[hsl(var(--vision-raised))]/95 shadow-2xl backdrop-blur-xl">
          {destinations.map(({ label, desc, to, icon: Icon, onSelect }) => {
            const body = (
              <>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vision-champagne/55" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-white/80">{label}</span>
                  <span className="block text-[10.5px] text-white/35">{desc}</span>
                </span>
              </>
            );

            const shared =
              'flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.05] vision-focus';

            return onSelect ? (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect();
                }}
                className={shared}
              >
                {body}
              </button>
            ) : (
              <Link key={label} to={to} onClick={() => setOpen(false)} className={shared}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}