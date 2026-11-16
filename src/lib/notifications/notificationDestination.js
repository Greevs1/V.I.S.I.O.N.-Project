/**
 * ONE notification destination resolver.
 *
 * A notification is not a message, it is a reference to the exact context needed
 * to act on it. This module is the only place that decides what that context is,
 * so no component ever grows an `if (notification.type === …)` ladder.
 *
 *   notification → resolveNotificationDestination(notification)
 *                → { kind, businessId, documentId, assignmentId, review }
 *
 * WHAT IS TRUSTED
 *   Authoritative IDs only — business_id, related_entity_id (the documents row
 *   id), and the ids a producer persisted in `metadata`. Never the title, the
 *   message, a filename or a person's name: text is presentation, ids are
 *   navigation. A forged id buys nothing, because the destination fails closed
 *   exactly as it does for a hand-typed deep link (the Data Room opens a document
 *   only if it is in the ACTIVE BUSINESS's own list).
 *
 * SUPPORTED TODAY
 *   · document      — any notice carrying a documents row id (document
 *                     assignments are the required case; they also carry
 *                     assignment_id + assignment_type in metadata).
 *   · path          — the notice's existing action_url, unchanged. This is the
 *                     fallback for every notice type that carries no
 *                     authoritative object id, so nothing that works today
 *                     stops working.
 *   · none          — nothing safe to open.
 *
 * EXTENSIBLE BY CONSTRUCTION
 *   Other notice types need no change here beyond a branch that reads ids they
 *   already persist. Sprint/task and valuation notices currently carry a
 *   workspace-level action_url and no resolvable room+object pair, so they stay
 *   on `path` until their producers persist the ids — see the closeout report.
 *
 * `review` — the extraction-review context is a DIFFERENT system from a document
 * assignment. It is opened only when a notice says so explicitly
 * (`metadata.context === 'extraction_review'`), never inferred from
 * assignment_type === 'review'.
 */

const DOCUMENT_ASSIGNMENT_KIND = 'document_assignment';

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function resolveNotificationDestination(notification) {
  if (!notification) return { kind: 'none' };

  const meta = plainObject(notification.metadata) || {};
  const businessId = notification.business_id || meta.business_id || null;

  // An authoritative document id: declared by an assignment notice, or carried
  // as the notice's related entity. Nothing else is treated as a document.
  const documentId =
    (meta.kind === DOCUMENT_ASSIGNMENT_KIND ? meta.document_id : null) ||
    (notification.related_entity_type === 'Document' ? notification.related_entity_id : null);

  if (documentId) {
    return {
      kind: 'document',
      businessId,
      documentId,
      assignmentId: meta.assignment_id || null,
      assignmentType: meta.assignment_type || null,
      review: meta.context === 'extraction_review' ? 'extraction_review' : null,
    };
  }

  if (notification.action_url) {
    return { kind: 'path', businessId, path: notification.action_url };
  }

  return { kind: 'none', businessId };
}

/**
 * The Vision URL for a resolved destination — the document contract's own layer
 * grammar, so the existing workspace layer, its trail and its Back all work
 * unchanged (no new navigation mechanism).
 *
 *   ?workspace=data-room&id=<documentId>   the exact document in the viewer
 *   &tab=review                           the extraction-review context, when
 *                                         the notice said it was that
 *   &from=data-room                       the library one step behind, so Back
 *                                         returns to the Data Room rather than
 *                                         closing the overlay
 */
export function destinationUrl(destination) {
  const params = new URLSearchParams();
  params.set('workspace', 'data-room');
  if (destination.review === 'extraction_review') params.set('tab', 'review');
  params.set('id', destination.documentId);
  params.set('from', 'data-room');
  return `/galileo?${params.toString()}`;
}