/**
 * Galileo Capability Framework — Follow-up Graph
 * Phase 13.4B.1
 *
 * A directed graph of capability follow-ups. Every capability may
 * recommend another capability. The graph enables intelligent chaining
 * without hardcoding sequential workflows.
 *
 * Example chain:
 *   explain.enterprise_value
 *     → review.confidence
 *       → investigate.conflict
 *         → increase.enterprise_value
 *           → build.90_day_plan
 *             → prepare.client_meeting
 *
 * The UI decides whether to surface follow-ups. The framework only
 * declares the edges.
 */
import type { CapabilityMetadata } from './types.ts';

interface FollowUpEdge {
  from: string;
  to: string;
  condition?: string;
  priority: 'low' | 'medium' | 'high';
}

class FollowUpGraphImpl {
  private edges = new Map<string, FollowUpEdge[]>();

  addEdge(from: string, to: string, priority: 'low' | 'medium' | 'high' = 'medium', condition?: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    this.edges.get(from)!.push({ from, to, priority, condition });
  }

  getFollowUps(capabilityId: string): string[] {
    const edges = this.edges.get(capabilityId) || [];
    return edges
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      })
      .map((e) => e.to);
  }

  getFollowUpEdges(capabilityId: string): FollowUpEdge[] {
    return this.edges.get(capabilityId) || [];
  }

  hasFollowUps(capabilityId: string): boolean {
    return (this.edges.get(capabilityId) || []).length > 0;
  }

  /**
   * Build a chain from a starting capability, following the highest-priority
   * edge at each step. Stops at cycles or dead ends.
   */
  getChain(startId: string, maxDepth: number = 10): string[] {
    const chain: string[] = [startId];
    const visited = new Set<string>([startId]);
    let current = startId;

    for (let i = 0; i < maxDepth; i++) {
      const followUps = this.getFollowUps(current);
      if (followUps.length === 0) break;
      const next = followUps[0];
      if (visited.has(next)) break;
      chain.push(next);
      visited.add(next);
      current = next;
    }

    return chain;
  }

  clear(): void {
    this.edges.clear();
  }
}

export const followUpGraph = new FollowUpGraphImpl();

/**
 * Initialize the follow-up graph with the standard capability chains.
 * Called once during framework initialization (in placeholders.ts).
 */
export function initializeFollowUpGraph(): void {
  followUpGraph.clear();

  // Explain Enterprise Value chain
  followUpGraph.addEdge('explain.enterprise_value', 'review.confidence', 'high');
  followUpGraph.addEdge('explain.enterprise_value', 'explain.equity_value', 'medium');
  followUpGraph.addEdge('explain.enterprise_value', 'explain.build_value', 'medium');

  // Review Confidence chain
  followUpGraph.addEdge('review.confidence', 'investigate.conflict', 'high');
  followUpGraph.addEdge('review.confidence', 'review.evidence', 'medium');

  // Investigate Conflict chain
  followUpGraph.addEdge('investigate.conflict', 'review.evidence', 'high');
  followUpGraph.addEdge('investigate.conflict', 'review.missing_information', 'medium');

  // Increase Enterprise Value chain
  followUpGraph.addEdge('increase.enterprise_value', 'build.90_day_plan', 'high');
  followUpGraph.addEdge('increase.enterprise_value', 'review.opportunities', 'medium');
  followUpGraph.addEdge('increase.enterprise_value', 'review.risks', 'medium');

  // Build 90-Day Plan chain
  followUpGraph.addEdge('build.90_day_plan', 'prepare.client_meeting', 'high');
  followUpGraph.addEdge('build.90_day_plan', 'review.missing_information', 'medium');

  // Prepare Client Meeting chain
  followUpGraph.addEdge('prepare.client_meeting', 'draft.client_explanation', 'high');
  followUpGraph.addEdge('prepare.client_meeting', 'review.publication_readiness', 'medium');

  // Compare Valuation Versions chain
  followUpGraph.addEdge('compare.valuation_versions', 'review.publication_readiness', 'medium');
  followUpGraph.addEdge('compare.valuation_versions', 'explain.enterprise_value', 'low');

  // Review Missing Information chain
  followUpGraph.addEdge('review.missing_information', 'review.uploaded_documents', 'medium');
  followUpGraph.addEdge('review.missing_information', 'analyze.assessments', 'medium');

  // Explain Build Value chain
  followUpGraph.addEdge('explain.build_value', 'review.opportunities', 'medium');
  followUpGraph.addEdge('explain.build_value', 'review.risks', 'medium');

  // Review Risks chain
  followUpGraph.addEdge('review.risks', 'investigate.conflict', 'low');

  // Review Opportunities chain
  followUpGraph.addEdge('review.opportunities', 'increase.enterprise_value', 'high');

  // Review Uploaded Documents chain
  followUpGraph.addEdge('review.uploaded_documents', 'review.evidence', 'medium');

  // Analyze Assessments chain
  followUpGraph.addEdge('analyze.assessments', 'review.financial_story', 'medium');

  // Review Financial Story chain
  followUpGraph.addEdge('review.financial_story', 'explain.enterprise_value', 'low');

  // Draft Client Explanation chain
  followUpGraph.addEdge('draft.client_explanation', 'prepare.client_meeting', 'low');

  // Prepare Buyer Meeting chain
  followUpGraph.addEdge('prepare.buyer_meeting', 'review.publication_readiness', 'medium');

  // Prepare Board Meeting chain
  followUpGraph.addEdge('prepare.board_meeting', 'review.financial_story', 'medium');
}

export function getFollowUps(capabilityId: string): string[] {
  return followUpGraph.getFollowUps(capabilityId);
}