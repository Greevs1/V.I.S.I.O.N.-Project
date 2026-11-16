import React, { useState } from 'react';
import { Check, ExternalLink, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const INTEGRATIONS = [
  { id: 'zapier', name: 'Zapier', desc: 'Connect to 5,000+ apps and automate workflows.', status: 'disconnected', category: 'Automation' },
  { id: 'hubspot', name: 'HubSpot', desc: 'Sync clients and leads to your CRM pipeline.', status: 'disconnected', category: 'CRM' },
  { id: 'salesforce', name: 'Salesforce', desc: 'Enterprise CRM sync for large advisory teams.', status: 'disconnected', category: 'CRM' },
  { id: 'quickbooks', name: 'QuickBooks', desc: 'Auto-import P&L and balance sheet data.', status: 'disconnected', category: 'Accounting' },
  { id: 'xero', name: 'Xero', desc: 'Pull financials directly from Xero accounting.', status: 'disconnected', category: 'Accounting' },
  { id: 'stripe', name: 'Stripe', desc: 'Process payments and manage subscriptions.', status: 'connected', category: 'Payments' },
  { id: 'slack', name: 'Slack', desc: 'Send alerts and notifications to Slack channels.', status: 'disconnected', category: 'Notifications' },
  { id: 'docusign', name: 'DocuSign', desc: 'Send agreements for e-signature directly.', status: 'disconnected', category: 'Documents' },
];

const CATEGORY_COLORS = {
  Automation: 'bg-orange-500/15 text-orange-400',
  CRM: 'bg-cyan-500/15 text-cyan-400',
  Accounting: 'bg-emerald-500/15 text-emerald-400',
  Payments: 'bg-primary/15 text-primary',
  Notifications: 'bg-purple-500/15 text-purple-400',
  Documents: 'bg-blue-500/15 text-blue-400',
};

export default function AdminIntegrations() {
  const [statuses, setStatuses] = useState(() => Object.fromEntries(INTEGRATIONS.map(i => [i.id, i.status])));

  const toggle = (id) => setStatuses(s => ({ ...s, [id]: s[id] === 'connected' ? 'disconnected' : 'connected' }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {INTEGRATIONS.map(intg => {
        const connected = statuses[intg.id] === 'connected';
        return (
          <div key={intg.id} className={`rounded-xl border bg-card p-4 flex items-start gap-4 transition-colors ${connected ? 'border-emerald-500/30' : 'border-border'}`}>
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-lg font-bold text-foreground">
              {intg.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold">{intg.name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[intg.category] || 'bg-secondary text-muted-foreground'}`}>
                  {intg.category}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{intg.desc}</p>
            </div>
            <Button
              variant={connected ? 'default' : 'outline'}
              size="sm"
              className={`shrink-0 h-8 text-xs gap-1 ${connected ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0' : ''}`}
              onClick={() => toggle(intg.id)}
            >
              {connected ? <><Check className="w-3 h-3" /> Connected</> : <><Zap className="w-3 h-3" /> Connect</>}
            </Button>
          </div>
        );
      })}
    </div>
  );
}