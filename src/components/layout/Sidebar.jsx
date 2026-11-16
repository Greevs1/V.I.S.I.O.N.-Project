import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Upload, Target, ChevronDown, ChevronRight,
  Building2, FolderOpen, FileQuestion, HelpCircle, Shield,
  Compass, DoorOpen, GitCompare,
  DollarSign, Cog, Calculator, Clock, Map, X,
  Calendar, Network } from
'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const intelligenceItems = [
  { icon: Upload, label: 'Document Upload', path: '/upload' },
  { icon: LayoutDashboard, label: 'IQ™ Dashboard', path: '/dashboard' },
  {
    icon: Target, label: 'Assessments', path: null,
    children: [
      { label: 'Profit Gap', path: '/assessments/profit-gap', color: '#a855f7' },
      { label: 'Value Gap', path: '/assessments/value-gap', color: '#00d4ff' },
      { label: 'Recast EBITDA', path: '/assessments/recast-ebitda', color: '#D4A853' },
      { label: 'Tax Gap Engine', path: '/assessments/tax-gap', color: '#22c55e' },
      { label: 'Operations Gap', path: '/assessments/operations-gap', color: '#ef4444' },
      { label: 'Freedom Assessment', path: '/assessments/freedom', color: '#3b82f6' }
    ]
  }
];

const advisoryItems = [
  {
    icon: Compass, label: 'Advisory Hub', path: null, isAdvisory: true,
    children: [
      { label: 'Command Center', path: '/advisory/command-center', isAdvisory: true },
      { label: 'Exit Readiness', path: '/advisory/exit-readiness', isAdvisory: true },
      { label: 'M&A Simulator', path: '/advisory/ma-simulator', isAdvisory: true },
      { label: 'Resource Library', path: '/advisory/resources', isAdvisory: true }
    ]
  },
  { icon: FolderOpen, label: 'Data Room', path: '/data-room', isAdvisory: true },
  {
    icon: Network, label: 'Expert Network', path: null,
    children: [
      { label: 'Find an Expert', path: '/expert-network' },
      { label: 'My Experts', path: '/expert-network?tab=mine' },
      { label: 'Apply as an Expert', path: '/expert-network?tab=apply' },
    ]
  },
  { icon: Calculator, label: 'Business Valuation', path: '/advisory/business-valuation', isAdvisory: true },
  { icon: HelpCircle, label: 'Concierge', path: '/support' }
];

function NavItem({ item, desktopCollapsed, isActive, isChildActive, expandedItems, toggleExpand, onClose, onDesktopToggle }) {
  const Icon = item.icon;
  const expanded = expandedItems.includes(item.label);
  const active = item.path ? isActive(item.path) : isChildActive(item.children);

  if (item.children) {
    if (desktopCollapsed) {
      return (
        <li>
          <button
            onClick={() => { onDesktopToggle?.(); toggleExpand(item.label); }}
            className="w-full flex items-center justify-center p-2 rounded-lg transition-all"
            style={{ color: active ? '#D4A72C' : 'rgba(245,245,245,0.7)', background: active ? '#1A1A1F' : 'transparent' }}
            title={item.label}
          >
            <Icon className="w-4 h-4 shrink-0" />
          </button>
        </li>
      );
    }
    return (
      <li>
        <button
          onClick={() => toggleExpand(item.label)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all"
          style={{ color: active ? '#F5F5F5' : 'rgba(245, 245, 245, 0.7)', background: active ? '#1A1A1F' : 'transparent' }}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(245, 245, 245, 0.05)'; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: active ? '#D4A72C' : 'inherit' }} />
          <span className="flex-1 text-left">{item.label}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <ul className="ml-4 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: '1px solid #24242A' }}>
            {item.children.map((child) => (
              <li key={child.path}>
                <Link
                  to={child.path}
                  onClick={onClose}
                  className="block px-2.5 py-1.5 rounded-md text-[13px] transition-all font-medium"
                  style={{ color: isActive(child.path) ? (child.color || '#D4A72C') : 'rgba(245, 245, 245, 0.5)', background: isActive(child.path) ? '#1A1A1F' : 'transparent' }}
                  onMouseEnter={(e) => { if (!isActive(child.path)) { e.currentTarget.style.color = child.color || '#D4A72C'; e.currentTarget.style.background = 'rgba(245, 245, 245, 0.05)'; } }}
                  onMouseLeave={(e) => { if (!isActive(child.path)) { e.currentTarget.style.color = 'rgba(245, 245, 245, 0.5)'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (desktopCollapsed) {
    return (
      <li>
        <Link
          to={item.path}
          onClick={() => { onDesktopToggle?.(); onClose?.(); }}
          className="flex items-center justify-center p-2 rounded-lg transition-all"
          style={{ color: active ? '#D4A72C' : 'rgba(245,245,245,0.7)', background: active ? '#1A1A1F' : 'transparent' }}
          title={item.label}
        >
          <Icon className="w-4 h-4 shrink-0" />
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={item.path}
        onClick={onClose}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all"
        style={{ color: active ? '#D4A72C' : 'rgba(245, 245, 245, 0.7)', background: active ? '#1A1A1F' : 'transparent' }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(245, 245, 245, 0.05)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

export default function Sidebar({ isOpen, onClose, desktopCollapsed, onDesktopToggle }) {
  const location = useLocation();
  const { user, supabaseProfile } = useAuth();
  const [expandedItems, setExpandedItems] = useState([]);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const appRole = supabaseProfile?.app_role;

  const toggleExpand = (label) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const isActive = (path) => location.pathname === path;
  const isChildActive = (children) => children?.some((c) => location.pathname === c.path);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-out
        lg:translate-x-0 lg:z-30
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${desktopCollapsed ? 'lg:w-14' : 'w-64'}
      `} style={{ background: '#0D0D10', borderRight: '1px solid #24242A' }}>
        {/* Logo */}
        <div className="flex items-center justify-between px-3 h-16 shrink-0" style={{ borderBottom: '1px solid #24242A' }}>
          {!desktopCollapsed && (
            <Link to="/dashboard" className="flex items-center w-full h-full py-1">
              <img src="https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/b7b1b2805_ChatGPTImageJul8202602_52_34PM.png" alt="V.I.S.I.O.N. Platform" className="w-full h-full object-cover" />
            </Link>
          )}
          {desktopCollapsed && (
            <button onClick={onDesktopToggle} className="mx-auto" title="Expand sidebar">
              <img src="https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/be6c09dce_ChatGPTImageJun15202603_23_23PM.png" alt="V.I.S.I.O.N." className="w-10 h-10 object-contain" />
            </button>
          )}

          <button onClick={onClose} className="lg:hidden" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#F5F5F5'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col overflow-y-auto py-4 px-2 min-h-0">
          {/* ── Intelligence Modules ── */}
          <div>
            {!desktopCollapsed && (
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase px-2 mb-2" style={{ color: 'rgba(156, 163, 175, 0.6)' }}>
                Intelligence Modules
              </p>
            )}
            {desktopCollapsed && <div className="h-px mx-1 mb-2" style={{ background: '#24242A' }} />}
            <ul className="space-y-0.5">
              {intelligenceItems.map((item) => <NavItem key={item.label} item={item} desktopCollapsed={desktopCollapsed} isActive={isActive} isChildActive={isChildActive} expandedItems={expandedItems} toggleExpand={toggleExpand} onClose={onClose} onDesktopToggle={onDesktopToggle} />)}
            </ul>
          </div>



          {/* ── Flex spacer ── */}
          <div className="flex-1" />

          {/* ── Advisory ── */}
          <div style={{ borderTop: '1px solid #24242A' }} className="pt-4">
            {!desktopCollapsed && (
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase px-2 mb-2" style={{ color: 'rgba(156, 163, 175, 0.6)' }}>
                Advisory
              </p>
            )}
            <ul className="space-y-0.5">
              {advisoryItems.map((item) => <NavItem key={item.label} item={item} desktopCollapsed={desktopCollapsed} isActive={isActive} isChildActive={isChildActive} expandedItems={expandedItems} toggleExpand={toggleExpand} onClose={onClose} onDesktopToggle={onDesktopToggle} />)}
            </ul>
          </div>
        </nav>
      </aside>
    </>
  );
}