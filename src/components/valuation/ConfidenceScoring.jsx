/**
 * ConfidenceScoring — Phase 13.3
 * Data, earnings, market, and operational confidence scores.
 * Overall confidence is a weighted combination.
 */
import React, { useState, useEffect } from 'react';
import { getConfidenceScores, saveConfidenceScore, calculateOverallConfidence } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, Shield } from 'lucide-react';

const CATEGORIES = {
  data: { label: 'Data Confidence', sub: ['Financial statement completeness', 'Tax-return reconciliation', 'Document quality', 'Historical depth', 'Extraction confidence', 'Source conflicts', 'Missing periods'] },
  earnings: { label: 'Earnings Confidence', sub: ['Adjustment support', 'Recurring vs nonrecurring evidence', 'Replacement compensation', 'Forecast consistency', 'Margin stability'] },
  market: { label: 'Market Confidence', sub: ['Benchmark quality', 'Benchmark recency', 'Sample size', 'Industry match', 'Size match', 'Geography match', 'Transaction relevance'] },
  operational: { label: 'Operational Confidence', sub: ['Customer data', 'Revenue-quality data', 'Management information', 'Contract evidence', 'Transferability evidence'] },
};

const DEFAULT_WEIGHTS = { data: 30, earnings: 30, market: 20, operational: 20 };

export default function ConfidenceScoring({ valuationId }) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [overall, setOverall] = useState(null);

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getConfidenceScores(valuationId);
      setScores(res.confidenceScores || []);
      const ov = (res.confidenceScores || []).find(s => s.is_overall);
      if (ov) setOverall(ov);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleSave = async (category, subCategory, score) => {
    try {
      await saveConfidenceScore(valuationId, category, subCategory, score, 100, '', '');
      await load();
    } catch (err) { setError(err.message); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const res = await calculateOverallConfidence(valuationId, DEFAULT_WEIGHTS);
      setOverall({ score: res.overall_confidence });
      await load();
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const getScore = (category, subCategory) => {
    const s = scores.find(s => s.category === category && s.sub_category === subCategory && !s.is_overall);
    return s?.score || 0;
  };

  const getCategoryAvg = (category) => {
    const catScores = scores.filter(s => s.category === category && !s.is_overall);
    if (catScores.length === 0) return 0;
    return Math.round(catScores.reduce((sum, s) => sum + (s.score || 0), 0) / catScores.length);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold mb-1">Confidence Scoring</h3>
          <p className="text-xs text-muted-foreground">
            Score each confidence category. Overall confidence is a weighted combination.
          </p>
        </div>
        <button onClick={handleCalculate} disabled={calculating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
          {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
          Calculate Overall
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Overall score */}
      {overall && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.2)' }}>
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Overall Valuation Confidence</p>
              <p className="text-2xl font-bold text-primary">{Math.round(overall.score || 0)}<span className="text-sm text-muted-foreground">/100</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Category scores */}
      <div className="grid gap-4">
        {Object.entries(CATEGORIES).map(([catKey, catInfo]) => {
          const avg = getCategoryAvg(catKey);
          return (
            <div key={catKey} className="rounded-lg p-4 bg-secondary/50 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium">{catInfo.label}</h4>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-background overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${avg}%`, background: avg >= 70 ? '#10B981' : avg >= 40 ? '#D4A853' : '#EF4444' }} />
                  </div>
                  <span className="text-xs font-mono font-semibold">{avg}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {catInfo.sub.map((sub) => (
                  <div key={sub} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground flex-1">{sub}</span>
                    <input
                      type="range" min="0" max="100" value={getScore(catKey, sub)}
                      onChange={(e) => handleSave(catKey, sub, Number(e.target.value))}
                      className="w-20 h-1"
                    />
                    <span className="text-[11px] font-mono w-6 text-right">{getScore(catKey, sub)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}