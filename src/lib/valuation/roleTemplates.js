/**
 * roleTemplates — Phase 13.3G.2
 *
 * Permission templates for valuation assignments. These are starting points
 * that a super admin or lead advisor can customize after applying. Permission
 * flags on the assignment record remain the source of truth — role names are
 * never used as authority by the backend.
 *
 * Templates cover:
 *   - Viewer       — view only
 *   - Editor       — view + edit
 *   - Reviewer     — view + edit + review
 *   - Publisher    — view + edit + review + publish
 *   - Lead Advisor — all permissions including lifecycle + management
 */

export const ROLE_TEMPLATES = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to the valuation.',
    permissions: {
      can_view: true,
      can_edit: false,
      can_review: false,
      can_publish: false,
      can_create_valuation: false,
      can_restore_valuation: false,
      can_archive_valuation: false,
      can_manage_assignments: false,
    },
  },
  editor: {
    label: 'Editor',
    description: 'View and edit valuation inputs.',
    permissions: {
      can_view: true,
      can_edit: true,
      can_review: false,
      can_publish: false,
      can_create_valuation: false,
      can_restore_valuation: false,
      can_archive_valuation: false,
      can_manage_assignments: false,
    },
  },
  reviewer: {
    label: 'Reviewer',
    description: 'View, edit, and review calculations.',
    permissions: {
      can_view: true,
      can_edit: true,
      can_review: true,
      can_publish: false,
      can_create_valuation: false,
      can_restore_valuation: false,
      can_archive_valuation: false,
      can_manage_assignments: false,
    },
  },
  publisher: {
    label: 'Publisher',
    description: 'View, edit, review, and publish valuations.',
    permissions: {
      can_view: true,
      can_edit: true,
      can_review: true,
      can_publish: true,
      can_create_valuation: false,
      can_restore_valuation: false,
      can_archive_valuation: false,
      can_manage_assignments: false,
    },
  },
  lead: {
    label: 'Lead Advisor',
    description: 'Full access including lifecycle and team management.',
    permissions: {
      can_view: true,
      can_edit: true,
      can_review: true,
      can_publish: true,
      can_create_valuation: true,
      can_restore_valuation: true,
      can_archive_valuation: true,
      can_manage_assignments: true,
    },
  },
};

export const TEMPLATE_KEYS = ['viewer', 'editor', 'reviewer', 'publisher', 'lead'];

export function getTemplate(key) {
  return ROLE_TEMPLATES[key] || ROLE_TEMPLATES.viewer;
}

export function applyTemplate(key) {
  const tpl = getTemplate(key);
  return { ...tpl.permissions };
}