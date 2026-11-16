/**
 * useVisionWorkspace — the workspace layer's state, bound to the URL.
 *
 * WHY THE URL OWNS THE STATE (Part 18):
 *   · Browser Back closes the workspace and returns to the prior Vision state,
 *     because opening PUSHES a history entry.
 *   · Refresh restores the requested workspace — it lives in the query string,
 *     not in transient React state.
 *   · A copied deep link (/galileo?workspace=sprint) reopens the workspace.
 *
 * ONE LAYER ONLY (Part 19): a nested transition does not stack a second
 * overlay — it pushes another workspace entry, and the trail drives the
 * header's Back and the breadcrumb.
 *
 * TWO KINDS OF BACK
 *
 *   LEVEL 1 — a SUB-VIEW of the same room. The Data Room's uploader, its
 *   document viewer and its Review tab are levels of the `data-room` workspace,
 *   not different places: `&mode=upload`, `&id=<documentId>`, `&tab=review`.
 *   Entering one PUSHES a level, so Back walks one room backward —
 *   Upload → Data Room — and the overlay stays open.
 *
 *   LEVEL 2 — LEAVING the room. At the root of a workspace with nothing behind
 *   it, Back means Close: the layer lifts off and the Vision surface underneath
 *   is exactly where it was (Data Room → Home).
 *
 * HOW THE TWO ARE TOLD APART — `from`:
 *   Every level records the workspace it was opened FROM, in the URL's own
 *   grammar (the same mechanism `mode` / `needs` / `tab` already use). That is
 *   what keeps the stack honest across a refresh, in step with the browser's
 *   Back button, and correct when a writer that does not hold this hook — the
 *   document contract, for example — changes the URL.
 *
 *   Contextual entry records NO origin, and that is the whole point:
 *   What If → Upload → Back returns to What If, never detouring through a room
 *   the owner did not walk into.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveWorkspace, WORKSPACES } from '@/lib/visionWorkspace/registry';
import { useBusinessContext } from '@/lib/BusinessContext';

// The params that describe a SUB-VIEW of a workspace: the document overlay's
// upload intent, the document it is showing, the tab it is on. They are what
// make "Data Room" and "Data Room → Upload" two different levels.
const SUB_VIEW_PARAMS = ['mode', 'needs', 'tab'];

// Everything a level owns. Clearing `from` is what makes a level the root of its
// own room — and therefore makes Back mean Close.
const LEVEL_PARAMS = ['id', ...SUB_VIEW_PARAMS, 'from'];

/** A level's identity: which workspace, and which sub-view of it. */
function signatureOf(params) {
  return [params.get('id') || '', params.get('mode') || '', params.get('tab') || ''].join('|');
}

function levelOf(id, params) {
  return { id, sig: signatureOf(params) };
}

export function useVisionWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { context } = useBusinessContext();
  const activeBusinessId = context?.active_business_id || null;

  const workspaceId = searchParams.get('workspace');
  const payload = searchParams.get('id');
  const originId = searchParams.get('from');
  const def = useMemo(() => resolveWorkspace(workspaceId), [workspaceId]);

  // The in-memory trail of the layer we are inside. Reconciled against the URL
  // so a browser Back — or any writer that changes the URL without calling
  // open/back — keeps the trail honest instead of drifting.
  const [trail, setTrail] = useState([]);
  const urlSig = signatureOf(searchParams);
  const lastEntry = trail.length ? trail[trail.length - 1] : null;

  useEffect(() => {
    if (!workspaceId) {
      if (trail.length) setTrail([]);
      return;
    }
    if (lastEntry && lastEntry.id === workspaceId && lastEntry.sig === urlSig) return;

    const target = levelOf(workspaceId, searchParams);

    setTrail((prev) => {
      const known = prev.findIndex((entry) => entry.id === workspaceId && entry.sig === urlSig);
      // A level we already walked through: the browser moved back into it.
      if (known >= 0) return prev.slice(0, known + 1);

      const tail = prev.length ? prev[prev.length - 1] : null;

      // A sibling sub-view of the same room (a document opened from the review
      // list, say): it takes the place of the sub-view it replaced, so Back
      // still means the room the owner is standing in.
      if (tail && tail.id === workspaceId) return [...prev.slice(0, -1), target];

      // Opened from another room — by the layer before this hook mounted, or
      // before a refresh. `from` is the origin that level recorded.
      if (originId && WORKSPACES[originId] && (!tail || tail.id === originId)) {
        const originEntry = { id: originId, sig: '' };
        return [...(tail ? prev : [originEntry]), target];
      }

      // Contextual entry: entered directly from a Vision surface, so this is the
      // first and only level — Back from here means leaving the room.
      return [target];
    });
  }, [workspaceId, urlSig, originId, lastEntry, trail.length, searchParams]);

  /** Open a workspace (or transition the single layer to another one). */
  const open = useCallback(
    (id, nextPayload = null, extra = {}) => {
      if (!WORKSPACES[id]) return;
      const params = new URLSearchParams(window.location.search);
      // Where this level is being opened FROM. A room opened from the room
      // itself is a sub-view level (Data Room → Upload); opened from Vision Home
      // there is no origin at all.
      const origin = params.get('workspace');
      LEVEL_PARAMS.forEach((key) => params.delete(key));
      params.set('workspace', id);
      if (nextPayload) params.set('id', nextPayload);
      if (origin) params.set('from', origin);
      // A caller may name the sub-view it needs — the document overlay's upload
      // intent (`mode`, `needs`), for example. A null value CLEARS the param, so
      // a stale upload intent can never leak into a later open of the same
      // workspace.
      Object.entries(extra).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      setTrail((prev) => [...prev, levelOf(id, params)]);
      setSearchParams(params);
    },
    [setSearchParams]
  );

  /**
   * Swap the CURRENT level in place, keeping the stack where it is.
   *
   * Used when one sub-view succeeds another — the uploader handing over to the
   * review queue — so Back still means the room the owner came from instead of
   * the screen they have just finished with.
   */
  const replace = useCallback(
    (id, nextPayload = null, extra = {}) => {
      if (!WORKSPACES[id]) return;
      const params = new URLSearchParams(window.location.search);
      const origin = params.get('from');
      LEVEL_PARAMS.forEach((key) => params.delete(key));
      params.set('workspace', id);
      if (nextPayload) params.set('id', nextPayload);
      if (origin) params.set('from', origin);
      Object.entries(extra).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      setTrail((prev) => [...prev.slice(0, -1), levelOf(id, params)]);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  /** Step back one level; from the first one this closes the layer. */
  const back = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const target = trail.length > 1 ? trail[trail.length - 2].id : originId || null;
    // Where the level we are stepping back INTO was itself opened from.
    const parent = trail.length > 2 ? trail[trail.length - 3].id : null;

    LEVEL_PARAMS.forEach((key) => params.delete(key));

    if (target) {
      params.set('workspace', target);
      if (parent) params.set('from', parent);
      setSearchParams(params, { replace: true });
      setTrail((prev) => (prev.length > 1 ? prev.slice(0, -1) : []));
    } else {
      params.delete('workspace');
      setSearchParams(params, { replace: true });
      setTrail([]);
    }
  }, [trail, originId, setSearchParams]);

  /** Close the layer entirely, back to Vision exactly as it was. */
  const close = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('workspace');
    // Sub-views and origins go with it: a later open starts at the room's root.
    LEVEL_PARAMS.forEach((key) => params.delete(key));
    setSearchParams(params, { replace: true });
    setTrail([]);
  }, [setSearchParams]);

  // A business switch is a hard boundary (Part 20): the content region remounts
  // for the new business, and no level belonging to the previous one survives it
  // — otherwise the owner would be left stepping Back through business A's
  // rooms. Only a real change collapses the trail; first resolution and a deep
  // link are left exactly as they are.
  const previousBusinessRef = useRef(activeBusinessId);
  useEffect(() => {
    const previous = previousBusinessRef.current;
    previousBusinessRef.current = activeBusinessId;
    if (!previous || !activeBusinessId || previous === activeBusinessId) return;
    if (!workspaceId) return;
    const params = new URLSearchParams(window.location.search);
    LEVEL_PARAMS.forEach((key) => params.delete(key));
    setSearchParams(params, { replace: true });
    setTrail([levelOf(workspaceId, params)]);
  }, [activeBusinessId, workspaceId, setSearchParams]);

  const breadcrumb = useMemo(() => {
    const titles = trail
      .slice(0, -1)
      .map((entry) => WORKSPACES[entry.id]?.title)
      .filter(Boolean);
    // "via Data Room" once, however many of its sub-levels were walked.
    return titles.filter((title, index) => title !== titles[index - 1]);
  }, [trail]);

  // The level Back would return to. Null means there is nothing behind this one,
  // so the affordance is Close — out of the room, onto the Vision surface
  // underneath, exactly as it was.
  const backTargetId = trail.length > 1 ? trail[trail.length - 2].id : originId || null;

  return {
    workspaceId,
    payload,
    def,
    isOpen: !!def,
    canGoBack: !!backTargetId,
    // What the header's back control should name — the room it goes to.
    backLabel: backTargetId ? WORKSPACES[backTargetId]?.title || 'Back' : null,
    breadcrumb,
    open,
    replace,
    back,
    close,
  };
}