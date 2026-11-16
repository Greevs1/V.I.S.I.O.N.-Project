/**
 * journeyTranscript.js
 *
 * Lightweight in-memory + sessionStorage Journey Transcript.
 * Every Galileo coaching message is saved here so the user can replay
 * any explanation and search previous guidance.
 *
 * Transcript entry: { fieldKey, message, timestamp }
 */

const STORAGE_KEY = 'vision_journey_transcript';

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entries) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full — silently skip
  }
}

export function addToTranscript({ fieldKey, message }) {
  if (!fieldKey || !message) return;
  const entries = load();
  // Avoid duplicates for same fieldKey in same session
  const exists = entries.some(e => e.fieldKey === fieldKey);
  if (exists) return;
  entries.push({ fieldKey, message, timestamp: new Date().toISOString() });
  save(entries);
}

export function getTranscript() {
  return load();
}

export function clearTranscript() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function searchTranscript(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  return load().filter(e =>
    e.message.toLowerCase().includes(q) || e.fieldKey.toLowerCase().includes(q)
  );
}