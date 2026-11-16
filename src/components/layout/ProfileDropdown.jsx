import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Moon, Sun, Shield, Settings, Lock, Calendar, FilePenLine, Database, BookOpen, FlaskConical, Users, Calculator } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

export default function ProfileDropdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [demoMode, setDemoMode] = useState(() => {
    try { return localStorage.getItem('demo_mode') === 'true'; } catch { return false; }
  });
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored ? stored === 'dark' : document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, []);

  const toggleTheme = () => {
    const newDark = !darkMode;
    setDarkMode(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    document.documentElement.classList.toggle('light', !newDark);
    try { localStorage.setItem('theme', newDark ? 'dark' : 'light'); } catch {}
  };

  const toggleDemoMode = () => {
    const next = !demoMode;
    setDemoMode(next);
    try { localStorage.setItem('demo_mode', String(next)); } catch {}
    window.location.reload();
  };

  const handleLogout = () => {
    base44.auth.logout('/login');
    setOpen(false);
  };

  const go = (path) => { navigate(path); setOpen(false); };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  const { supabaseProfile } = useAuth();
  const appRole = supabaseProfile?.app_role;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isOwnerOrAdmin = ['owner', 'admin', 'super_admin'].includes(user?.role);
  const showExpertAdvisors = ['super_admin', 'admin', 'expert_advisor', 'advisor'].includes(appRole);

  return (
    <div className="relative" ref={ref}>
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-xs font-bold text-foreground hover:border-primary/50 transition-colors"
      >
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
          : initials
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-64 rounded-xl border border-border bg-popover shadow-2xl z-50 overflow-hidden py-1">

          {/* MY ACCOUNT */}
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Account</p>
          </div>
          <MenuItem icon={Settings} label="Settings" onClick={() => go('/settings?tab=general')} />
          <MenuItem icon={FilePenLine} label="Agreements" onClick={() => go('/agreements')} />
          <MenuItem icon={Calendar} label="Calendar Sync" onClick={() => go('/calendar-sync')} />
          {isOwnerOrAdmin && <MenuItem icon={BookOpen} label="My Team" onClick={() => go('/team')} />}
          <MenuItem icon={User} label="My Bookings" onClick={() => go('/settings?tab=bookings')} />

          {/* DISPLAY */}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Display</span>
              <span className="flex items-center gap-2 text-sm text-foreground">
                Toggle Theme
                {darkMode ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
              </span>
            </button>
          </div>

          {/* ADMIN — admin/super_admin only */}
          {isAdmin && (
            <>
              <div className="px-4 py-2 border-t border-border mt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin</p>
              </div>
              <MenuItem icon={Shield} label="Admin View" onClick={() => go('/admin')} />
              {showExpertAdvisors && <MenuItem icon={Users} label="Expert Advisors" onClick={() => go('/expert-advisors')} />}
              <MenuItem icon={Calculator} label="Business Valuations" onClick={() => go('/admin/business-valuations')} />
              <MenuItem icon={Database} label="Supabase Status" onClick={() => go('/dev/supabase-status')} />
              <button
                onClick={toggleDemoMode}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <span className="flex items-center gap-3">
                  <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0" />
                  Demo Mode
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${demoMode ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'}`}>
                  {demoMode ? 'ON' : 'OFF'}
                </span>
              </button>
            </>
          )}

          {/* SECURITY */}
          <div className="px-4 py-2 border-t border-border mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Security</p>
          </div>
          <MenuItem icon={Lock} label="Security Settings" onClick={() => go('/settings?tab=security')} />
          <div className="border-t border-border mt-1 pt-1 pb-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      {label}
    </button>
  );
}