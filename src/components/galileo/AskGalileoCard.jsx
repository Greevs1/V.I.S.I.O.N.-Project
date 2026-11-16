import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMembership } from '@/lib/useMembership';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Lock, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STARTER_QUESTIONS = [
  'What should I focus on next?',
  'What is hurting my business value most?',
  'What tax opportunities am I missing?',
  'How can I improve profit?',
  'What should I do in the next 90 days?',
  'What documents do you still need?',
  'What sprint tasks should I finish first?',
];

const CONFIDENCE_COLORS = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-muted-foreground',
};

const CATEGORY_LABELS = {
  next_best_action: 'Next Action',
  tax: 'Tax Strategy',
  profit: 'Profit',
  valuation: 'Valuation',
  cash_flow: 'Cash Flow',
  operations: 'Operations',
  protection: 'Protection',
  wealth: 'Wealth',
  roadmap: 'Sprint',
  documents: 'Data Room',
  general: 'General',
};

function MessageBubble({ msg, onUpgrade }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center mr-2 mt-1 shrink-0">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-primary text-primary-foreground rounded-br-sm' : 'glass text-foreground/90 rounded-bl-sm'
        }`}>
          {msg.content}
        </div>
        {!isUser && msg.meta && (
          <div className="flex flex-wrap gap-2 px-1">
            {msg.meta.category && (
              <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-secondary/50">
                {CATEGORY_LABELS[msg.meta.category] || msg.meta.category}
              </span>
            )}
            {msg.meta.confidence_level && (
              <span className={`text-[10px] ${CONFIDENCE_COLORS[msg.meta.confidence_level]}`}>
                {msg.meta.confidence_level} confidence
              </span>
            )}
          </div>
        )}
        {!isUser && msg.meta?.supporting_sources?.length > 0 && (
          <div className="px-1 space-y-0.5">
            {msg.meta.supporting_sources.map((src, i) => (
              <p key={i} className="text-[10px] text-muted-foreground/60">↳ {src}</p>
            ))}
          </div>
        )}
        {!isUser && msg.meta?.missing_data?.length > 0 && (
          <div className="px-1">
            <p className="text-[10px] text-muted-foreground/50">Missing: {msg.meta.missing_data.join(' · ')}</p>
          </div>
        )}
        {!isUser && msg.meta?.recommended_next_step && (
          <div className="px-1">
            <p className="text-[10px] text-foreground/50">→ {msg.meta.recommended_next_step}</p>
          </div>
        )}
        {!isUser && msg.meta?._is_gated && msg.meta?._gated_detail_available && (
          <div className="px-1 flex items-center gap-1">
            <Lock className="w-3 h-3 text-muted-foreground/40" />
            <button
              onClick={onUpgrade}
              className="text-[10px] text-muted-foreground/40 hover:text-primary transition-colors underline"
            >
              Upgrade for full implementation detail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AskGalileoCard({ targetBusinessId, valuationId, workspaceKey, sectionKey }) {
  const { isPaid } = useMembership();
  const { activeContext } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [showStarters, setShowStarters] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendQuestion = async (question) => {
    if (!question?.trim() || loading) return;
    setShowStarters(false);

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);

    try {
      // targetBusinessId (expert/admin client views) takes priority over activeContext.businessId
      const resolvedBusinessId = targetBusinessId || activeContext?.businessId || undefined;
      const res = await base44.functions.invoke('askGalileo', {
        question,
        membership_status: isPaid ? 'paid' : 'free',
        conversation_id: conversationId || undefined,
        ...(resolvedBusinessId ? { active_business_id: resolvedBusinessId } : {}),
        ...(valuationId ? { valuation_id: valuationId } : {}),
        ...(workspaceKey ? { workspace_key: workspaceKey } : {}),
        ...(sectionKey ? { section_key: sectionKey } : {}),
        conversation_mode: valuationId ? 'valuation_advisor' : 'general',
      });

      const data = res.data;
      if (data?.error) throw new Error(data.error);

      if (data?.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      const r = data?.response;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: r?.answer || 'No response generated.',
        meta: r,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Unable to get a response: ${e.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const resetConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowStarters(true);
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Ask Galileo</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full border border-border">AI</span>
          {!isPaid && (
            <span className="text-[10px] text-muted-foreground/60">Free — brief answers</span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={resetConversation}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
          >
            New
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="px-5 py-4 space-y-4 max-h-[420px] overflow-y-auto">
        {/* Starter questions */}
        {showStarters && messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suggested Questions</p>
            <div className="grid grid-cols-1 gap-1.5">
              {STARTER_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendQuestion(q)}
                  className="text-left text-xs text-foreground/70 hover:text-foreground px-3 py-2 rounded-lg glass hover:bg-secondary/40 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onUpgrade={() => navigate('/strategy-call')} />
        ))}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
            <div className="glass rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1.5">
                {[0, 150, 300].map(delay => (
                  <div key={delay} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 border-t border-border pt-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your business..."
            disabled={loading}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading} className="shrink-0 h-9 w-9">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}