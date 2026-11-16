/**
 * Vision brand + atmosphere assets — both are replaceable slots.
 *
 * ── LOGO ────────────────────────────────────────────────────────────────────
 * The real V.I.S.I.O.N. Platform brand mark (the app's platform brand asset).
 * It is flat black artwork on an opaque white field, so the header renders it
 * with an invert + screen-blend treatment to place the mark on dark glass
 * without a white plate behind it.
 *
 * Replace VISION_LOGO_URL with a transparent-background (or light-on-dark)
 * mark when one exists, then set VISION_LOGO_ON_DARK_PLATE to false to drop
 * the treatment.
 *
 * ── BACKGROUND ──────────────────────────────────────────────────────────────
 * Cinematic atmosphere slot — NOT content. It sits behind the upper
 * experience and fades into the application surface below the hero.
 *
 * Expected asset:
 *   - Subject: layered landscape / horizon with real atmospheric depth
 *   - Light: dusk or sunset, warm champagne/gold horizon, deep navy shadow
 *   - Minimum 2560×1440, 16:9 or wider (object-cover crops on mobile)
 *   - Composition: subject and warmth in the upper third; the lower third
 *     already near-black so overlay text stays readable
 *   - Must be licensed for production use
 *
 * To swap it, replace VISION_HERO_BACKGROUND_URL below. No component changes
 * are needed — CinematicBackground reads only these constants.
 */

export const VISION_LOGO_URL =
  'https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/ea1f2674c_ChatGPTImageJun15202603_22_28PM.png';

/** True while the logo asset is dark artwork on an opaque white field. */
export const VISION_LOGO_ON_DARK_PLATE = true;

/**
 * ── WORDMARK ────────────────────────────────────────────────────────────────
 * The champagne V.I.S.I.O.N. wordmark with the gold flare behind the "I".
 * Transparent PNG, so it needs no blend treatment on dark glass.
 *
 * Measured geometry (matters to the header that renders it): the artwork is a
 * 1536×1024 canvas, but the visible band — letters plus flare — is only
 * x 127–1373, y 402–562. That is ~81% of the width and ~16% of the height, so
 * the header clips this window instead of sizing the raw canvas, which would
 * otherwise need a 255px-tall image inside a 56px row. If the asset is ever
 * replaced with different padding, re-measure and update the window in
 * VisionHeader (VISION_WORDMARK_BOX).
 */
export const VISION_WORDMARK_URL =
  'https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/4e6420715_ChatGPTImageJul8202603_20_52PM.png';

/**
 * The clip window that renders the wordmark at its visible band, at two
 * presentation sizes: a small header lockup and a larger arrival lockup.
 *
 * The transform and the 637% image height are the measured geometry described
 * above; only the window's own size changes between the two. Literal class
 * strings only — Tailwind purges anything assembled dynamically.
 */
export const VISION_WORDMARK_WINDOW = {
  window: 'relative block overflow-hidden h-7 w-[217px] md:h-11 md:w-[341px]',
  image: {
    className: 'absolute left-0 top-0 h-[637%] w-auto max-w-none',
    style: { transform: 'translate(-8.27%, -39.26%)' },
  },
};

export const VISION_HERO_BACKGROUND_URL =
  'https://media.base44.com/images/public/6a2338cb6dd7f8bfcf561ec3/e7d9e770c_generated_image.png';