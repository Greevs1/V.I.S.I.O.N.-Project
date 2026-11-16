/**
 * presenceStage — the ONE place REAL experience state becomes a visible Galileo
 * state, a size and (rarely) a line of truthful processing copy.
 *
 * WHY IT IS SEPARATE FROM orbPresence
 *
 *   orbPresence  answers "how is one state DRAWN?"
 *   presenceStage answers "which state is the owner actually in, at what size?"
 *
 * Both are pure. Nothing here can invent progress, and no caption is emitted
 * unless real work is in flight — `caption` is only ever filled while
 * `isThinking` is true, which callers set when a genuine computation or request
 * is running. There is no timer in this file.
 *
 * PRIVACY
 *
 * Inputs are booleans and words about the EXPERIENCE. No business value, no
 * document, no identifier, no token ever travels through here.
 */

/**
 * Sizes are the brief's own numbers: a medium presence above the conversation
 * while Galileo is asking, settling once the content beneath it needs the room.
 */
import { ORB_SIZES, resolveOrbSize } from './orbSizes';

// The two conversation emphases ARE the canonical presets (orbSizes); this file
// only decides which one the moment calls for.
const PRESET_FOR = Object.freeze({ focal: 'conversation', settled: 'companion' });

export const PRESENCE_SIZES = Object.freeze({
  focal: ORB_SIZES.conversation,
  settled: ORB_SIZES.companion,
});

export function presenceLayout(emphasis, compact = false) {
  const preset = PRESET_FOR[emphasis] || PRESET_FOR.focal;
  return { preset, size: resolveOrbSize(preset, compact) };
}

/** The only three captions that are ever true while work is happening. */
export const PRESENCE_CAPTIONS = Object.freeze({
  thinking: 'Reviewing what I know…',
  analyzing: 'Connecting what you\u2019ve told me…',
  learning: 'Connecting the pieces…',
});

/**
 * resolvePresence — ordered by what the owner most needs to know right now.
 *
 * Every branch is a statement the application can stand behind:
 *   analyzing/thinking  a real computation or request is in flight
 *   discovery           a genuine insight entry now exists
 *   learning            document understanding is genuinely running
 *   attention           Galileo is presenting a decision
 *   listening           a question is on screen and unanswered
 *   idle                present, waiting, doing nothing at all
 */
export function resolvePresence({
  degraded = false,
  isThinking = false,
  revealing = false,
  hasNewInsight = false,
  learning = false,
  hasDecision = false,
  awaitingAnswer = false,
} = {}) {
  if (degraded) return { state: 'degraded', emphasis: 'settled', caption: null };
  if (isThinking && revealing) {
    return { state: 'analyzing', emphasis: 'focal', caption: PRESENCE_CAPTIONS.analyzing };
  }
  if (isThinking) return { state: 'thinking', emphasis: 'focal', caption: PRESENCE_CAPTIONS.thinking };
  if (hasNewInsight) return { state: 'discovery', emphasis: 'focal', caption: null };
  if (learning) return { state: 'learning', emphasis: 'focal', caption: PRESENCE_CAPTIONS.learning };
  if (hasDecision) return { state: 'attention', emphasis: 'settled', caption: null };
  if (awaitingAnswer) return { state: 'listening', emphasis: 'focal', caption: null };
  return { state: 'idle', emphasis: 'focal', caption: null };
}