/**
 * VisionHeader — the minimal premium top navigation.
 *
 *   [Vision mark] Vision   Business ▾        BI %  MODE  Destinations  🔔  [profile]
 *
 * Left:  the product (Vision) and the active business. The business selector
 *        still resolves through the canonical active-business contract — this
 *        component only renders what the caller resolved.
 * Right: only controls backed by real behaviour. There is no global search in
 *        this shell, so no search icon is rendered rather than a dead one.
 *
 * CINEMATIC GLASS, not a nav bar.
 * The header is an OVERLAY: it is fixed over the scene and reserves no opaque
 * strip, so the cinematic background and the scrolling Vision content genuinely
 * pass underneath it. Only three states change its surface:
 *
 *   TOP       ~20% tint, 12px blur — almost invisible glass
 *   SCROLLED  ~50% tint, 18px blur — just enough frost to keep controls legible
 *   WORKSPACE ~55% tint, 20px blur — a little more separation while a workspace
 *             is open, still recognisably the same Vision glass
 *
 * There is no border; a hairline gradient that dissolves at both ends takes its
 * place, and at the top of Home a soft fade carries the surface into the
 * content below.
 *
 * BRAND — the V.I.S.I.O.N. wordmark is the brand lockup; there is no second
 * mark and no duplicate wordmark text beside it. The asset carries large
 * transparent margins, so it is rendered inside a clip window sized to its
 * visible band (see VISION_WORDMARK_BOX) — that is what lets the letters sit at
 * roughly half the header height without a 255px-tall image in a 56px row.
 */

import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import BusinessSelector from '@/components/galileo/home/BusinessSelector';
import ModeIndicator from '@/components/galileo/shell/ModeIndicator';
import GalileoNavMenu from '@/components/galileo/shell/GalileoNavMenu';
import NotificationBell from '@/components/notifications/NotificationBell';
import VisionAccountMenu from '@/components/galileo/shell/VisionAccountMenu';
import { useAuth } from '@/lib/AuthContext';
import { VISION_WORDMARK_URL } from '@/lib/visionBrand';

// Literal class strings only — Tailwind purges anything assembled dynamically.
const SURFACE = {
  top: 'bg-vision-surface/20 backdrop-blur-[12px]',
  scrolled: 'bg-vision-surface/50 backdrop-blur-[18px]',
  workspace: 'bg-vision-surface/55 backdrop-blur-[20px]',
};

// Legibility insurance over the brightest part of the scene. A soft shadow is
// used rather than a darker surface, so the transparency survives.
const SOFT_SHADOW = { textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)' };

/**
 * The wordmark's clip window, measured from the asset rather than guessed.
 *
 * The PNG is a 3:2 canvas (1536×1024) whose visible band — letters plus gold
 * flare — occupies x 127–1373, y 402–562. So:
 *   the band is 7.75:1 (1247 × 161),
 *   it starts 39.26% down the image,
 *   8.27% in from the left.
 *
 * The window below is that band; the image inside is scaled to 637% of the
 * window height (161px of 1024) and pulled back by those two offsets, expressed
 * as percentages of the image's own box so the geometry holds at every size.
 * The letters themselves land at ~73% of the window height.
 *
 * Sizes step with the viewport: a 16px band on phones, 24px from md and 28px at
 * lg — 70% of the previous lockup, so the wordmark reads as brand rather than
 * banner.
 */
const VISION_WORDMARK_BOX = {
  window: 'relative block h-4 shrink-0 overflow-hidden w-[124px] md:h-6 md:w-[186px] lg:h-7 lg:w-[217px]',
  image: {
    className: 'absolute left-0 top-0 h-[637%] w-auto max-w-none',
    style: { transform: 'translate(-8.27%, -39.26%)' },
  },
};

export default function VisionHeader({
  business,
  biPercent = null,
  mode = null,
  showMode = false,
  scrolled = false,
  workspaceOpen = false,
  onOpenSprint,
  onOpenWorkspace,
}) {
  const { allBusinesses, isMultiBusiness, activeContext, setActiveContext } = useAuth();

  // Switching goes through the same canonical active-business contract the
  // rest of the app uses. Nothing about business resolution is reimplemented
  // here — the header only triggers it.
  const handleSelectBusiness = useCallback(
    (next) => {
      if (!next || next.id === activeContext?.businessId) return;
      setActiveContext({
        type: 'business',
        businessId: next.id,
        businessIds: activeContext?.businessIds,
      });
    },
    [setActiveContext, activeContext]
  );

  const surfaceState = workspaceOpen ? 'workspace' : scrolled ? 'scrolled' : 'top';

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-30',
        'transition-[background-color,backdrop-filter] duration-300 ease-out',
        SURFACE[surfaceState],
      ].join(' ')}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1360px] items-center gap-3 px-4 md:px-8">
        {/* ── Left: product + active business ── */}
        <Link
          to="/galileo"
          className="flex shrink-0 items-center rounded-lg vision-focus"
          aria-label="Vision home"
        >
          {/* The wordmark is the brand. No second mark, no duplicate wordmark
              text beside it, and no blend treatment — the asset is already
              champagne artwork on a transparent field, made for dark glass. */}
          <span className={VISION_WORDMARK_BOX.window}>
            <img
              src={VISION_WORDMARK_URL}
              alt=""
              className={VISION_WORDMARK_BOX.image.className}
              style={VISION_WORDMARK_BOX.image.style}
            />
          </span>
        </Link>

        <span className="hidden h-5 w-px bg-white/[0.08] sm:block" />

        <BusinessSelector
          currentBusiness={business ? { id: business.id, name: business.name } : null}
          businesses={isMultiBusiness ? allBusinesses || [] : []}
          onSelect={handleSelectBusiness}
        />

        {/* ── Right: intelligence state + destinations + account ── */}
        <div className="ml-auto flex items-center gap-1.5 md:gap-3">
          {/* Quiet contextual indicators — small type, muted, hairline divided. */}
          {biPercent != null && biPercent > 0 && (
            <span
              className="hidden items-center text-[10px] tracking-wide text-white/30 lg:flex"
              style={SOFT_SHADOW}
            >
              Business Intelligence&nbsp;
              <span className="font-semibold text-vision-champagne/80">{biPercent}%</span>
            </span>
          )}

          {showMode && mode && (
            <>
              <span className="hidden h-3 w-px bg-white/[0.07] lg:block" />
              <span className="hidden sm:inline">
                <ModeIndicator mode={mode} />
              </span>
            </>
          )}

          <span className="hidden h-3.5 w-px bg-white/[0.06] md:block" />

          <GalileoNavMenu onOpenSprint={onOpenSprint} onOpenWorkspace={onOpenWorkspace} />

          <NotificationBell />

          {/* One account control, same place in the header — it now opens the
              account menu (Settings, Admin for authorized roles, Sign Out)
              instead of jumping straight into Settings. */}
          <VisionAccountMenu onOpenWorkspace={onOpenWorkspace} />
        </div>
      </div>

      {/* Edge — a hairline that dissolves at both ends instead of a divider. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.055) 16%, rgba(255,255,255,0.075) 50%, rgba(255,255,255,0.055) 84%, transparent 100%)',
        }}
      />

      {/* At the top of Home the surface fades into the content beneath it. */}
      {surfaceState === 'top' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-full h-10"
          style={{
            background: 'linear-gradient(180deg, rgba(5,5,9,0.26) 0%, transparent 100%)',
          }}
        />
      )}
    </header>
  );
}