/**
 * AssignmentPermissionEditor — Phase 13.3G.2
 *
 * Inline permission editor for a single assignment. Shows grouped controls:
 *   Access:       View, Edit, Review, Publish
 *   Lifecycle:    Create, Restore, Archive
 *   Administration: Manage Assignments
 *
 * Includes a role template selector for quick application, and a remove
 * button. Does not expose raw database field names.
 */
import React, { useState } from 'react';
import { Trash2, Crown } from 'lucide-react';
import { ROLE_TEMPLATES, TEMPLATE_KEYS, applyTemplate } from '@/lib/valuation/roleTemplates';
import { updateValuationAssignment, removeValuationAdvisor } from '@/lib/valuationService';

const PERM_GROUPS = [
  {
    label: 'Access',
    perms: [
      { key: 'can_view', label: 'View' },
      { key: 'can_edit', label: 'Edit' },
      { key: 'can_review', label: 'Review' },
      { key: 'can_publish', label: 'Publish' },
    ],
  },
  {
    label: 'Lifecycle',
    perms: [
      { key: 'can_create_valuation', label: 'Create' },
      { key: 'can_restore_valuation', label: 'Restore' },
      { key: 'can_archive_valuation', label: 'Archive' },
    ],
  },
  {
    label: 'Administration',
    perms: [
      { key: 'can_manage_assignments', label: 'Manage Assignments' },
    ],
  },
];

export default function AssignmentPermissionEditor({ assignment, onUpdated, onRemoved, canManage }) {
  const [perms, setPerms] = useState({
    can_view: assignment.can_view,
    can_edit: assignment.can_edit,
    can_review: assignment.can_review,
    can_publish: assignment.can_publish,
    can_create_valuation: assignment.can_create_valuation,
    can_restore_valuation: assignment.can_restore_valuation,
    can_archive_valuation: assignment.can_archive_valuation,
    can_manage_assignments: assignment.can_manage_assignments,
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isLead = assignment.assignment_role === 'lead';
  const name = assignment.advisor
    ? `${assignment.advisor.first_name || ''} ${assignment.advisor.last_name || ''}`.trim() || assignment.advisor.email
    : 'Unknown';

  const togglePerm = async (key) => {
    const newPerms = { ...perms, [key]: !perms[key] };
    setPerms(newPerms);
    setSaving(true);
    try {
      await updateValuationAssignment(assignment.id, { [key]: !perms[key] });
      onUpdated?.(assignment.id, newPerms);
    } catch {
      setPerms(perms); // revert
    } finally {
      setSaving(false);
    }
  };

  const applyTpl = async (tplKey) => {
    const newPerms = applyTemplate(tplKey);
    setPerms(newPerms);
    setSaving(true);
    try {
      await updateValuationAssignment(assignment.id, {
        ...newPerms,
        assignment_role: tplKey === 'lead' ? 'lead' : (tplKey === 'viewer' ? 'observer' : 'contributor'),
      });
      onUpdated?.(assignment.id, newPerms);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeValuationAdvisor(assignment.id);
      onRemoved?.(assignment.id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className="rounded-lg p-3 space-y-3"
      style={{ background: isLead ? 'rgba(212,168,83,0.03)' : 'rgba(255,255,255,0.01)', border: `1px solid ${isLead ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.05)'}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{name}</p>
          {isLead && <Crown className="w-3 h-3 text-primary" />}
        </div>
        {canManage && !isLead && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-destructive/60 hover:text-destructive transition-colors text-[11px] flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {/* Role template selector */}
      {canManage && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Template:</span>
          {TEMPLATE_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => applyTpl(key)}
              disabled={saving}
              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {ROLE_TEMPLATES[key].label}
            </button>
          ))}
        </div>
      )}

      {/* Permission groups */}
      {canManage && (
        <div className="space-y-2">
          {PERM_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.perms.map((perm) => (
                  <label key={perm.key} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!perms[perm.key]}
                      onChange={() => togglePerm(perm.key)}
                      disabled={saving || (isLead && perm.key === 'can_view')}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-[11px] text-foreground">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Read-only display for non-managers */}
      {!canManage && (
        <div className="flex flex-wrap gap-1">
          {PERM_GROUPS.flatMap((g) => g.perms).filter((p) => perms[p.key]).map((p) => (
            <span key={p.key} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{p.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}