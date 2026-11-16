/**
 * Vision Workspace Registry — ONE CONTENT IMPLEMENTATION, MULTIPLE SHELLS.
 *
 * Every entry points at an EXISTING page/component. Each of those files is
 * already a pure content surface: the legacy chrome (AppLayout + Sidebar) is
 * applied at the ROUTE level in App.jsx, never inside the file. So mounting one
 * here gives the real content with no legacy sidebar, and no functionality is
 * copied or reimplemented.
 *
 * Everything is lazy — opening Vision Home mounts none of these (Part 24).
 *
 *   id            — the deep-link value: /galileo?workspace=<id>
 *   payload       — optional &id=<payload> for a sub-surface inside the workspace
 *   askContext    — the compact Ask Galileo affordance's context label (Part 21)
 */

import { lazy } from 'react';

export const WORKSPACES = {
  dashboard: {
    id: 'dashboard',
    title: 'Detailed Analytics',
    askContext: 'your detailed analytics',
    Component: lazy(() => import('@/pages/Dashboard')),
  },
  sprint: {
    id: 'sprint',
    title: '90-Day Sprint',
    askContext: 'this 90-Day Sprint',
    Component: lazy(() => import('@/components/sprint/SprintCommandCenter')),
  },
  // Global Rule #1 — documents live INSIDE Galileo.
  // The id stays `data-room` because it is the document contract's own deep-link
  // shape (openDocument.js, the Data Room's `?document=` read, every existing
  // link and bookmark). Only the PRESENTATION changed: the shell is now the
  // Galileo document overlay, which renders the real Data Room (library, folder
  // handling, process state, review tab, viewer) and the real uploader.
  'data-room': {
    id: 'data-room',
    title: 'Data Room',
    askContext: 'your documents',
    Component: lazy(() => import('@/components/galileo/documents/GalileoDocumentOverlay')),
  },
  assessments: {
    id: 'assessments',
    title: 'Assessments',
    askContext: 'your assessments',
    Component: lazy(() => import('@/components/vision/workspace/AssessmentCenter')),
  },
  valuation: {
    id: 'valuation',
    title: 'Business Valuation',
    askContext: 'your business valuation',
    Component: lazy(() => import('@/pages/advisory/BusinessValuation')),
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    askContext: 'your account',
    Component: lazy(() => import('@/pages/Settings')),
  },
  // The real expert surface: find an expert, see saved experts, apply to work
  // with one. Owner-accessible at the route level, so exposing it inside Vision
  // grants no access that did not already exist.
  'expert-network': {
    id: 'expert-network',
    title: 'Expert Network',
    askContext: 'the expert network',
    Component: lazy(() => import('@/pages/ExpertNetwork')),
  },
  // Admin — the EXISTING AdminView (same file the legacy /admin route renders)
  // mounted as a native VISION workspace, so Profile → Admin never leaves Vision.
  // The id is the URL contract: /galileo?workspace=admin, with the administrative
  // SUBJECT in the layer's own `id` slot (&id=<subject email>) so Back walks one
  // level out. Workspace-level authorization lives in the host, fail-closed.
  admin: {
    id: 'admin',
    title: 'Admin',
    askContext: 'platform administration',
    Component: lazy(() => import('@/components/admin/AdminWorkspaceHost')),
  },
};

export const WORKSPACE_IDS = Object.keys(WORKSPACES);

export function resolveWorkspace(id) {
  return (id && WORKSPACES[id]) || null;
}