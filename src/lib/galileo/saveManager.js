/**
 * Save Manager — lightweight bookmark/save system.
 *
 * Saving should feel natural, not like a separate feature.
 * Users can save opportunities, insights, strategies, scenarios,
 * plays, and important Galileo responses.
 *
 * For anonymous users, saves are associated with the temporary session.
 * No account creation required to save.
 *
 * Save acknowledgment is brief: "Saved." — no modal unless necessary.
 */

const STORAGE_KEY_PREFIX = 'vision_galileo_saved_items';

function getStorageKey(businessId) {
  // Business-scoped key prevents cross-business saved-item leakage on switch.
  // For anonymous/guest users (no businessId), use the legacy unscoped key.
  return businessId ? `${STORAGE_KEY_PREFIX}:${businessId}` : STORAGE_KEY_PREFIX;
}

/**
 * getSavedItems — retrieves saved items from session storage.
 * Session-scoped for anonymous users, business-scoped for authenticated.
 */
export function getSavedItems(businessId = null) {
  try {
    const key = getStorageKey(businessId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * saveItem — saves an item and returns the updated list.
 *
 * @param {object} item — { type, title, data, savedAt }
 * @param {string} [businessId] — business scope (prevents cross-business leakage)
 * @returns {object} — { saved: true, items: [...] }
 */
export function saveItem(item, businessId = null) {
  const items = getSavedItems(businessId);
  const newItem = {
    id: `saved_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: item.type || 'insight',
    title: item.title || 'Saved item',
    data: item.data || {},
    savedAt: new Date().toISOString(),
  };
  const updated = [...items, newItem];
  try {
    sessionStorage.setItem(getStorageKey(businessId), JSON.stringify(updated));
  } catch { /* non-fatal */ }
  return { saved: true, items: updated };
}

/**
 * unsaveItem — removes a saved item by id.
 */
export function unsaveItem(itemId, businessId = null) {
  const items = getSavedItems(businessId).filter((i) => i.id !== itemId);
  try {
    sessionStorage.setItem(getStorageKey(businessId), JSON.stringify(items));
  } catch { /* non-fatal */ }
  return { unsaved: true, items };
}

/**
 * isSaved — checks if an item matching the data is already saved.
 */
export function isSaved(itemData, businessId = null) {
  const items = getSavedItems(businessId);
  const key = JSON.stringify(itemData?.id || itemData?.title || itemData);
  return items.some((i) => JSON.stringify(i.data?.id || i.data?.title || i.data) === key);
}

/**
 * getSavedCount — returns the number of saved items.
 */
export function getSavedCount(businessId = null) {
  return getSavedItems(businessId).length;
}

/**
 * promoteSavedItemsToSession — when a guest session is promoted to an account,
 * the guest's saved items must be REASSOCIATED with the canonical business that
 * promotion created.
 *
 * Guest items live under the unscoped key; authenticated reads use the
 * business-scoped key. Without this migration the unscoped guest key would
 * remain the long-term source for an authenticated multi-business user, and its
 * items would surface under every business they own.
 *
 * Items are MOVED, not copied: the guest key is retired so it cannot resurface.
 * With no canonical business to attach to, the guest store is left untouched.
 */
export function promoteSavedItemsToSession(guestSessionId, businessId = null) {
  const items = getSavedItems();
  if (!businessId || items.length === 0) {
    return { items, guestSessionId, migrated: 0, businessId: null };
  }

  // Merge into the business scope, deduping against anything already there.
  const byId = new Map();
  for (const i of getSavedItems(businessId)) byId.set(i.id, i);
  let migrated = 0;
  for (const i of items) {
    if (!byId.has(i.id)) migrated += 1;
    byId.set(i.id, i);
  }

  const merged = [...byId.values()];
  try {
    sessionStorage.setItem(getStorageKey(businessId), JSON.stringify(merged));
    // Retire the guest store — an unscoped key must never be the long-term
    // source for an authenticated multi-business user.
    sessionStorage.removeItem(getStorageKey(null));
  } catch { /* non-fatal */ }

  return { items: merged, guestSessionId, migrated, businessId };
}