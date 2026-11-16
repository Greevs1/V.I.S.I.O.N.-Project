import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import GalileoButton from '../galileo/GalileoButton';
import GalileoPanel from '../galileo/GalileoPanel';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [galileoOpen, setGalileoOpen] = useState(false);
  const location = useLocation();
  const { activeContext } = useAuth();
  // Phase 6 Final — the active business is a hard boundary for the routed surface.
  // Keying this subtree on the business remounts every page on a switch, which is
  // what discards business-scoped local state and re-runs mount-only effects
  // against the newly selected business. The sidebar, top bar and business
  // selector stay mounted, so the switch interaction itself is never interrupted.
  const activeBusinessId = activeContext?.businessId || null;

  // Allow any component to open Galileo via window event (e.g. hero "Ask Galileo" CTA)
  useEffect(() => {
    const handler = () => setGalileoOpen(true);
    window.addEventListener('open-galileo', handler);
    return () => window.removeEventListener('open-galileo', handler);
  }, []);

  // Derive page context from current route for Galileo
  const pageContext = {
    page_name: location.pathname.split('/').filter(Boolean).pop() || 'dashboard',
    current_route: location.pathname,
  };

  const toggleDesktop = () => {
    setDesktopCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen" style={{ background: '#08090B' }}>
      <Sidebar
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onDesktopToggle={toggleDesktop}
      />
      <div className={`transition-all duration-300 ${desktopCollapsed ? 'lg:ml-14' : 'lg:ml-64'}`}>
        <TopBar onMenuClick={() => setMobileOpen(true)} onDesktopToggle={toggleDesktop} />
        <main className="p-4 lg:p-8 pb-24">
          <div key={activeBusinessId}>
            <Outlet />
          </div>
        </main>
      </div>
      <GalileoButton onClick={() => setGalileoOpen(true)} />
      <GalileoPanel key={activeBusinessId} isOpen={galileoOpen} onClose={() => setGalileoOpen(false)} pageContext={pageContext} />
    </div>
  );
}