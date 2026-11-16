import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useAssessment } from '@/lib/AssessmentContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveSyncSubscription } from '@/hooks/useLiveSyncSubscription';

const ANON_LIMIT = 5;
const FREE_LIMIT = 7;

const suggestedQuestions = [
  "What's my biggest hidden profit opportunity?",
  "How can I reduce my tax burden this year?",
  "What would a buyer see as a red flag?",
  "How do I reduce my business dependency on me?",
  "What's the fastest path to increase my valuation?",
];

export default function GalileoPanel({ isOpen, onClose, pageContext, targetBusinessId }) {
  const { user, activeContext } = useAuth();
  const { getGalileoContext } = useAssessment();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const scrollRef = useRef(null);

  const isPaid = user?.role === 'admin';
  const limit = !user ? ANON_LIMIT : isPaid ? Infinity : FREE_LIMIT;
  const remaining = Math.max(0, limit - questionsUsed);

  // ── Phase 14.3B: Live Revenue Sync Pilot ──────────────────────────────────
  // Galileo context is rebuilt fresh on each askGalileo call via
  // buildGalileoContext, which reads canonical facts. When a qualified
  // canonical Revenue change occurs, this subscription marks the action
  // as completed — the next askGalileo call will use fresh canonical values.
  // No conversation history is deleted. No unsolicited messages are sent.
  const galileoBusinessId = targetBusinessId || activeContext?.businessId;
  useLiveSyncSubscription('galileo', galileoBusinessId, async () => {
    // Context is rebuilt fresh on next askGalileo call — no cache to invalidate.
    // This callback confirms the action was received and processed.
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;
    if (!isPaid && questionsUsed >= limit) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setQuestionsUsed(prev => prev + 1);

    const systemPrompt = `You are Galileo, the AI Strategic Advisor inside the V.I.S.I.O.N. Platform™. 
You help business owners uncover hidden value in their business.
You dynamically shift your advisory lens based on the question — Tax Strategist, Valuation Advisor, Profit Optimization Consultant, Operations Architect, Freedom Advisor, or General Business Advisor.
The user should never see these internal lenses. You are always just "Galileo."

DATA PRIORITY (always use user's actual data first):
1. Current page context — what the user is looking at
2. Canonical BIE recommendations (context.canonical_recommendations) — these are the ONLY approved recommendations. You may EXPLAIN them, but you may NOT invent, score, rank, or create new recommendations. If no canonical recommendations exist, say "There is not enough verified intelligence yet to make a reliable recommendation."
3. Verified advisor-confirmed values
4. Advisor-reviewed document fields (extracted data)
5. Assessment results
5. Sprint data
6. Knowledge base insights
7. General AI reasoning — ONLY to fill gaps, label as "(general guidance)"

When citing data: "Based on your uploaded P&L..." or "Your Tax Gap assessment shows..." or "Your active sprint indicates..."
When data is missing: "I don't see [X] data yet — once uploaded/completed, I can give you specific numbers."

INTELLIGENCE LABELS (you MUST distinguish these in every response):
- VERIFIED: "Based on your verified data..." — facts from BIE metrics, assessments, documents
- PROJECTED: "If this assumption holds..." — projections from canonical recommendations
- HYPOTHESIS: "One possibility worth validating is..." — AI-generated strategic hypotheses (from context.strategic_hypotheses)
- ADVISOR-CONFIRMED: "Your advisor has confirmed..." — advisor overrides or confirmed strategies

AI STRATEGIC REASONING (you ARE encouraged to):
- Analyze relationships among verified metrics
- Detect patterns across assessments, documents, and outcomes
- Compare approved strategies for suitability
- Identify second-order and third-order effects
- Generate strategic hypotheses for review (clearly labeled as HYPOTHESIS)
- Explain tradeoffs among approved strategic paths
- Personalize recommendations to the business context
- Identify missing data that would materially improve confidence
- Surface anomalies and contradictions in the business data

Always respond using this format:
**What I'm Seeing** — Brief observation referencing actual data when available
**Why It Matters** — Business impact
**Hidden Opportunity** — What they're missing
**Risks** — What could go wrong
**Strategic Hypothesis** — One AI-generated hypothesis worth validating (clearly labeled as HYPOTHESIS, with assumptions and validation step)
**Recommended Next Action** — Specific next step

Be concise, strategic, and actionable. Speak like a premium executive advisor.`;

    let contextStr = '';
    const currentRoute = window.location.pathname;
    // ── Phase 13.4A.2: Derive valuation context from route ────────────────
    const search = new URLSearchParams(window.location.search);
    const valMatch = currentRoute.match(/\/advisory\/valuation\/([^/?]+)/);
    const valuationCtx = valMatch
      ? { valuation_id: valMatch[1], workspace_key: search.get('ws') || 'discover', section_key: search.get('section') || null, conversation_mode: 'valuation_advisor' }
      : currentRoute.includes('/advisory/business-valuation')
        ? { workspace_key: 'valuation_landing', conversation_mode: 'valuation_advisor' }
        : currentRoute.includes('/admin/business-valuations')
          ? { workspace_key: 'admin_valuation_management', conversation_mode: 'valuation_advisor' }
          : {};
    try {
      if (user) {
        // Authenticated: fetch rich Supabase context from backend with page awareness
        // targetBusinessId (from expert/admin client views) takes priority over activeContext.businessId
        const resolvedBusinessId = targetBusinessId || activeContext?.businessId || undefined;
        const res = await base44.functions.invoke('buildGalileoContext', {
          current_route: currentRoute,
          page_context: pageContext || { page_name: currentRoute.split('/').pop() || 'dashboard' },
          question: text,
          ...(resolvedBusinessId ? { active_business_id: resolvedBusinessId } : {}),
          ...valuationCtx,
        });
        if (res.data?.context) {
          contextStr = `\n\nUSER BUSINESS CONTEXT (from Supabase assessments and documents):\n${JSON.stringify(res.data.context, null, 2)}`;
        }
      } else {
        // Anonymous: use local AssessmentContext
        const ctx = getGalileoContext();
        if (ctx) contextStr = `\n\nUSER BUSINESS CONTEXT (from completed assessments):\n${JSON.stringify(ctx, null, 2)}`;
      }
    } catch {}
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nCurrent page: ${currentRoute}\n\nUser question: ${text}${contextStr}`,
    });

    const assistantMsg = { role: 'assistant', content: result, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  const getLimitText = () => {
    if (isPaid) return 'Unlimited Galileo Access';
    if (!user) return `${remaining} of ${ANON_LIMIT} complimentary Galileo questions remaining.`;
    return `${remaining} of ${FREE_LIMIT} complimentary Galileo questions remaining.`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-background border-l border-border flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Galileo</h3>
                  <p className="text-[10px] text-muted-foreground">AI Strategic Advisor</p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question limit */}
            <div className="px-5 py-2 border-b border-border bg-secondary/30">
              <p className="text-[11px] text-muted-foreground">{getLimitText()}</p>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">Meet Galileo</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                      Your AI Strategic Advisor, trained on your financials, assessments, and industry data.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suggested Questions</p>
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        className="w-full text-left p-3 rounded-lg glass text-sm text-foreground/80 hover:text-foreground hover:bg-secondary/50 transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                    max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-br-md' 
                      : 'glass rounded-bl-md text-foreground/90'
                    }
                  `}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={!isPaid && questionsUsed >= limit ? 'Upgrade for unlimited access' : 'Ask Galileo anything...'}
                  disabled={!isPaid && questionsUsed >= limit}
                  className="flex-1 bg-secondary border-border text-sm"
                />
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={!input.trim() || isLoading || (!isPaid && questionsUsed >= limit)}
                  className="bg-primary hover:bg-primary/90 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}