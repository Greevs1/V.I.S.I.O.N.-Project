/**
 * useImplementationPlan — the implementation preview and the Sprint it becomes.
 *
 * REUSE, NOT A SECOND ENGINE
 *   preview → ninetyDaySprint `previewSprint`: the SAME generator, context load
 *             and fallback as `generateSprint`, returning the plan without
 *             writing anything.
 *   build   → ninetyDaySprint `selectPath` then `generateSprint`, the exact
 *             sequence the 90-Day Sprint workspace already runs. The plan the
 *             owner was shown is passed through as `planned_tasks`, so the
 *             Sprint they build is the one they previewed.
 *
 * Every call carries the canonical active_business_id, and a response that
 * arrives after a business switch is discarded.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const IDLE = { status: 'idle', tasks: [], contextUsed: false, key: null };

export function useImplementationPlan(businessId) {
  const [plan, setPlan] = useState(IDLE);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(null);

  const businessRef = useRef(businessId);
  businessRef.current = businessId;
  const seqRef = useRef(0);
  const lastRef = useRef(null);
  const cacheRef = useRef(new Map());

  // A plan belongs to one business. Drop it the moment the business changes.
  useEffect(() => {
    seqRef.current += 1;
    cacheRef.current = new Map();
    lastRef.current = null;
    setPlan(IDLE);
    setBuildError(null);
  }, [businessId]);

  const preview = useCallback(async ({ title, goal }) => {
    const biz = businessRef.current;
    if (!biz || !title) return;
    const key = `${biz}::${title}::${goal || ''}`;
    lastRef.current = { title, goal };
    setBuildError(null);

    const cached = cacheRef.current.get(key);
    if (cached) {
      setPlan(cached);
      return;
    }

    const seq = ++seqRef.current;
    setPlan({ ...IDLE, status: 'loading', key });
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'previewSprint',
        data: { active_business_id: biz, sprint_title: title, sprint_goal: goal || title },
      });
      if (seq !== seqRef.current || biz !== businessRef.current) return;
      const tasks = Array.isArray(res?.data?.tasks) ? res.data.tasks : [];
      if (tasks.length === 0) throw new Error('empty plan');
      const ready = { status: 'ready', tasks, contextUsed: !!res?.data?.contextUsed, key };
      cacheRef.current.set(key, ready);
      setPlan(ready);
    } catch (err) {
      console.error('[useImplementationPlan] preview failed:', err?.response?.data || err?.message || err);
      if (seq === seqRef.current) setPlan({ ...IDLE, status: 'error', key });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRef.current) {
      cacheRef.current.clear();
      preview(lastRef.current);
    }
  }, [preview]);

  /** Build the REAL Sprint through the existing lifecycle. Returns the sprint. */
  const build = useCallback(async ({ title, goal, summary, opportunityId, tasks }) => {
    const biz = businessRef.current;
    if (!biz || !title) return null;
    setBuilding(true);
    setBuildError(null);
    try {
      const selectRes = await base44.functions.invoke('ninetyDaySprint', {
        action: 'selectPath',
        data: {
          active_business_id: biz,
          pathId: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60),
          pathTitle: title,
          pathGoal: goal || title,
          pathSummary: summary || goal || title,
          ...(opportunityId ? { opportunityBase44Id: opportunityId } : {}),
        },
      });
      const sprint = selectRes?.data?.sprint;
      if (!sprint?.id) throw new Error(selectRes?.data?.error || 'Sprint was not created');

      if (!selectRes?.data?.restored) {
        await base44.functions.invoke('ninetyDaySprint', {
          action: 'generateSprint',
          data: {
            active_business_id: biz,
            sprint_id: sprint.id,
            sprint_title: sprint.path_title || title,
            sprint_goal: sprint.path_goal || goal || title,
            planned_tasks: tasks || [],
          },
        });
      }
      return sprint;
    } catch (err) {
      console.error('[useImplementationPlan] build failed:', err?.response?.data || err?.message || err);
      setBuildError("Vision couldn't build your Sprint just now.");
      return null;
    } finally {
      setBuilding(false);
    }
  }, []);

  return { plan, preview, retry, build, building, buildError };
}