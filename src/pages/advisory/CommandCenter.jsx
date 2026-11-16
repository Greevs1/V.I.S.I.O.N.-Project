import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Send, BookOpen, Sparkles, Copy, Check } from 'lucide-react';
import SprintCommandCenter from '@/components/sprint/SprintCommandCenter';
import { useMembership } from '@/lib/useMembership';
import { useAuth } from '@/lib/AuthContext';
import PremiumWorkspaceOverlay from '@/components/premium/PremiumWorkspaceOverlay';

const SUGGESTIONS = [
  'How do I start implementing my $19,500 tax savings?',
  "How can I reduce my business's dependence on me?",
  'What is the most important thing I should focus on right now?',
];

export default function CommandCenter() {
  const { activeContext } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Welcome to the V.I.S.I.O.N. Execution Center. Meet "Galileo" your AI Strategic Advisor. Which implementation playbook would you like to focus on today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [savedToastError, setSavedToastError] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const { isPaid } = useMembership();

  const copyToClipboard = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    const history = [...messages, { role: 'user', content: msg }];
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are Galileo, a V.I.S.I.O.N. Platform Strategic Advisor embedded in the Execution Command Center. The user has completed their business assessments and needs actionable implementation guidance. Be concise, specific, and reference implementation steps when relevant.\n\nUser: ${msg}`,
      response_json_schema: { type: 'object', properties: { reply: { type: 'string' } } }
    });
    setMessages(prev => [...prev, { role: 'assistant', content: res.reply || 'Let me help you with that strategy...' }]);
    setLoading(false);
  };

  const saveToPlaybook = async (content) => {
    try {
      const title = content.length > 80 ? content.substring(0, 80) + '...' : content;
      await base44.functions.invoke('savedPlaybookData', {
        action: 'savePlaybookItem',
        data: {
          title,
          content,
          category: 'strategy',
          saved_from: 'command_center',
          active_business_id: activeContext?.businessId || null,
        },
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      console.error('saveToPlaybook error:', e);
      setSavedToastError(true);
      setTimeout(() => setSavedToastError(false), 2500);
    }
  };

  return (
    <PremiumWorkspaceOverlay isPaid={isPaid} feature="Advisory Hub"
      onScheduleCall={() => { window.location.href = '/strategy-call'; }}
      onBecomeMember={() => { window.location.href = '/strategy-call'; }}>
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-1">Partnership Active</p>
        <h1 className="text-3xl font-display font-bold">Execution Command Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your step-by-step implementation sprint plan. Follow the playbooks below, and use the AI Advisor for contextual guidance on any step.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6" style={{ minHeight: '500px' }}>
        {/* Main Content — 90-Day Sprint */}
        <div className="min-w-0">
          <SprintCommandCenter />
        </div>

        {/* Galileo Chat Panel */}
        <div className="flex flex-col glass rounded-xl overflow-hidden" style={{ minHeight: '500px', maxHeight: '80vh' }}>
          <div className="p-4 border-b border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Meet "Galileo" your AI Strategic Advisor</p>
              <p className="text-[10px] text-muted-foreground">Context-aware coaching & guidance</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div className={`inline-block rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[90%] ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                }`}>
                  {m.content}
                </div>
                {m.role === 'assistant' && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => saveToPlaybook(m.content)}
                      className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 whitespace-nowrap"
                    >
                      <BookOpen className="w-3 h-3" /> Save to Playbook
                    </button>
                    <button
                      onClick={() => copyToClipboard(m.content, i)}
                      className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 whitespace-nowrap"
                    >
                      {copiedId === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId === i ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="bg-secondary rounded-xl px-3 py-2 text-xs text-muted-foreground inline-block">
                <span className="animate-pulse">Galileo is thinking...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          <div className="px-3 pb-2 space-y-1">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => send(s)} className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground bg-secondary/50 rounded-lg px-2 py-1.5 transition-colors">
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2 items-center border border-border rounded-lg bg-secondary px-3 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask your advisor..."
                className="flex-1 bg-transparent outline-none text-xs"
                disabled={loading}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="w-7 h-7 rounded-full bg-primary flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">AI Advisor uses your uploaded financials to provide context</p>
          </div>

          {/* Save toast */}
          {savedToast && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-full whitespace-nowrap z-10">
              ✓ Saved to playbook
            </div>
          )}
          {savedToastError && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-red-700 text-white text-xs px-3 py-1.5 rounded-full whitespace-nowrap z-10">
              ✗ Failed to save
            </div>
          )}
        </div>
        </div>

        </div>
        </PremiumWorkspaceOverlay>
        );
        }