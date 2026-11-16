import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Public endpoint — no auth required. Contains only public benchmark data, no client PII.

    const { industry_input, normalized_industry, naics_code } = await req.json();
    if (!industry_input) return Response.json({ error: 'industry_input is required' }, { status: 400 });

    // FROZEN (Phase C.1): Base44 Assessment cache retired.
    // Benchmark is computed fresh each call — public data, not business-scoped.

    const prompt = `You are a business valuation expert specializing in private company M&A transactions. A business owner is in the industry: "${normalized_industry || industry_input}"${naics_code ? ` (NAICS: ${naics_code})` : ''}.

Your task:
1. Find the accurate average EBITDA multiple for private company transactions in this industry ($500K–$10M EBITDA range).
2. Find the top-quartile and best-in-class EBITDA multiples.
3. Apply private company discounts for: illiquidity, owner dependency, customer concentration, small size, and lower transferability.
4. Use data from the last 24 months when possible.
5. Use only reliable M&A and valuation sources: GF Data, BVR/DealStats, Axial, PitchBook transactions, IBBA, public company comps adjusted for size, industry M&A reports.
6. NEVER invent multiples. NEVER guess. If reliable data is unavailable, return insufficient_data: true.
7. Return source names, confidence level (high/medium/low), date range, private company adjustment notes (1-2 sentences), and benchmark explanation (1-2 sentences, plain English).

Return JSON only.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          insufficient_data: { type: 'boolean' },
          industry: { type: 'string' },
          normalized_industry: { type: 'string' },
          naics_code: { type: 'string' },
          average_ebitda_multiple: { type: 'number' },
          top_quartile_ebitda_multiple: { type: 'number' },
          best_in_class_ebitda_multiple: { type: 'number' },
          confidence_level: { type: 'string', enum: ['high', 'medium', 'low'] },
          benchmark_sources: { type: 'string' },
          date_range: { type: 'string' },
          private_company_adjustment_notes: { type: 'string' },
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