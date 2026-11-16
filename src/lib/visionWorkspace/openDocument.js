/**
 * THE ONE DOCUMENT OPENING CONTRACT.
 *
 * Anywhere Vision refers to a document — an activity row, a metric source, a
 * Galileo citation, a playbook item, a readiness gap — the reference opens the
 * EXACT document in the EXISTING Data Room viewer, presented inside the GALILEO
 * DOCUMENT OVERLAY. Components never hand-roll `navigate('/data-room')`, and
 * never open the document library when they meant a specific document (which is
 * what the Home activity rows used to do).
 *
 * PRESENTATION vs AUTHORIZATION (Global Rule #1): only the destination's
 * presentation moved into the overlay shell. The validation below is unchanged
 * and still fail-closed.
 *
 * HOW IT RESOLVES A DESTINATION
 *   1. The Vision workspace layer, when the caller already holds it
 *      (`onOpenWorkspace`) — the layer owns navigation, so the trail and the
 *      header's Back keep working and closing returns to the surface that
 *      opened the document.
 *   2. Otherwise, on Vision itself (`/galileo`), the same workspace URL the
 *      registry defines: `?workspace=data-room&id=<documentId>`.
 *   3. Otherwise the real route: `/data-room?document=<documentId>`, which is
 *      how non-Vision surfaces (assessments on their own route, the journey)
 *      reach the same viewer.
 *
 * AUTHORIZATION IS NOT DECIDED HERE. The id is a request, not a grant: the Data
 * Room only opens a document that is in the ACTIVE BUSINESS's own document list,
 * which the backend resolves and scopes. A document belonging to another
 * business is never in that list, so it fails closed.
 *
 * WHAT THE CALLER CAN PASS
 *   - `documentId`     the documents row id (required).
 *   - `needs`          a plain-language data request behind the upload intent,
 *                      e.g. 'Annual revenue'. The Data Room renders it as the
 *                      "Vision needs more information" header above the
 *                      existing upload flow. Never invented by the opener.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** The route form of the contract — also the fallback for non-Vision surfaces. */
export function documentDeepLink(documentId, { needs = null, from = null } = {}) {
  if (!documentId) return '/data-room';
  const params = new URLSearchParams({ document: documentId });
  if (needs) params.set('needs', needs);
  // The surface to come back to when the viewer closes. Same-origin absolute
  // paths only — a URL we navigate to is never taken from input unchecked.
  if (from && from.startsWith('/') && !from.startsWith('//')) params.set('from', from);
  return `/data-room?${params.toString()}`;
}

export function useOpenDocument(onOpenWorkspace = null) {
  const navigate = useNavigate();

  return useCallback(
    (documentId, { needs = null } = {}) => {
      if (!documentId) return;

      // 1. The Vision layer, when the caller holds it — trail preserved.
      if (onOpenWorkspace) {
        onOpenWorkspace('data-room', documentId);
        return;
      }

      // 2. Vision without a layer handle. Reuse the registry's own URL shape so
      //    the layer opens exactly as it does from the nav menu — and record the
      //    room this document was opened FROM, so the layer's Back returns there
      //    (Valuation → source → Back → Valuation) rather than leaving Vision.
      if (typeof window !== 'undefined' && window.location.pathname === '/galileo') {
        const params = new URLSearchParams(window.location.search);
        const origin = params.get('workspace');
        params.set('workspace', 'data-room');
        params.set('id', documentId);
        if (needs) params.set('needs', needs);
        if (origin) params.set('from', origin);
        else params.delete('from');
        navigate(`/galileo?${params.toString()}`);
        return;
      }

      // 3. Anywhere else — the real route into the same Data Room, carrying the
      //    surface the owner should come back to. Navigating from the Data Room
      //    itself adds no origin: they are already where they are going.
      const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : null;
      navigate(
        documentDeepLink(documentId, {
          needs,
          from: here && window.location.pathname !== '/data-room' ? here : null,
        })
      );
    },
    [navigate, onOpenWorkspace]
  );
}

/**
 * The UPLOAD / LIBRARY half of the same contract.
 *
 * ANY owner-facing control that means "give Galileo a document" — Upload
 * financials, Add financial data, Upload a P&L, Provide financials, Add
 * supporting document — comes through here instead of routing the owner to a
 * standalone file-management page.
 *
 *   · On Vision (or inside a workspace, where the caller holds the layer's
 *     opener) → the Galileo document overlay, in upload mode, carrying
 *     `needs` so Vision can state the request in words.
 *   · Anywhere else (a legacy route on the AppLayout) → the existing standalone
 *     uploader, so nothing that works today stops working.
 */
export function useOpenDocuments(onOpen = null) {
  const navigate = useNavigate();

  return useCallback(
    ({ mode = 'library', needs = null } = {}) => {
      const extras = { mode: mode === 'upload' ? 'upload' : null, needs: needs || null };

      // 1. The workspace layer, when the caller holds it.
      if (onOpen) {
        onOpen('data-room', null, extras);
        return;
      }

      // 2. On Vision without a handle — the registry's own URL shape, with the
      //    room this request came FROM so the layer's Back returns there.
      if (typeof window !== 'undefined' && window.location.pathname === '/galileo') {
        const params = new URLSearchParams(window.location.search);
        const origin = params.get('workspace');
        params.set('workspace', 'data-room');
        params.delete('id');
        Object.entries(extras).forEach(([key, value]) => {
          if (value) params.set(key, value);
          else params.delete(key);
        });
        if (origin) params.set('from', origin);
        else params.delete('from');
        navigate(`/galileo?${params.toString()}`);
        return;
      }

      // 3. Outside Vision the existing standalone surfaces remain the target.
      navigate(mode === 'upload' ? '/upload' : '/data-room');
    },
    [navigate, onOpen]
  );
}