import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, Calculator, User, TrendingUp } from 'lucide-react';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

const sourceConfig = {
  advisor_review: {
    label: 'Advisor Reviewed',
    icon: CheckCircle2,
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  assessment: {
    label: 'Assessment Estimate',
    icon: Calculator,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  calculation_engine: {
    label: 'Assessment Calculation',
    icon: Calculator,
    color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
  document: {
    label: 'Document Based',
    icon: FileText,
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  manual: {
    label: 'Manual Entry',
    icon: User,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
};

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
};

const formatConfidence = (score) => {
  if (score === null || score === undefined) return '—';
  return `${parseFloat(score).toFixed(1)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

export default function FinancialSnapshotCard({ snapshot }) {
  const sourceType = snapshot?.data_source || 'assessment';
  const config = sourceConfig[sourceType] || sourceConfig.assessment;
  const SourceIcon = config.icon;

  // Check if snapshot has any financial data (direct columns or data JSON)
  const hasData = snapshot && (
    snapshot.annual_revenue != null ||
    snapshot.gross_profit != null ||
    snapshot.net_profit != null ||
    snapshot.ebitda != null ||
    snapshot.owner_compensation != null ||
    snapshot.total_debt != null ||
    snapshot.cash_on_hand != null ||
    snapshot.total_assets != null ||
    (snapshot.data && Object.keys(snapshot.data).length > 0)
  );

  if (!hasData) {
    return (
      <Card className="border-border">
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Financial Snapshot</h3>
            <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
              <FileText className="w-3 h-3 mr-1" />
              No Data
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No reviewed financial snapshot yet
          </p>
        </CardContent>
      </Card>
    );
  }

  // Support both direct columns and legacy data JSON
  const data = snapshot.data || snapshot;
  const annualRevenue = snapshot.annual_revenue ?? data.annual_revenue;
  const grossProfit = snapshot.gross_profit ?? data.gross_profit;
  const netProfit = snapshot.net_profit ?? data.net_profit;
  const ebitda = snapshot.ebitda ?? data.ebitda;
  const ownerCompensation = snapshot.owner_compensation ?? data.owner_compensation;
  const totalDebt = snapshot.total_debt ?? data.total_debt;
  const cashOnHand = snapshot.cash_on_hand ?? data.cash_on_hand;
  const totalAssets = snapshot.total_assets ?? data.total_assets;

  return (
    <Card className="border-border">
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Financial Snapshot</h3>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>
              <SourceIcon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Revenue</p>
            <p className="text-sm font-semibold">
              {formatCurrency(annualRevenue)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Gross Profit</p>
            <p className="text-sm font-semibold">
              {formatCurrency(grossProfit)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className="text-sm font-semibold">
              {formatCurrency(netProfit)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              <ExplainableText text="EBITDA" surface="dashboard_snapshot" />
            </p>
            <p className="text-sm font-semibold">
              {formatCurrency(ebitda)}
            </p>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Owner Compensation</p>
            <p className="text-sm font-semibold">
              {formatCurrency(ownerCompensation)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Debt</p>
            <p className="text-sm font-semibold">
              {formatCurrency(totalDebt)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cash on Hand</p>
            <p className="text-sm font-semibold">
              {formatCurrency(cashOnHand)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-sm font-semibold">
              {formatCurrency(totalAssets)}
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border text-xs">
          <div>
            <p className="text-muted-foreground mb-1">Data Confidence</p>
            <p className="text-sm font-semibold">
              {formatConfidence(snapshot.data_confidence_score ?? data.data_confidence_score)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Snapshot Date</p>
            <p className="text-sm font-semibold">
              {formatDate(snapshot.snapshot_date ?? data.snapshot_date)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Source</p>
            <p className="text-sm font-semibold capitalize">
              {snapshot.data_source?.replace(/_/g, ' ') || data.data_source?.replace(/_/g, ' ') || 'Assessment'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}