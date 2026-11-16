import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Public endpoint — no auth required. Contains only public benchmark data, no client PII.

    const { industry_input } = await req.json();
    if (!industry_input) return Response.json({ error: 'industry_input is required' }, { status: 400 });

    // FROZEN (Phase C.1): Base44 Assessment cache retired.
    // Benchmark is computed fresh each call — public data, not business-scoped.

    // Call Claude for benchmark
    const prompt = `You are a business financial benchmarking expert. A business owner has entered their industry as: "${industry_input}".

Your task:
1. Normalize and classify the industry.
2. Find the most relevant NAICS or SIC code if available.
3. Find the accurate average net profit margin for this industry for small businesses ($500K–$20M revenue).
4. Find the top-quartile (best-in-class) net profit margin for this industry.
5. Use data from the last 24 months when possible.
6. Use only reliable sources: BLS, Census Bureau, SBA, IRS Statistics of Income, industry associations, public filings, reputable financial databases (BVR, RMA, Sageworks/Pepperjam), and credible industry reports.
7. NEVER invent numbers. NEVER guess. If reliable data is unavailable, return insufficient_data: true.
8. Return source names, confidence level (high/medium/low), date range, and a brief benchmark explanation (1-2 sentences, plain English).

Return JSON only — no markdown, no explanation outside the JSON.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          insufficient_data: { type: 'boolean' },
          industry_input: { type: 'string' },
          normalized_industry: { type: 'string' },
          naics_code: { type: 'string' },
          average_net_profit_margin: { type: 'number' },
          top_quartile_net_profit_margin: { type: 'number' },
          best_in_class_net_profit_margin: { type: 'number' },
          benchmark_sources: { type: 'string' },
          confidence_level: { type: 'string', enum: ['high', 'medium', 'low'] },
          date_range: { type: 'string' },
          benchmark_notes: { type: 'string' },
        }
      }
    });

    if (result.insufficient_data) {
      return Response.json({
        error: 'insufficient_data',
        message: 'Reliable benchmark data was not available for this industry. Please refine the industry or provide more detail.'
      }, { status: 422 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});