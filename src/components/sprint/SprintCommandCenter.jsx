import React, { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import SprintView from '@/components/sprint/SprintView';
import OpportunityVault from '@/components/sprint/OpportunityVault';
import StrategicTimeline from '@/components/sprint/StrategicTimeline';
import SavedPlaybook from '@/components/sprint/SavedPlaybook';
import ExplainWhyModal from '@/components/sprint/ExplainWhyModal';
import ReplacePathModal from '@/components/sprint/ReplacePathModal';
import ConfirmSprintReplaceModal from '@/components/sprint/ConfirmSprintReplaceModal';
import { useAuth } from '@/lib/AuthContext';

const TABS = [
  { key: 'sprint', label: '90-Day Sprint' },
  { key: 'vault', label: 'Opportunity Vault' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'playbook', label: 'Saved Playbook' },
];

export default function SprintCommandCenter({ onOpen }) {
  // Phase 6.9 — every Sprint read AND write must carry the ACTIVE business
  // explicitly. Without it the backend had to guess, and a Sprint created here
  // was stamped with the account's primary business instead of the selected one.
  const { activeContext } = useAuth();
  const activeBusinessId = activeContext?.businessId || null;
  const [activeTab, setActiveTab] = useState('sprint');
  const [explainWhyOpp, setExplainWhyOpp] = useState(null);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [promotingOppId, setPromotingOppId] = useState(null);
  const [promotingOppTitle, setPromotingOppTitle] = useState('');
  const [activePaths, setActivePaths] = useState([]);
  const [selectingAsPath, setSelectingAsPath] = useState(false);
  const [confirmReplaceOpp, setConfirmReplaceOpp] = useState(null);
  const [currentActiveSprint, setCurrentActiveSprint] = useState(null);
  const [sprintKey, setSprintKey] = useState(0);
  const sprintViewRef = useRef(null);

  // Phase 6.9 — the active business must travel with the request. Without it the
  // engine falls back to primary_business_id (or refuses outright), so the paths
  // shown here belonged to whichever business was primary, not the selected one.
  const fetchActivePaths = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'getActivePaths',
        data: { active_business_id: activeBusinessId },
      });
      return res.data?.active_paths || [];
    } catch { return []; }
  }, [activeBusinessId]);

  const handlePromote = async (oppId) => {
    setPromotingOppId(oppId);
    try {
      const paths = await fetchActivePaths();
      if (paths.length >= 3) {
        setActivePaths(paths);
        setPromotingOppTitle('');
        setReplaceModalOpen(true);
      } else {
        await doPromote(oppId);
      }
    } catch (e) {
      console.error('Promote error:', e);
      alert('Failed to promote opportunity: ' + (e?.response?.data?.error || e.message));
    }
    setPromotingOppId(null);
  };

  const doPromote = async (oppId, replacePathId) => {
    try {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'promoteToActive',
        data: { active_business_id: activeBusinessId, opportunityId: oppId, replacePathId: replacePathId || null },
      });
      if (res.data?.sprint) {
        setActiveTab('sprint');
      }
    } catch (e) {
      console.error('Promote error:', e);
      alert('Failed to promote opportunity: ' + (e?.response?.data?.error || e.message));
    }
  };

  // Click from Opportunity Vault → show confirm modal first
  const handleSelectAsPath = async (opp) => {
    // Fetch current active sprint to show in the confirm modal
    try {
      const sprintRes = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprint',
        active_business_id: activeBusinessId,
      });
      setCurrentActiveSprint(sprintRes.data?.sprint || null);
    } catch (_) {
      setCurrentActiveSprint(null);
    }
    setConfirmReplaceOpp(opp);
  };

  // Confirmed: actually execute the replacement
  const handleConfirmReplace = async (opp) => {
    setConfirmReplaceOpp(null);
    setSelectingAsPath(true);
    setActiveTab('sprint'); // switch immediately so the user sees the sprint tab loading
    try {
      const selectRes = await base44.functions.invoke('ninetyDaySprint', {
        action: 'selectPath',
        data: {
          active_business_id: activeBusinessId,
          pathId: opp.category || opp.title?.toLowerCase().replace(/\s+/g, '_'),
          pathTitle: opp.title,
          pathGoal: opp.expected_outcome || opp.description,
          pathSummary: opp.description,
          confidence: opp.confidence_score,
          opportunityBase44Id: opp.id,
        },
      });
      const newSprint = selectRes.data?.sprint;
      if (!newSprint?.id) throw new Error('Failed to create sprint path');

      // Only generate tasks if this is a brand-new sprint (not a restored one)
      if (!selectRes.data?.restored) {
        await base44.functions.invoke('ninetyDaySprint', {
          action: 'generateSprint',
          data: {
            active_business_id: activeBusinessId,
            sprint_id: newSprint.id,
            sprint_title: newSprint.path_title,
            sprint_goal: newSprint.path_goal,
          },
        });
      }

      // Switch to sprint tab and force SprintView to remount with fresh data
      setSprintKey(k => k + 1);
      setActiveTab('sprint');
    } catch (e) {
      console.error('handleConfirmReplace error:', e);
      alert('Failed to select path: ' + (e?.response?.data?.error || e.message));
    }
    setSelectingAsPath(false);
  };

  const handleReplace = async (pathId) => {
    setReplaceModalOpen(false);
    await doPromote(promotingOppId, pathId);
    setPromotingOppId(null);
  };

  return (
    <div className="w-full">
      {/* Tab navigation — horizontal scroll on small screens */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto scrollbar-hide pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-[13px] leading-none rounded-full px-3.5 py-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.key
                ? 'bg-[#252528] text-white font-bold'
                : 'text-[#888888] font-normal hover:text-[#bbbbbb]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'sprint' && <SprintView key={sprintKey} onExplainWhy={setExplainWhyOpp} onOpen={onOpen} />}
      {activeTab === 'vault' && (
        <div className="relative">
          {selectingAsPath && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 rounded-xl">
              <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Building sprint plan...</span>
            </div>
          )}
          <OpportunityVault
            onExplainWhy={setExplainWhyOpp}
            onPromote={handlePromote}
            onSelectAsPath={handleSelectAsPath}
          />
        </div>
      )}
      {activeTab === 'sprint' && selectingAsPath && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Galileo is building your 90-day sprint...</p>
          </div>
        </div>
      )}
      {activeTab === 'timeline' && <StrategicTimeline />}
      {activeTab === 'playbook' && <SavedPlaybook />}

      {explainWhyOpp && (
        <ExplainWhyModal
          opportunity={explainWhyOpp}
          onClose={() => setExplainWhyOpp(null)}
        />
      )}

      <ReplacePathModal
        open={replaceModalOpen}
        onClose={() => { setReplaceModalOpen(false); setPromotingOppId(null); }}
        activePaths={activePaths}
        onReplace={handleReplace}
      />

      {confirmReplaceOpp && (
        <ConfirmSprintReplaceModal
          opportunity={confirmReplaceOpp}
          currentSprint={currentActiveSprint}
          onConfirm={handleConfirmReplace}
          onCancel={() => { setConfirmReplaceOpp(null); setCurrentActiveSprint(null); }}
        />
      )}
    </div>
  );
}