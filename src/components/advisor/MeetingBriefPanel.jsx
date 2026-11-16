import React, { useState } from 'react';
import { useMeetingIntelligence } from '@/hooks/useMeetingIntelligence';
import MeetingIntentSelector from './MeetingIntentSelector';
import MeetingCloseoutDrawer from './MeetingCloseoutDrawer';
import { Sparkles, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, MessageCircle, CheckCircle2 } from 'lucide-react';

export default function MeetingBriefPanel({ businessId, profileId, userEmail }) {
  const [intent, setIntent] = useState('quarterly_review');
  const [showClientSafe, setShowClientSafe] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showCloseout, setShowCloseout] = useState(false);
  const { data: brief, isLoading } = useMeetingIntelligence({ businessId, profileId, userEmail, intent });

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Preparing meeting brief…</p>
      </div>
    );
  }

  if (!brief) return null;

  const summary = brief.meeting_summary;
  const sinceLast = brief.since_last_meeting;
  const celebrate = brief.celebrate;
  const discuss = brief.discuss;
  const decisions = brief.decisions_required;
  const questions = brief.suggested_questions;
  const risks = brief.open_risks;
  const ownerWins = brief.owner_wins;
  const advisorNotes = brief.advisor_notes;

  // Quiet state — no material changes
  const isQuiet =
    sinceLast.completed_items.length === 0 &&
    sinceLast.changed_facts.length === 0 &&
    celebrate.wins.length === 0 &&
    discuss.topics.length === 0 &&
    decisions.decisions.length === 0;

  return (
    <div className="space-y-3">
      {/* Intent Selector + Client-Safe Toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <MeetingIntentSelector intent={intent} onChange={setIntent} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClientSafe(!showClientSafe)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            {showClientSafe ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showClientSafe ? 'Advisor Brief' : 'Client Preview'}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-galileo'))}
            className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Ask Galileo
          </button>
          {!showClientSafe && (
            <button
              onClick={() => setShowCloseout(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Closeout
            </button>
          )}
        </div>
      </div>

      {/* Meeting Summary */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <p className="text-[10px] font-semibold tracking-wider uppercase text-primary">{summary.meeting_intent_label}</p>
        </div>
        <h3 className="text-sm font-semibold">{summary.headline}</h3>
        <p className="text-xs text-muted-foreground mt-1">{summary.one_line_context}</p>
      </div>

      {/* Quiet State */}
      {isQuiet && (
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">No material changes since the last meeting. Continue current priorities.</p>
        </div>
      )}

      {/* Since Last Meeting */}
      {!isQuiet && (sinceLast.completed_items.length > 0 || sinceLast.changed_facts.length > 0) && (
        <BriefSection title="Since Last Meeting">
          {sinceLast.changed_facts.length > 0 && (
            <BulletList items={sinceLast.changed_facts.slice(0, 3)} />
          )}
          {sinceLast.completed_items.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">Completed</p>
              <BulletList items={sinceLast.completed_items.slice(0, 3)} />
            </div>
          )}
        </BriefSection>
      )}

      {/* Celebrate */}
      {celebrate.wins.length > 0 && (
        <BriefSection title="Celebrate" accent="emerald">
          {celebrate.wins.slice(0, 3).map((win, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-emerald-400 text-xs mt-0.5">✓</span>
              <div>
                <p className="text-xs font-medium">{win.headline}</p>
                <p className="text-[11px] text-muted-foreground">{win.why_it_matters}</p>
              </div>
            </div>
          ))}
        </BriefSection>
      )}

      {/* Discuss — Intelligence Budget: 1 primary + max 2 secondary */}
      {discuss.topics.length > 0 && (
        <BriefSection title="Discuss">
          {discuss.topics.slice(0, 3).map((topic, i) => (
            <div key={topic.id} className={i > 0 ? 'mt-2 pt-2 border-t border-border/40' : ''}>
              <p className="text-xs font-medium">{topic.headline}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{topic.why_it_deserves_discussion}</p>
            </div>
          ))}
        </BriefSection>
      )}

      {/* Decisions Needed */}
      {decisions.decisions.length > 0 && (
        <BriefSection title="Decisions Needed" accent="amber">
          {decisions.decisions.slice(0, 5).map((d) => (
            <div key={d.id} className="flex items-start gap-2">
              <span className="text-amber-400 text-xs mt-0.5">▸</span>
              <div>
                <p className="text-xs font-medium">{d.title}</p>
                <p className="text-[11px] text-muted-foreground">{d.context}</p>
              </div>
            </div>
          ))}
        </BriefSection>
      )}

      {/* Suggested Questions — max 3 */}
      {questions.length > 0 && (
        <BriefSection title="Suggested Questions">
          {questions.slice(0, 3).map((q) => (
            <div key={q.id} className="flex items-start gap-2">
              <span className="text-primary text-xs mt-0.5">?</span>
              <p className="text-xs italic text-foreground/80">{q.prompt}</p>
            </div>
          ))}
        </BriefSection>
      )}

      {/* Progressive Disclosure: More Detail */}
      {!showClientSafe && (risks.risks.length > 0 || ownerWins.wins.length > 0 || advisorNotes.notes.length > 0) && (
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {showDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetail ? 'Hide detail' : 'Show detail (risks, wins, notes)'}
        </button>
      )}

      {showDetail && !showClientSafe && (
        <div className="space-y-2">
          {risks.risks.length > 0 && (
            <BriefSection title="Open Risks" accent="red">
              {risks.risks.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className={`text-xs ${r.severity === 'high' ? 'text-red-400' : r.severity === 'medium' ? 'text-amber-400' : 'text-muted-foreground'}`}>●</span>
                  <p className="text-xs">{r.headline}</p>
                </div>
              ))}
            </BriefSection>
          )}
          {ownerWins.wins.length > 0 && (
            <BriefSection title="Owner Wins" accent="emerald">
              {ownerWins.wins.map((w, i) => (
                <p key={i} className="text-xs text-foreground/80">• {w}</p>
              ))}
            </BriefSection>
          )}
          {advisorNotes.notes.length > 0 && (
            <BriefSection title="Advisor Notes (Internal)" accent="primary">
              {advisorNotes.notes.map((n) => (
                <div key={n.id} className="flex items-start gap-2">
                  <span className="text-primary text-xs mt-0.5">→</span>
                  <p className="text-xs text-foreground/70">{n.note}</p>
                </div>
              ))}
            </BriefSection>
          )}
        </div>
      )}

      {/* Client-Safe Notice */}
      {showClientSafe && (
        <div className="glass rounded-lg p-2.5 flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <Eye className="w-3.5 h-3.5 text-emerald-400" />
          <p className="text-[11px] text-emerald-400/80">Client-safe preview — internal notes hidden</p>
        </div>
      )}

      {/* Meeting Closeout Drawer — Phase 15.4 */}
      <MeetingCloseoutDrawer
        open={showCloseout}
        onClose={() => setShowCloseout(false)}
        businessId={businessId}
        profileId={profileId}
        userEmail={userEmail}
        intent={intent}
      />
    </div>
  );
}

function BriefSection({ title, children, accent }) {
  const accentColor = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    primary: 'text-primary',
  }[accent] || 'text-muted-foreground';

  return (
    <div className="glass rounded-xl p-4">
      <p className={`text-[10px] font-semibold tracking-wider uppercase ${accentColor} mb-2`}>{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <p key={i} className="text-xs text-foreground/80">• {item}</p>
      ))}
    </div>
  );
}