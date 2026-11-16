import React, { useState, useRef, useEffect } from 'react';
import { Search, X, FileText, Target, Compass, FolderOpen, LayoutDashboard, Upload, HelpCircle, Shield, Calendar, Settings, Users, BookOpen, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SEARCH_ITEMS = [
  { label: 'IQ™ Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'Pages', tags: ['home', 'metrics', 'score', 'iq', 'overview'] },
  { label: 'Document Upload', path: '/upload', icon: Upload, group: 'Pages', tags: ['upload', 'file', 'document', 'pdf'] },
  { label: 'Data Room', path: '/data-room', icon: FolderOpen, group: 'Pages', tags: ['files', 'documents', 'storage'] },
  { label: 'Document Requests', path: '/document-requests', icon: FileText, group: 'Pages', tags: ['requests', 'pending', 'required'] },
  { label: 'Profit Gap', path: '/assessments/profit-gap', icon: Target, group: 'Assessments', tags: ['profit', 'margin', 'gap', 'revenue'] },
  { label: 'Value Gap', path: '/assessments/value-gap', icon: Target, group: 'Assessments', tags: ['value', 'enterprise', 'multiple', 'ebitda'] },
  { label: 'Recast EBITDA', path: '/assessments/recast-ebitda', icon: Target, group: 'Assessments', tags: ['recast', 'ebitda', 'addbacks'] },
  { label: 'Tax Gap Engine', path: '/assessments/tax-gap', icon: Target, group: 'Assessments', tags: ['tax', 'savings', 'strategies'] },
  { label: 'Operations Gap', path: '/assessments/operations-gap', icon: Target, group: 'Assessments', tags: ['operations', 'efficiency', 'owner dependency'] },
  { label: 'Freedom Assessment', path: '/assessments/freedom', icon: Target, group: 'Assessments', tags: ['freedom', 'retirement', 'independence'] },
  { label: 'Cost of Inaction', path: '/assessments/cost-of-inaction', icon: Target, group: 'Assessments', tags: ['cost', 'inaction', 'risk'] },
  { label: 'Strategic Sprint', path: '/assessments/roadmap', icon: Target, group: 'Assessments', tags: ['sprint', 'strategy', 'plan'] },
  { label: 'Command Center', path: '/advisory/command-center', icon: Compass, group: 'Advisory', tags: ['sprint', 'opportunities', 'vault', '90 day', 'galileo'] },
  { label: 'Exit Readiness', path: '/advisory/exit-readiness', icon: Shield, group: 'Advisory', tags: ['exit', 'readiness', 'checklist'] },
  { label: 'M&A Simulator', path: '/advisory/ma-simulator', icon: Compass, group: 'Advisory', tags: ['ma', 'merger', 'acquisition', 'simulator'] },
  { label: 'Resource Library', path: '/advisory/resources', icon: BookOpen, group: 'Advisory', tags: ['resources', 'library', 'articles'] },
  { label: 'Agreements', path: '/agreements', icon: FileText, group: 'Pages', tags: ['agreements', 'contracts', 'signature'] },
  { label: 'Calendar Sync', path: '/calendar-sync', icon: Calendar, group: 'Pages', tags: ['calendar', 'sync', 'schedule'] },
  { label: 'Knowledge Base', path: '/knowledge-base', icon: BookOpen, group: 'Pages', tags: ['knowledge', 'insights', 'base'] },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Pages', tags: ['settings', 'profile', 'preferences'] },
  { label: 'Support', path: '/support', icon: HelpCircle, group: 'Pages', tags: ['help', 'support', 'contact'] },
  { label: 'My Team', path: '/team', icon: Users, group: 'Pages', tags: ['team', 'members', 'invite'] },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results = query.trim()
    ? SEARCH_ITEMS.filter(item => {
        const q = query.toLowerCase();
        return item.label.toLowerCase().includes(q) || item.tags.some(t => t.includes(q)) || item.group.toLowerCase().includes(q);
      })
    : SEARCH_ITEMS;

  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleSelect = (item) => {
    navigate(item.path);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[selectedIdx]) handleSelect(results[selectedIdx]);
  };

  // Group results
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  // Flat index for keyboard nav
  const flat = results;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md text-xs transition-colors"
        style={{ background: '#0D0D10', border: '1px solid #24242A', color: '#9CA3AF' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#3a3a42'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#24242A'}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search...</span>
        <kbd className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a1a1e', border: '1px solid #2a2a32', color: '#666' }}>⌘K</kbd>
      </button>

      {/* Mobile icon */}
      <button onClick={() => setOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground">
        <Search className="w-4.5 h-4.5" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: '#141418', border: '1px solid #2a2a32' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #2a2a32' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: '#9CA3AF' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, assessments, features..."
                className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground"
                style={{ color: '#F5F5F5' }}
              />
              {query && (
                <button onClick={() => setQuery('')} style={{ color: '#9CA3AF' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: '#1a1a1e', border: '1px solid #2a2a32', color: '#666' }}>ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">No results for "{query}"</p>
              ) : (
                Object.entries(grouped).map(([group, items]) => (
                  <div key={group}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: '#555' }}>{group}</p>
                    {items.map((item) => {
                      const flatIdx = flat.indexOf(item);
                      const isSelected = flatIdx === selectedIdx;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIdx(flatIdx)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                          style={{ background: isSelected ? 'rgba(212,167,44,0.08)' : 'transparent' }}
                        >
                          <Icon className="w-4 h-4 shrink-0" style={{ color: isSelected ? '#D4A72C' : '#555' }} />
                          <span className="flex-1 text-sm" style={{ color: isSelected ? '#F5F5F5' : '#aaa' }}>{item.label}</span>
                          {isSelected && <ArrowRight className="w-3.5 h-3.5" style={{ color: '#D4A72C' }} />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 flex items-center gap-4 text-[10px]" style={{ borderTop: '1px solid #2a2a32', color: '#444' }}>
              <span><kbd className="px-1 rounded" style={{ background: '#1a1a1e', border: '1px solid #2a2a32' }}>↑↓</kbd> navigate</span>
              <span><kbd className="px-1 rounded" style={{ background: '#1a1a1e', border: '1px solid #2a2a32' }}>↵</kbd> open</span>
              <span><kbd className="px-1 rounded" style={{ background: '#1a1a1e', border: '1px solid #2a2a32' }}>ESC</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}