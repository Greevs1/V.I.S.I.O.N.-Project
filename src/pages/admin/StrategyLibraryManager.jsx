import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Power, Database, RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import StrategyEditor from '@/components/admin/StrategyEditor';
import NeedsMappingReview from '@/components/admin/NeedsMappingReview';

const CATEGORY_COLORS = {
  tax: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  profit: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  operations: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  value: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cash_flow: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  protection: 'bg-red-500/15 text-red-400 border-red-500/30',
  wealth: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  freedom: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const DIFFICULTY_COLORS = {
  easy: 'text-emerald-400',
  medium: 'text-amber-400',
  advanced: 'text-red-400',
};

export default function StrategyLibraryManager() {
  const { role, supabaseProfile } = useAuth();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('library');

  const isSuperAdmin = role === 'super_admin' || supabaseProfile?.app_role === 'super_admin';

  useEffect(() => {
    if (isSuperAdmin) loadStrategies();
  }, [isSuperAdmin]);

  async function loadStrategies() {
    setLoading(true);
    const res = await base44.functions.invoke('strategyLibrary', { action: 'list' });
    setStrategies(res?.data?.strategies || []);
    setLoading(false);
  }

  async function handleSeed() {
    setSeeding(true);
    setSeedMessage('');
    const res = await base44.functions.invoke('strategyLibrary', { action: 'seed' });
    setSeedMessage(res?.data?.message || 'Seeding complete');
    await loadStrategies();
    setSeeding(false);
  }

  async function handleDeactivate(id) {
    await base44.functions.invoke('strategyLibrary', { action: 'deactivate', data: { id } });
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, active: false } : s));
  }

  async function handleSaveStrategy(strategyData) {
    if (strategyData.id) {
      await base44.functions.invoke('strategyLibrary', { action: 'update', data: strategyData });
    } else {
      await base44.functions.invoke('strategyLibrary', { action: 'create', data: strategyData });
    }
    setShowEditor(false);
    setEditingStrategy(null);
    loadStrategies();
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access restricted to Super Admins.</p>
      </div>
    );
  }

  const categories = ['all', ...new Set(strategies.map(s => s.category).filter(Boolean))];
  const filtered = strategies.filter(s => {
    const matchCat = activeCategory === 'all' || s.category === activeCategory;
    const matchSearch = !searchQuery || s.strategy_name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const groupedByCategory = filtered.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold" style={{ color: '#F5F5F5' }}>
            Strategy Intelligence Library
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {strategies.length} strategies · {strategies.filter(s => s.active).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('library')}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${activeTab === 'library' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Library
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${activeTab === 'mapping' ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Needs Mapping Review
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeed}
            disabled={seeding}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            <Database className="w-4 h-4 mr-2" />
            {seeding ? 'Seeding...' : 'Seed Strategies'}
          </Button>
          <Button
            size="sm"
            onClick={() => { setEditingStrategy(null); setShowEditor(true); }}
            className="bg-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Strategy
          </Button>
        </div>
      </div>

      {seedMessage && (
        <div className="px-4 py-3 rounded-lg text-sm text-emerald-400 border border-emerald-500/30 bg-emerald-500/10">
          {seedMessage}
        </div>
      )}

      {activeTab === 'mapping' ? (
        <NeedsMappingReview />
      ) : (
      <>
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search strategies..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-white/10 text-muted-foreground hover:border-white/20'
              }`}
            >
              {cat === 'all' ? 'All' : cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Strategy Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No strategies found. Click "Seed Strategies" to populate the library.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByCategory).map(([category, catStrategies]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${CATEGORY_COLORS[category] || 'bg-white/5 text-foreground border-white/10'}`}>
                  {category.replace('_', ' ')}
                </span>
                <span className="text-xs text-muted-foreground">{catStrategies.length} strategies</span>
              </div>
              <div className="space-y-2">
                {catStrategies.map(strategy => (
                  <div
                    key={strategy.id}
                    className={`rounded-xl border transition-colors ${strategy.active ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 bg-white/[0.01] opacity-50'}`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground">{strategy.strategy_name}</p>
                          {!strategy.active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{strategy.description}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs shrink-0">
                        <span className={`font-medium ${DIFFICULTY_COLORS[strategy.implementation_difficulty] || 'text-muted-foreground'}`}>
                          {strategy.implementation_difficulty}
                        </span>
                        <span className="text-muted-foreground">{strategy.implementation_days}d</span>
                        <span className="text-primary font-semibold">{strategy.confidence_score}% conf</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedId(expandedId === strategy.id ? null : strategy.id)}
                          className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedId === strategy.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => { setEditingStrategy(strategy); setShowEditor(true); }}
                          className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {strategy.active && (
                          <button
                            onClick={() => handleDeactivate(strategy.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {expandedId === strategy.id && (
                      <div className="px-4 pb-4 pt-0 border-t border-white/5 mt-0">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Profit Impact</p>
                            <p className="text-sm font-medium text-foreground">
                              {strategy.expected_profit_impact_value ? `${strategy.expected_profit_impact_type === 'percentage' ? strategy.expected_profit_impact_value + '%' : '$' + strategy.expected_profit_impact_value?.toLocaleString()}` : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tax Impact</p>
                            <p className="text-sm font-medium text-foreground">
                              {strategy.expected_tax_impact_value ? `${strategy.expected_tax_impact_type === 'percentage' ? strategy.expected_tax_impact_value + '%' : '$' + strategy.expected_tax_impact_value?.toLocaleString()}` : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Value Impact</p>
                            <p className="text-sm font-medium text-foreground">
                              {strategy.expected_value_impact_value ? `${strategy.expected_value_impact_type === 'percentage' ? strategy.expected_value_impact_value + '%' : '$' + strategy.expected_value_impact_value?.toLocaleString()}` : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Freedom Acceleration</p>
                            <p className="text-sm font-medium text-foreground">
                              {strategy.expected_freedom_acceleration_months ? `${strategy.expected_freedom_acceleration_months} months` : 'N/A'}
                            </p>
                          </div>
                        </div>
                        {strategy.ideal_client_profile && (
                          <p className="text-xs text-muted-foreground mt-3">
                            <span className="text-foreground/60 font-medium">Ideal client: </span>
                            {strategy.ideal_client_profile}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {/* Strategy Editor Modal */}
      {showEditor && (
        <StrategyEditor
          strategy={editingStrategy}
          onSave={handleSaveStrategy}
          onClose={() => { setShowEditor(false); setEditingStrategy(null); }}
        />
      )}
    </div>
  );
}