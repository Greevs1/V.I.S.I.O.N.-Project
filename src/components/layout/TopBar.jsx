import React from 'react';
import { Menu, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import ProfileDropdown from '@/components/layout/ProfileDropdown';
import GlobalSearch from '@/components/layout/GlobalSearch';
import NotificationBell from '@/components/notifications/NotificationBell';
import BusinessContextSelector from '@/components/layout/BusinessContextSelector';

const pageTitles = {
  '/dashboard': 'IQ™ Dashboard',
  '/upload': 'Document Upload',
  '/data-room': 'Data Room',
  '/document-requests': 'Document Requests',
  '/support': 'Support',
  '/assessments/profit-gap': 'Profit Gap',
  '/assessments/value-gap': 'Value Gap',
  '/assessments/recast-ebitda': 'Recast EBITDA',
  '/assessments/tax-gap': 'Tax Gap Engine',
  '/assessments/operations-gap': 'Operations Gap',
  '/assessments/freedom': 'Freedom Assessment',
  '/assessments/cost-of-inaction': 'Cost of Inaction',
  '/assessments/roadmap': 'Strategic Sprint',
  '/advisory/command-center': 'Command Center',
  '/advisory/exit-readiness': 'Exit Readiness',
  '/advisory/ma-simulator': 'M&A Simulator',
  '/advisory/resources': 'Resource Library',
  '/admin': 'Admin View',
  '/team': 'My Team',
};

export default function TopBar({ onMenuClick, onDesktopToggle }) {
  const { user } = useAuth();
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'V.I.S.I.O.N. Platform™';

  return (
    <header className="h-14 border-b bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 sticky top-0 z-20 relative" style={{ borderColor: '#24242A' }}>
      {/* Left: hamburger */}
      <div className="flex items-center gap-3 w-1/3">
        <button onClick={onMenuClick} className="lg:hidden text-muted-foreground hover:text-foreground">
          <Menu className="w-5 h-5" />
        </button>
        <button onClick={onDesktopToggle} className="hidden lg:flex text-muted-foreground hover:text-foreground" title="Toggle sidebar">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Center: page title */}
      <div className="flex-1 flex justify-center">
        <h1 className="text-sm font-medium hidden sm:block" style={{ color: '#F5F5F5' }}>{title}</h1>
      </div>

      <div className="flex items-center gap-3 w-1/3 justify-end">
        <BusinessContextSelector />
        <GlobalSearch />
        <NotificationBell />
        {user ? (
          <ProfileDropdown />
        ) : (
          <Link to="/login">
            <Button 
              size="sm" 
              className="h-8 text-xs gap-1.5 font-medium"
              style={{ 
                background: '#D4A72C', 
                color: '#08090B',
                border: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F5D89A'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#D4A72C'}
            >
              <LogIn className="w-3.5 h-3.5" />
              Login
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}