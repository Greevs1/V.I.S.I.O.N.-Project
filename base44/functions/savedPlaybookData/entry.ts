/**
 * savedPlaybookData — persistent strategy playbook CRUD via Supabase.
 *
 * Actions:
 *   savePlaybookItem       — save a Galileo response/strategy to playbook
 *   getSavedPlaybooks      — list playbooks for current user/business
 *   deleteSavedPlaybook    — soft-delete a playbook
 *   exportSavedPlaybooksPdf — generate export content for all playbooks
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  requireBusinessContext,
  assertBusinessAccess,
  businessContextError,
  businessScopeMismatch,
} from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data } = body || {};

    // ── Helpers ────────────────────────────────────────────────────────────────

    const getProfile = async () => {
      const { data: profile } = await sb
        .from('profiles').select('*').eq('email', user.email).maybeSingle();
      return profile;
    };

    // Phase 6.9B — saved_playbooks rows are BUSINESS-OWNED records. There is no
    // global/template variant in this table, so every action requires an explicit
    // business (or an unambiguous single-business account) AND is authorized
    // against it. The previous `profile.primary_business_id || null` fallback
    // silently answered a multi-business account with its primary business, and
    // when it returned null `getSavedPlaybooks` dropped the business filter
    // entirely and returned EVERY playbook the profile owned — the visible
    // cross-business leak.
    const requireSavedPlaybookBusiness = async (profile, data, action) => {
      const { businessId, denial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id, `savedPlaybookData.${action}`
      );
      if (denial) return { businessId: null, denial };
      if (!businessId) {
        return {
          businessId: null,
          denial: Response.json(
            { error: 'business_id required', code: 'BUSINESS_CONTEXT_REQUIRED' },
            { status: 400 }
          ),
        };
      }
      return { businessId, denial: null };
    };

    // Simple hash for dedup
    const hashContent = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
      }
      return String(hash);
    };

    // ── savePlaybookItem ───────────────────────────────────────────────────────

    if (action === 'savePlaybookItem') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { businessId, denial } = await requireSavedPlaybookBusiness(profile, data, 'savePlaybookItem');
      if (denial) return denial;

      const { title, content, category, saved_from } = data || {};

      if (!title || !content) {
        return Response.json({ error: 'title and content required' }, { status: 400 });
      }

      const contentHash = hashContent(content);

      // Dedup: same profile + business + title
      const { data: existing } = await sb
        .from('saved_playbooks')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('business_id', businessId)
        .eq('title', title)
        .eq('is_deleted', false)
        .maybeSingle();

      // Check if existing has same content (via hash stored in content)
      if (existing) {
        return Response.json({ playbook: existing, deduped: true });
      }

      const now = new Date().toISOString();
      const { data: playbook, error } = await sb.from('saved_playbooks')
        .insert({
          profile_id: profile.id,
          business_id: businessId,
          title: title.length > 200 ? title.substring(0, 200) : title,
          content,
          source: 'galileo',
          category: category || 'strategy',
          saved_from: saved_from || 'command_center',
          created_by: profile.id,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      return Response.json({ playbook });
    }

    // ── getSavedPlaybooks ──────────────────────────────────────────────────────

    if (action === 'getSavedPlaybooks') {
      const profile = await getProfile();
      if (!profile) return Response.json({ playbooks: [] });

      const { businessId, denial } = await requireSavedPlaybookBusiness(profile, data, 'getSavedPlaybooks');
      if (denial) return denial;

      const { data: playbooks, error } = await sb.from('saved_playbooks')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('business_id', businessId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);

      return Response.json({ playbooks: playbooks || [] });
    }

    // ── deleteSavedPlaybook ────────────────────────────────────────────────────

    if (action === 'deleteSavedPlaybook') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { playbookId } = data || {};
      if (!playbookId) return Response.json({ error: 'playbookId required' }, { status: 400 });

      // Verify ownership
      const { data: pb } = await sb
        .from('saved_playbooks')
        .select('id, profile_id, business_id')
        .eq('id', playbookId)
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (!pb) return Response.json({ error: 'Playbook not found' }, { status: 404 });

      // Phase 6.9B — the playbook is a business-owned record, so the actor is
      // authorized against the record's OWN business, and an explicitly supplied
      // business must match it.
      let playbookBusinessId: string;
      try {
        playbookBusinessId = await assertBusinessAccess(sb, pb.business_id, profile, {
          action: 'savedPlaybookData.deleteSavedPlaybook',
        });
      } catch (authErr) {
        return businessContextError(authErr);
      }
      const requestedDeleteBiz = data?.active_business_id || data?.business_id || null;
      if (requestedDeleteBiz && requestedDeleteBiz !== playbookBusinessId) {
        return businessScopeMismatch('Saved playbook');
      }

      // Soft delete
      await sb.from('saved_playbooks')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', playbookId);

      return Response.json({ success: true });
    }

    // ── exportSavedPlaybooksPdf ────────────────────────────────────────────────

    if (action === 'exportSavedPlaybooksPdf') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { businessId, denial } = await requireSavedPlaybookBusiness(profile, data, 'exportSavedPlaybooksPdf');
      if (denial) return denial;

      const { data: playbooks } = await sb.from('saved_playbooks')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('business_id', businessId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      const items = playbooks || [];

      if (items.length === 0) {
        return Response.json({ error: 'No saved playbooks to export' }, { status: 400 });
      }

      // Generate export content as structured data for frontend to render
      const exportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      const exportData = {
        platform: 'V.I.S.I.O.N. Platform',
        title: 'Saved Playbook',
        user: user.full_name || user.email,
        exportDate,
        count: items.length,
        items: items.map(pb => ({
          title: pb.title,
          content: pb.content,
          category: pb.category,
          saved_from: pb.saved_from,
          saved_date: new Date(pb.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
          }),
        })),
      };

      return Response.json({ export: exportData });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});