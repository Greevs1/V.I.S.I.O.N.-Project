import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, resolveActingProfile, authorizeBusinessAccess, errorResponse } from '../../shared/authz/actor.ts';
import {
  generateCandidatesFromOutcome,
  generateCandidateFromAdvisorCapture,
  retrieveRelevantMemories,
  filterMemoriesForClient,
  shouldEnforceClientSafe,
  supersedeMemory,
  detectConflicts,
  shouldExpire,
  markAsStale,
  buildRetrievalQuery,
  createConfirmationAuditEntry,
  createRejectionAuditEntry,
  createSupersessionAuditEntry,
  createRetrievalAuditEntry,
  createExpirationAuditEntry,
  getCategoryDisplayName,
} from '../../shared/businessMemory/index.ts';

/**
 * businessMemoryService — Phase 15.5
 *
 * The Business Memory API — backend-mediated service for durable
 * executive context.
 *
 * Actions:
 *   - getMemoryCandidates: Get pending candidates for advisor review
 *   - confirmBusinessMemory: Confirm a candidate (advisor governance)
 *   - rejectMemoryCandidate: Reject a candidate
 *   - updateBusinessMemory: Update a confirmed memory
 *   - supersedeBusinessMemory: Supersede an old memory with a new one
 *   - getBusinessMemories: Get all memories for a business
 *   - getBusinessMemory: Get a single memory
 *   - getRelevantBusinessMemories: Retrieve relevant memories (structured retrieval)
 *   - createCandidateFromOutcome: Generate a candidate from a post-meeting outcome
 *   - createCandidateFromCapture: Generate a candidate from an advisor capture
 *   - detectMemoryConflicts: Check for conflicts in confirmed memories
 *
 * Identity resolved server-side. Permissions enforced server-side.
 * No authoritative actor IDs from frontend.
 *
 * Constitution Compliance: Articles I-XIII
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // The actor comes from the session ONLY. `profile_id` is a TARGET identifier
    // honoured only once authorized, and the business must be one the actor can
    // actually reach — previously both were read straight from the body with no
    // verification of the caller's relationship to either.
    const actor = await authenticateActor(base44, sb);
    const user = actor.user;

    const body = await req.json();
    const { action, data } = body;

    const businessId = data?.business_id;
    if (!businessId) {
      return Response.json({ error: 'business_id is required' }, { status: 400 });
    }

    await authorizeBusinessAccess(sb, actor, businessId);

    const userRole = user.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const wantsTarget = Boolean(data?.profile_id);
    const acting = wantsTarget
      ? await resolveActingProfile(sb, actor, { targetProfileId: data.profile_id })
      : null;
    const profileId = acting?.profile?.id || actor.profile?.id || user.id;

    switch (action) {
      // ── getMemoryCandidates ────────────────────────────────────────────────
      case 'getMemoryCandidates': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can review memory candidates' }, { status: 403 });
        }
        const memories = await base44.entities.BusinessMemory.filter({
          business_id: businessId,
        }, '-created_date', 50);
        const candidates = memories.filter((m: any) => m.memory_status === 'candidate');
        return Response.json({ data: { candidates } });
      }

      // ── confirmBusinessMemory ─────────────────────────────────────────────
      case 'confirmBusinessMemory': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can confirm memories' }, { status: 403 });
        }
        const candidate = data?.candidate;
        if (!candidate) return Response.json({ error: 'candidate is required' }, { status: 400 });

        // Check for duplicates
        const existing = await base44.asServiceRole.entities.BusinessMemory.filter({
          business_id: businessId,
          memory_status: { $in: ['confirmed', 'candidate'] },
        }, '-created_date', 100);

        const duplicate = existing.find((m: any) =>
          m.title?.toLowerCase() === candidate.title?.toLowerCase() &&
          m.category === candidate.category
        );

        if (duplicate && duplicate.memory_status === 'confirmed') {
          return Response.json({
            data: {
              confirmed: false,
              reason: 'duplicate',
              existing_memory_id: duplicate.memory_id,
              message: 'A confirmed memory with this title and category already exists',
            },
          });
        }

        // Create the confirmed memory
        const memoryRecord = {
          memory_id: `memory-${businessId}-${Date.now()}`,
          business_id: businessId,
          category: candidate.category,
          title: candidate.title,
          summary: candidate.summary,
          effective_date: candidate.effective_date || new Date().toISOString().split('T')[0],
          importance: candidate.importance || 'contextual',
          confidence: candidate.confidence || 75,
          source_type: candidate.source_type || 'advisor_capture',
          source_reference: candidate.source_reference || null,
          source_evidence: candidate.source_evidence || [],
          created_from: candidate.created_from || 'advisor_capture',
          confirmed_by_profile_id: profileId,
          confirmed_by_name: user.full_name || user.email,
          confirmation_status: 'confirmed',
          memory_status: 'confirmed',
          client_visible: candidate.client_visible ?? false,
          current_relevance: 'current',
          expiration_behavior: candidate.expiration_behavior || 'retain_historically',
          relevance_tags: candidate.relevance_tags || [],
          confirmed_at: new Date().toISOString(),
          review_date: candidate.review_date || null,
        };

        const created = await base44.entities.BusinessMemory.create(memoryRecord);
        const audit = createConfirmationAuditEntry(memoryRecord, profileId);

        return Response.json({
          data: {
            confirmed: true,
            memory: created,
            audit: [audit],
          },
        });
      }

      // ── rejectMemoryCandidate ──────────────────────────────────────────────
      case 'rejectMemoryCandidate': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can reject memory candidates' }, { status: 403 });
        }
        const { candidate_id, reason } = data;
        if (!candidate_id) return Response.json({ error: 'candidate_id is required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.BusinessMemory.filter({
          memory_id: candidate_id,
          business_id: businessId,
        }, '-created_date', 1);

        if (!existing || existing.length === 0) {
          return Response.json({ error: 'Memory candidate not found' }, { status: 404 });
        }

        const updated = await base44.entities.BusinessMemory.update(existing[0].id, {
          memory_status: 'rejected',
          confirmation_status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by_profile_id: profileId,
          rejected_reason: reason || 'Advisor rejected',
        });

        const audit = createRejectionAuditEntry(
          { candidate_id, title: existing[0].title, source_evidence: existing[0].source_evidence || [] },
          profileId,
          reason || 'Advisor rejected'
        );

        return Response.json({
          data: { rejected: true, memory: updated, audit: [audit] },
        });
      }

      // ── updateBusinessMemory ───────────────────────────────────────────────
      case 'updateBusinessMemory': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can update memories' }, { status: 403 });
        }
        const { memory_id, updates } = data;
        if (!memory_id) return Response.json({ error: 'memory_id is required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.BusinessMemory.filter({
          memory_id,
          business_id: businessId,
        }, '-created_date', 1);

        if (!existing || existing.length === 0) {
          return Response.json({ error: 'Memory not found' }, { status: 404 });
        }

        const updated = await base44.entities.BusinessMemory.update(existing[0].id, {
          ...updates,
          // Don't allow overriding status fields through generic update
          memory_status: existing[0].memory_status,
          confirmation_status: existing[0].confirmation_status,
        });

        return Response.json({ data: { memory: updated } });
      }

      // ── supersedeBusinessMemory ────────────────────────────────────────────
      case 'supersedeBusinessMemory': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can supersede memories' }, { status: 403 });
        }
        const { old_memory_id, new_memory_data } = data;
        if (!old_memory_id || !new_memory_data) {
          return Response.json({ error: 'old_memory_id and new_memory_data are required' }, { status: 400 });
        }

        const oldMemory = await base44.asServiceRole.entities.BusinessMemory.filter({
          memory_id: old_memory_id,
          business_id: businessId,
        }, '-created_date', 1);

        if (!oldMemory || oldMemory.length === 0) {
          return Response.json({ error: 'Old memory not found' }, { status: 404 });
        }

        // Create the new memory
        const newMemoryRecord = {
          memory_id: `memory-${businessId}-${Date.now()}`,
          business_id: businessId,
          category: new_memory_data.category || oldMemory[0].category,
          title: new_memory_data.title,
          summary: new_memory_data.summary,
          effective_date: new_memory_data.effective_date || new Date().toISOString().split('T')[0],
          importance: new_memory_data.importance || oldMemory[0].importance,
          confidence: new_memory_data.confidence || 80,
          source_type: new_memory_data.source_type || 'advisor_decision',
          source_reference: new_memory_data.source_reference || null,
          source_evidence: new_memory_data.source_evidence || [],
          created_from: 'advisor_capture',
          confirmed_by_profile_id: profileId,
          confirmed_by_name: user.full_name || user.email,
          confirmation_status: 'confirmed',
          memory_status: 'confirmed',
          client_visible: new_memory_data.client_visible ?? oldMemory[0].client_visible,
          current_relevance: 'current',
          expiration_behavior: new_memory_data.expiration_behavior || 'retain_historically',
          relevance_tags: new_memory_data.relevance_tags || oldMemory[0].relevance_tags || [],
          confirmed_at: new Date().toISOString(),
          supersedes: old_memory_id,
        };

        const created = await base44.entities.BusinessMemory.create(newMemoryRecord);

        // Mark old memory as superseded
        const updatedOld = await base44.entities.BusinessMemory.update(oldMemory[0].id, {
          memory_status: 'superseded',
          confirmation_status: 'superseded',
          current_relevance: 'historical',
          superseded_by: newMemoryRecord.memory_id,
          superseded_at: new Date().toISOString(),
        });

        const audit = createSupersessionAuditEntry(oldMemory[0], newMemoryRecord, profileId);

        return Response.json({
          data: {
            superseded: true,
            old_memory: updatedOld,
            new_memory: created,
            audit: [audit],
          },
        });
      }

      // ── getBusinessMemories ────────────────────────────────────────────────
      case 'getBusinessMemories': {
        const fetcher = isAdmin ? base44.entities.BusinessMemory : base44.asServiceRole.entities.BusinessMemory;
        const memories = await fetcher.filter({
          business_id: businessId,
        }, '-created_date', 100);

        // Client-safe filtering for non-admins
        const safeMemories = isAdmin ? memories : filterMemoriesForClient(memories);

        return Response.json({
          data: {
            memories: safeMemories,
            total: safeMemories.length,
            client_safe_filtered: isAdmin ? 0 : memories.length - safeMemories.length,
          },
        });
      }

      // ── getBusinessMemory ──────────────────────────────────────────────────
      case 'getBusinessMemory': {
        const { memory_id } = data;
        if (!memory_id) return Response.json({ error: 'memory_id is required' }, { status: 400 });

        const memories = await base44.asServiceRole.entities.BusinessMemory.filter({
          memory_id,
          business_id: businessId,
        }, '-created_date', 1);

        if (!memories || memories.length === 0) {
          return Response.json({ error: 'Memory not found' }, { status: 404 });
        }

        const memory = memories[0];
        // Client-safe check
        if (!isAdmin && !memory.client_visible) {
          return Response.json({ error: 'Memory not found' }, { status: 404 });
        }

        return Response.json({ data: { memory } });
      }

      // ── getRelevantBusinessMemories ───────────────────────────────────────
      case 'getRelevantBusinessMemories': {
        // Use asServiceRole for non-admins (need to read all for client-safe filtering),
        // regular client for admins (RLS allows). Simple equality filter — no $in.
        const fetcher = isAdmin ? base44.entities.BusinessMemory : base44.asServiceRole.entities.BusinessMemory;
        const allMemories = await fetcher.filter({
          business_id: businessId,
        }, '-created_date', 200);

        const clientSafeOnly = shouldEnforceClientSafe(userRole);
        const query = buildRetrievalQuery({
          business_id: businessId,
          meeting_intent: data?.meeting_intent,
          category: data?.category,
          importance: data?.importance,
          relevance_tags: data?.relevance_tags,
          client_safe_only: clientSafeOnly,
          include_historical: data?.include_historical ?? false,
          limit: data?.limit ?? 20,
        });

        const result = retrieveRelevantMemories(allMemories, query);

        const audit = createRetrievalAuditEntry(
          result.memories.map((m) => m.memory_id),
          data?.consumer || 'unknown',
          query
        );

        return Response.json({
          data: {
            memories: result.memories,
            total: result.total,
            filtered_for_client_safe: result.filtered_for_client_safe,
            audit: [audit],
          },
        });
      }

      // ── createCandidateFromOutcome ─────────────────────────────────────────
      case 'createCandidateFromOutcome': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can create memory candidates' }, { status: 403 });
        }
        const outcome = data?.outcome;
        if (!outcome) return Response.json({ error: 'outcome is required' }, { status: 400 });

        const candidate = generateCandidatesFromOutcome(outcome);
        if (!candidate) {
          return Response.json({
            data: {
              candidate: null,
              reason: 'Durability test failed or outcome type not eligible for memory',
            },
          });
        }

        // Persist the candidate
        const created = await base44.entities.BusinessMemory.create({
          memory_id: candidate.candidate_id,
          business_id: candidate.business_id,
          category: candidate.category,
          title: candidate.title,
          summary: candidate.summary,
          effective_date: candidate.effective_date,
          importance: candidate.importance,
          confidence: candidate.confidence,
          source_type: candidate.source_type,
          source_reference: candidate.source_reference,
          source_evidence: candidate.source_evidence,
          created_from: candidate.created_from,
          confirmation_status: 'candidate',
          memory_status: 'candidate',
          client_visible: candidate.client_visible,
          current_relevance: 'current',
          expiration_behavior: 'retain_historically',
          relevance_tags: candidate.relevance_tags,
        });

        return Response.json({ data: { candidate: created } });
      }

      // ── createCandidateFromCapture ─────────────────────────────────────────
      case 'createCandidateFromCapture': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can create memory candidates' }, { status: 403 });
        }
        const capture = data?.capture;
        if (!capture) return Response.json({ error: 'capture is required' }, { status: 400 });

        const candidate = generateCandidateFromAdvisorCapture({
          business_id: businessId,
          ...capture,
        });
        if (!candidate) {
          return Response.json({
            data: { candidate: null, reason: 'Durability test failed' },
          });
        }

        const created = await base44.entities.BusinessMemory.create({
          memory_id: candidate.candidate_id,
          business_id: candidate.business_id,
          category: candidate.category,
          title: candidate.title,
          summary: candidate.summary,
          effective_date: candidate.effective_date,
          importance: candidate.importance,
          confidence: candidate.confidence,
          source_type: candidate.source_type,
          source_reference: candidate.source_reference,
          source_evidence: candidate.source_evidence,
          created_from: candidate.created_from,
          confirmation_status: 'candidate',
          memory_status: 'candidate',
          client_visible: candidate.client_visible,
          current_relevance: 'current',
          expiration_behavior: 'retain_historically',
          relevance_tags: candidate.relevance_tags,
        });

        return Response.json({ data: { candidate: created } });
      }

      // ── detectMemoryConflicts ──────────────────────────────────────────────
      case 'detectMemoryConflicts': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can detect memory conflicts' }, { status: 403 });
        }
        const memories = await base44.entities.BusinessMemory.filter({
          business_id: businessId,
        }, '-created_date', 100);
        const confirmed = memories.filter((m: any) => m.memory_status === 'confirmed');

        const conflicts = detectConflicts(confirmed);
        return Response.json({ data: { conflicts, has_conflicts: conflicts.length > 0 } });
      }

      // ── expireStaleMemories ────────────────────────────────────────────────
      case 'expireStaleMemories': {
        if (!isAdmin) {
          return Response.json({ error: 'Only advisors can expire memories' }, { status: 403 });
        }
        const memories = await base44.entities.BusinessMemory.filter({
          business_id: businessId,
        }, '-created_date', 100);
        const confirmed = memories.filter((m: any) => m.memory_status === 'confirmed');

        const toExpire = confirmed.filter((m: any) => shouldExpire(m));
        const expired: any[] = [];

        for (const m of toExpire) {
          const updated = markAsStale(m);
          await base44.entities.BusinessMemory.update(m.id, {
            current_relevance: updated.current_relevance,
          });
          expired.push(m.memory_id);
        }

        return Response.json({
          data: { expired_count: expired.length, expired_ids: expired },
        });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}