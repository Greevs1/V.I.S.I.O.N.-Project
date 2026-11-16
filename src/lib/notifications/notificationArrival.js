/**
 * Notification ARRIVALS — the difference between "something just arrived" and
 * "something is unread".
 *
 * The bell has always known the second. The moment a person should be told is the
 * first, and it is a much narrower question:
 *
 *   NEWLY ARRIVED  — a notification this session has never seen, created after
 *                    the app was opened.
 *   NOT AN ARRIVAL — a refresh, a remount, a refetch, opening the bell, a switch
 *                    of business, or an old unread notice loading for the first
 *                    time. None of those are news.
 *
 * The tracker is per-mount on purpose: a remount (or a page refresh) starts a
 * fresh tracker, seeds itself from what already exists, and therefore replays
 * nothing. The created_date guard is the second belt: a notice older than this
 * mount can never be treated as arriving, however late it appears in a fetch.
 */

/** Is this the kind of notification the arrival experience speaks for? */
export function isAssignmentArrival(notification) {
  return notification?.notification_type === 'document_assigned';
}

/**
 * @param {number} mountedAt epoch ms of this session's start.
 */
export function createArrivalTracker(mountedAt = Date.now()) {
  const seen = new Set();
  let seeded = false;

  return {
    /**
     * Record everything in the list; return only what genuinely just arrived,
     * newest first.
     */
    diff(notifications = []) {
      const fresh = [];
      for (const item of notifications) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        // The first pass only LEARNS. Nothing arrives because the app opened.
        if (!seeded) continue;
        const createdAt = item.created_date ? new Date(item.created_date).getTime() : 0;
        if (createdAt > mountedAt) fresh.push(item);
      }
      seeded = true;
      return fresh;
    },
  };
}

/**
 * ONE shared audio element, created lazily. Sound is enhancement only: every
 * failure path here is silent, because a chime must never cost a notification.
 * Browsers block playback before the user has interacted with the page — that
 * rejection is swallowed, the visual bubble still shows, and once ordinary
 * interaction permits audio the same call simply starts working.
 */
let chime = null;

export function playArrivalChime(url, { volume = 0.35 } = {}) {
  try {
    if (!chime) {
      chime = new Audio(url);
      chime.preload = 'auto';
    }
    chime.volume = volume;
    chime.currentTime = 0;
    const started = chime.play();
    if (started && typeof started.catch === 'function') started.catch(() => {});
  } catch {
    /* silence is the correct failure */
  }
}