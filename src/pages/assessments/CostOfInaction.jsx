import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function CostOfInaction() {
  const [rate, setRate] = useState(6);
  const annualLoss = 83000;

  const generateData = (r) => {
    const data = [];
    let cumulative = 0;
    for (let y = 1; y <= 10; y++) {
      cumulative += annualLoss * Math.pow(1 + r / 100, y - 1);
      data.push({ year: `Year ${y}`, cost: Math.round(cumulative) });
    }
    return data;
  };

  const data = generateData(rate);
  const totalCost = data[data.length - 1]?.cost || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Cost of Inaction</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What happens if you don't close these gaps? See the compounding impact over time.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Reinvestment Rate:</span>
        {[4, 6, 8, 10, 12].map(r => (
          <button
            key={r}
            onClick={() => setRate(r)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${rate === r ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}
          >
            {r}%
          </button>
        ))}
      </div>

      <div className="glass rounded-xl p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fill: 'hsl(0, 0%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(0, 0%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ background: 'hsl(0, 0%, 8%)', border: '1px solid hsl(0, 0%, 16%)', borderRadius: '8px', fontSize: '12px' }} formatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Area type="monotone" dataKey="cost" stroke="#EF4444" strokeWidth={2} fill="url(#costGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-gold rounded-xl p-8 text-center">
        <p className="text-xs text-muted-foreground mb-2">Total 10-Year Cost at {rate}%</p>
        <p className="text-5xl font-display font-bold text-destructive">${(totalCost / 1000000).toFixed(1)}M</p>
        <p className="text-sm text-muted-foreground mt-3">Every day of inaction compounds the cost.</p>
      </div>

      <div className="flex justify-between">
        <Link to="/assessments/freedom">
          <Button variant="outline">← Back</Button>
        </Link>
        <Link to="/assessments/roadmap">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            View Strategic Sprint →
          </Button>
        </Link>
      </div>
    </div>
  );
}