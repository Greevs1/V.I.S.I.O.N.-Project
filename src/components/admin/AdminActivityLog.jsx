import React, { useState } from 'react';
import { Activity, User, FileText, Settings, LogIn, TrendingUp } from 'lucide-react';

const EVENTS = [
  { id: 1, user: 'John Doe', action: 'Completed Profit Gap Assessment', time: '2 mins ago', icon: TrendingUp, color: '#a855f7' },
  { id: 2, user: 'Sarah Smith', action: 'Uploaded Q4 Financials', time: '15 mins ago', icon: FileText, color: '#D4A853' },
  { id: 3, user: 'Mike Johnson', action: 'Logged in', time: '1 hour ago', icon: LogIn, color: '#22c55e' },
  { id: 4, user: 'Emily Davis', action: 'Updated organization settings', time: '3 hours ago', icon: Settings, color: '#00D4FF' },
  { id: 5, user: 'John Doe', action: 'Viewed Tax Gap Engine', time: '5 hours ago', icon: Activity, color: '#D4A853' },
  { id: 6, user: 'Sarah Smith', action: 'Completed Value Gap Assessment', time: '1 day ago', icon: TrendingUp, color: '#a855f7' },
  { id: 7, user: 'New User', action: 'Account created', time: '2 days ago', icon: User, color: '#22c55e' },
];

export default function AdminActivityLog() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold">Platform Activity Log</p>
        <p className="text-xs text-muted-foreground mt-0.5">All user actions across the platform.</p>
      </div>
      <div className="divide-y divide-border/50">
        {EVENTS.map(e => {
          const Icon = e.icon;
          return (
            <div key={e.id} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${e.color}20` }}>
                <Icon className="w-4 h-4" style={{ color: e.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{e.user}</p>
                <p className="text-xs text-muted-foreground truncate">{e.action}</p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">{e.time}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}