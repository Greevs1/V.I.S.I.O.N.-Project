import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const FAMILY_TYPE_LABELS = {
  operating_company: 'Operating',
  holding_company: 'Holding',
  real_estate: 'Real Estate',
  investment: 'Investment',
  trust: 'Trust',
};

export default function BusinessContextSelector() {
  const { activeContext, allBusinesses, isMultiBusiness, setActiveContext } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Only render when multi-business and fully initialized
  if (!isMultiBusiness || !activeContext.initialized || allBusinesses.length <= 1) {
    return null;
  }

  const activeBusiness = allBusinesses.find(b => b.id === activeContext.businessId) || allBusinesses[0];

  const handleSelect = (business) => {
    setActiveContext({
      type: 'business',
      businessId: business.id,
      businessIds: activeContext.businessIds,
    });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium transition-all hover:bg-secondary"
        style={{
          background: open ? 'rgba(212,167,44,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(212,167,44,0.35)' : 'rgba(255,255,255,0.1)'}`,
          color: open ? '#D4A72C' : '#D4D4D4',
          maxWidth: '160px',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3 h-3 shrink-0" />
        <span className="truncate">{activeBusiness?.name || 'Select Business'}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-9 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: '220px',
            maxWidth: '280px',
          }}
          role="listbox"
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Active Business</p>
          </div>

          <div className="py-1">
            {allBusinesses.map(business => {
              const isActive = business.id === activeContext.businessId;
              const familyLabel = FAMILY_TYPE_LABELS[business.business_family_type] || null;
              return (
                <button
                  key={business.id}
                  onClick={() => handleSelect(business)}
                  role="option"
                  aria-selected={isActive}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/70"
                >
                  {/* Checkmark */}
                  <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                    {isActive && <Check className="w-3.5 h-3.5" style={{ color: '#D4A72C' }} />}
                  </div>

                  {/* Business info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-normal'}`}
                      style={{ color: isActive ? '#D4A72C' : '#E5E5E5' }}>
                      {business.name}
                    </p>
                    {familyLabel && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{familyLabel}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}