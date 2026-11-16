#!/usr/bin/env node
/**
 * visionArrival.test.cjs — the anonymous arrival contract (V1–V28).
 *
 * These checks assert the STRUCTURE, the ORDER and the WORDS of the entrance:
 * that the existing film is the only film, that the arrival hands its subject
 * choice to the existing conversation, that the introduction is a SEQUENCE (one
 * message at a time, in a fixed order, in a reserved band) rather than a page of
 * stacked copy, that the timeline can always be cut short, and that the orb is the
 * existing visualization receiving presentational state only.
 *
 * Whether the composition LOOKS right on a real screen — and whether the orb
 * actually reads as alive over ten seconds — is a browser fact and is NOT claimed
 * here.
 *
 * Run: node src/scripts/visionArrival.test.cjs
 */

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

const CONTENT = 'src/lib/galileo/arrivalContent.js';
const SEQUENCE = 'src/lib/galileo/arrivalSequence.js';
const ARRIVAL = 'src/components/galileo/arrival/VisionArrival.jsx';
const REVEAL = 'src/components/galileo/arrival/ArrivalReveal.jsx';
const STAGE = 'src/components/galileo/arrival/ArrivalMessageStage.jsx';
// The acknowledgement now lives beneath the SAME Galileo inside the reveal.
const ACK = 'src/components/galileo/arrival/ArrivalReveal.jsx';
const INTRO = 'src/components/experience/IntroExperience.jsx';
const JOURNEY_MGR = 'src/components/experience/ExperienceManager.jsx';
const REIMAGINED = 'src/pages/galileo/GalileoReimagined.jsx';
const HOOK = 'src/hooks/useGalileoConversation.js';

const FORBIDDEN = [
  'revenue', 'ebitda', 'business_id', 'email', 'token', 'signed_url', 'document_id',
  'ssn', 'account_number', 'evidence', 'signedUrl',
];

const loadModule = (src, names) => {
  const sizes = require('fs').readFileSync(require('path').resolve(__dirname, '../lib/galileo/orbSizes.js'), 'utf8');
  const js = ((/orbSizes/.test(src) ? sizes + '\n' : '') + src.replace(/^import[^\n]*\n/gm, ''))
    .replace(/export const /g, 'const ').replace(/export function /g, 'function ');
  return new Function(`${js};return ({${names.join(', ')}});`)();
};

/** The sequence module imports the copy and pacing modules; load it the same way. */
const loadSequence = (src, copy) => {
  const pace = require('fs').readFileSync(
    require('path').resolve(__dirname, '../lib/galileo/readingPace.js'),
    'utf8',
  );
  const js = (pace + '\n' + src.replace(/^\s*import[^\n]*\n/gm, ''))
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ');
  return new Function('ARRIVAL_COPY', `${js};return ({ buildArrivalSequence, ARRIVAL_TIMING });`)(copy);
};

/**
 * Ask the arrival whether the INTRODUCTION runs, with BOTH facts stubbed: the film's
 * durable flag (localStorage) and the sequence's own session flag (sessionStorage).
 * Keeping them separate here is the point — the film flag must not decide this.
 */
const arrivalFlag = (mod, search, { film = false, sequence = false } = {}) => {
  global.window = {
    location: { search },
    localStorage: { getItem: () => (film ? 'true' : null) },
    sessionStorage: { getItem: () => (sequence ? 'true' : null) },
  };
  try {
    return mod.shouldPlayArrivalSequence();
  } finally {
    delete global.window;
  }
};

function runChecks(sources = {}) {
  const failures = [];
  const check = (id, label, ok, detail = '') => {
    if (!ok) failures.push(`${id} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const contentSrc = sources.CONTENT ?? read(CONTENT);
  const sequenceSrc = sources.SEQUENCE ?? read(SEQUENCE);
  const arrivalSrc = sources.ARRIVAL ?? read(ARRIVAL);
  const revealSrc = sources.REVEAL ?? read(REVEAL);
  const stageSrc = sources.STAGE ?? read(STAGE);
  const ackSrc = sources.ACK ?? read(ACK);
  const introSrc = sources.INTRO ?? read(INTRO);
  const journeySrc = sources.JOURNEY_MGR ?? read(JOURNEY_MGR);
  const reimaginedSrc = sources.REIMAGINED ?? read(REIMAGINED);
  const hookSrc = sources.HOOK ?? read(HOOK);

  const C = loadModule(contentSrc, [
    'ARRIVAL_COPY', 'ARRIVAL_OPTIONS', 'ARRIVAL_ACKNOWLEDGEMENT', 'ARRIVAL_ORB',
    'INTRO_SEEN_KEY', 'ARRIVAL_FILM_KEY', 'shouldShowArrival', 'shouldPlayIntroVideo', 'acknowledgementFor',
    'resolveEntrySurface', 'shouldPlayArrivalSequence', 'ARRIVAL_SEQUENCE_KEY',
  ]);
  const SEQ = loadSequence(sequenceSrc, C.ARRIVAL_COPY);
  const full = SEQ.buildArrivalSequence({});
  const short = SEQ.buildArrivalSequence({ reduced: true });
  const kindAt = (k) => full.beats.find((b) => b.kind === k);

  const arrivalCode = stripComments(arrivalSrc);
  const revealCode = stripComments(revealSrc);
  const stageCode = stripComments(stageSrc);
  const ackCode = stripComments(ackSrc);
  const arrivalSurface = `${arrivalCode}\n${revealCode}\n${stageCode}\n${ackCode}`;

  // ── V1 / V2 — the EXISTING film, and only one film ─────────────────────────
  const videoUrls = (introSrc.match(/https:\/\/media\.base44\.com\/videos\/[^'"]+/g) || []);
  const allSrc = [contentSrc, sequenceSrc, arrivalSrc, revealSrc, stageSrc, ackSrc, introSrc].join('\n');
  check('V1', 'the existing VISION intro video is reused, not replaced',
    videoUrls.length === 1
    && videoUrls[0].includes('be6c89ab6_Visionintrovideo.mp4')
    && /import IntroExperience/.test(arrivalSrc)
    && /<IntroExperience/.test(arrivalSrc),
    `urls=${videoUrls.length}`);
  check('V2', 'no second intro video or media element was introduced',
    /\.mp4/g.test(allSrc) === false || (allSrc.match(/\.mp4/g) || []).length === 1,
    `mp4 refs=${(allSrc.match(/\.mp4/g) || []).length}`);

  // ── V3 / V23 — who sees it, and who is spared it ───────────────────────────
  check('V3', 'a fresh first run gets the arrival — anonymous OR signed in without a business',
    C.resolveEntrySurface({}) === 'arrival'
    && C.resolveEntrySurface({ isHomeMode: false }) === 'arrival'
    && C.resolveEntrySurface({ isHomeMode: true }) === 'home'
    && C.resolveEntrySurface({ authLoading: true }) === 'resolving'
    && C.resolveEntrySurface({ conversationStarted: true }) === 'loop'
    && /surface === 'arrival'/.test(reimaginedSrc)
    && !/arrivalOpen && !home\.isAuthenticated/.test(reimaginedSrc));
  check('V23', 'an established visitor is not forced through it again',
    C.shouldShowArrival({ isAuthenticated: true }) === false
    && C.shouldShowArrival({ conversationHasStarted: true }) === false
    && C.INTRO_SEEN_KEY === 'vision_intro_completed'
    && C.ARRIVAL_FILM_KEY === 'vision_arrival_film_seen_v2'
    && /setItem\(INTRO_SEEN_KEY/.test(contentSrc)
    && journeySrc.includes(`'${C.INTRO_SEEN_KEY}'`),
    `key=${C.INTRO_SEEN_KEY}`);

  // ── V4 / V5 — both ends of the film land in the same place, with no reload ─
  check('V4', 'video completion enters the Galileo introduction without a reload',
    /onComplete=\{finishVideo\}/.test(arrivalSrc) && /setPhase\('reveal'\)/.test(arrivalSrc)
    && !/window\.location|navigate\(/.test(arrivalSurface));
  check('V5', 'skip enters the same introduction',
    /onSkip=\{finishVideo\}/.test(arrivalSrc));

  // ── V6 — autoplay refusal is graceful ─────────────────────────────────────
  check('V6', 'autoplay failure falls back to an elegant still frame with a way in',
    /needsGesture/.test(introSrc) && /Enter VISION/.test(introSrc)
    && /poster=\{VISION_HERO_BACKGROUND_URL\}/.test(introSrc)
    && /preload="metadata"/.test(introSrc));

  // ── V7 — the real brand asset, not a text approximation ───────────────────
  check('V7', 'the production VISION wordmark is used',
    /VISION_WORDMARK_URL/.test(revealSrc) && /VISION_WORDMARK_URL/.test(introSrc)
    && /VISION_WORDMARK_WINDOW/.test(revealSrc)
    && !/>V\.I\.S\.I\.O\.N\.</.test(revealCode));

  // ── V8 / V9 — the existing Galileo visual, visibly mounted ────────────────
  check('V8', 'the existing Galileo orb component is reused, never re-implemented',
    /import GalileoOrb from '@\/components\/galileo\/identity\/GalileoOrb'/.test(revealSrc)
    && /import GalileoOrb from '@\/components\/galileo\/identity\/GalileoOrb'/.test(ackSrc)
    && !/getContext|requestAnimationFrame|new THREE/.test(arrivalSurface));
  check('V9', 'the orb is mounted on the arrival at hero size',
    /<GalileoOrb/.test(revealSrc)
    // Canvas sizes; the visible sphere is 80% → 260–320 desktop / 170–210 mobile.
    && C.ARRIVAL_ORB.desktop * 0.8 >= 260 && C.ARRIVAL_ORB.desktop * 0.8 <= 320
    && C.ARRIVAL_ORB.mobile * 0.8 >= 170 && C.ARRIVAL_ORB.mobile * 0.8 <= 210,
    `desktop=${C.ARRIVAL_ORB.desktop} mobile=${C.ARRIVAL_ORB.mobile}`);

  // ── V10–V14 — the words, verbatim, in their order ────────────────────────
  check('V10', "the headline is the brief's headline, and it opens the sequence",
    C.ARRIVAL_COPY.headline === 'See what your business is really capable of.'
    && kindAt('hook').copy === C.ARRIVAL_COPY.headline
    && full.beats.indexOf(kindAt('hook')) === 1);
  check('V11', 'the introduction names Galileo, beneath the promise, in ONE stage',
    C.ARRIVAL_COPY.meet === 'Meet Galileo, your business intelligence.'
    && kindAt('hook').meet === C.ARRIVAL_COPY.meet
    && /beat\.meet/.test(stageSrc));
  check('V12', 'the script is exactly three stages: the promise, the reason to share, the question',
    // Stage 2, verbatim — the one explanatory paragraph the brief specifies.
    C.ARRIVAL_COPY.context.startsWith('Give Galileo a little context')
    && C.ARRIVAL_COPY.context.includes('what deserves your attention')
    && C.ARRIVAL_COPY.context.includes('what could make your business more valuable.')
    && /ARRIVAL_COPY\.context/.test(sequenceSrc)
    // The retired script — the rotating teaser lines and the six-forces row — is
    // GONE, not hidden: neither is part of the three stages.
    && !/ARRIVAL_COPY\.teaser|ARRIVAL_COPY\.forces|ARRIVAL_COPY\.supporting/.test(`${sequenceSrc}${stageSrc}${revealSrc}`)
    && !/<ArrivalForces/.test(stageSrc)
    && full.beats.map((b) => b.kind).join(',') === 'form,hook,context');
  check('V13', 'the reason to share promises only a start, and it is readable copy',
    C.ARRIVAL_COPY.context.startsWith('Give Galileo a little context')
    && C.ARRIVAL_COPY.context.includes('begin showing you')
    && !/will show you|guarantee|promise|ensure/i.test(C.ARRIVAL_COPY.context)
    // Not fine print: reading size, readable contrast, a controlled measure.
    && /text-\[15\.5px\]/.test(stageSrc) && /md:text-\[17px\]/.test(stageSrc)
    && /text-white\/\[0\.84\]/.test(stageSrc));
  check('V14', 'the visitor is told no account is required',
    C.ARRIVAL_COPY.noAccount === 'No account required to start.'
    && revealSrc.includes('ARRIVAL_COPY.noAccount'));

  // ── V15–V18 — canonical values, no gate before value ────────────────────
  check('V15', 'My Business keeps its canonical value',
    C.ARRIVAL_OPTIONS.some((o) => o.value === 'my_business') && /'my_business'/.test(hookSrc));
  check('V16', 'A Client keeps its canonical value',
    C.ARRIVAL_OPTIONS.some((o) => o.value === 'a_client')
    && C.ARRIVAL_OPTIONS.some((o) => o.label === 'A Client')
    && /'a_client'/.test(hookSrc));
  check('V17', 'every existing intent value is unchanged',
    /find_opportunities/.test(hookSrc) && /improve_cash_flow/.test(hookSrc)
    && /lower_taxes/.test(hookSrc) && /increase_profit/.test(hookSrc)
    && /increase_value/.test(hookSrc) && /get_ready_to_sell/.test(hookSrc)
    && /reduce_dependency/.test(hookSrc) && /already_implementing/.test(hookSrc)
    && /not_sure/.test(hookSrc)
    && /prompt: 'What would you most like to uncover\?'/.test(hookSrc)
    && !/What would be useful today/.test(hookSrc));
  check('V18', 'the arrival hands the choice to the existing conversation path',
    /loop\.respond\('context'/.test(reimaginedSrc)
    && /startConversation/.test(reimaginedSrc)
    && /autoStart: false/.test(reimaginedSrc)
    && !/base44\.auth|loginWithProvider|\/login|UploadPrivateFile|invoke\('googleDriveImport'/.test(arrivalSurface));

  // ── V19 / V20 — no connection, no upload, nothing to hand over ────────────
  check('V19', 'no financial connection is demanded before exploration',
    !/connectAppUser|connectAppUserConnector|share_financials/.test(arrivalSurface));
  check('V20', 'no document upload is demanded before exploration',
    !/UploadPublicFile|UploadPrivateFile|ExtractDataFromUploadedFile|uploadDocument/.test(arrivalSurface));

  // ── V21 — the visualization's boundary is unchanged ──────────────────────
  const orbCalls = revealCode.match(/<GalileoOrb[^>]*>/g) || [];
  const leaked = [...new Set(FORBIDDEN.filter((k) => arrivalSurface.includes(k)))];
  check('V21', 'the orb receives presentation state only',
    orbCalls.length > 0
    && orbCalls.every((c) => /state=/.test(c) && /size=/.test(c) && /intelligence=/.test(c)
      && !/business|value=|answers|facts|id=/.test(c))
    && leaked.length === 0,
    leaked.length ? `found=${leaked.join(',')}` : `${orbCalls.length} orb call(s)`);

  // ── V22 — reduced motion is respected ───────────────────────────────────
  check('V22', 'prefers-reduced-motion compresses the sequence and drops the travel',
    /useReducedMotion/.test(revealSrc) && /useReducedMotion/.test(ackSrc)
    && /emerge=\{!reduced\}/.test(revealSrc)
    && /buildArrivalSequence\(\{ reduced \}\)/.test(revealSrc)
    // Crossfade only: no vertical travel under reduced motion.
    && /reduced \? FADE : ENTER/.test(stageSrc)
    && /const ENTER = \{ opacity: 0, y: 6 \}/.test(stageSrc)
    && /const LEAVE = \{ opacity: 0, y: -4 \}/.test(stageSrc)
    // Reduced motion shortens the FADES, never the reading time: a visitor who asks
    // for less movement is not asking to read faster.
    && short.totalMs < full.totalMs
    && short.beats.find((b) => b.kind === 'hook').holdMs === full.beats.find((b) => b.kind === 'hook').holdMs
    && short.beats.find((b) => b.kind === 'context').holdMs === full.beats.find((b) => b.kind === 'context').holdMs
    && short.beats.find((b) => b.kind === 'hook').fadeInMs < full.beats.find((b) => b.kind === 'hook').fadeInMs,
    `reduced=${short.totalMs}ms full=${full.totalMs}ms`);

  // ── V24 — ONE message at a time: the introduction is a sequence ──────────
  check('V24', 'the introduction speaks one line at a time, never a stack',
    /mode="wait"/.test(stageSrc) && /key=\{beat\.id\}/.test(stageSrc)
    // Exactly one message stage exists, fed by the beat the runner is on.
    && (revealSrc.match(/<ArrivalMessageStage/g) || []).length === 1
    && /sequence\.beats\[stageIndex\]/.test(revealSrc)
    // ONE region renders either the current stage's copy or the interaction —
    // never both, and never an empty placeholder occupying the height.
    && /!speaking && children/.test(stageSrc)
    // One stage forward, never past the question, and through the ONE transition.
    && /const target = Math\.max\(0, Math\.min\(next, questionStep\)\)/.test(revealSrc));

  // ── V25 — the timeline: ordered, complete, and readable ──────────────────
  const kinds = full.beats.map((b) => b.kind);
  const hookB = kindAt('hook');
  const contextB = kindAt('context');
  check('V25', 'every stage is held for its OWN reading time, measured from full visibility',
    kinds.join(',') === 'form,hook,context'
    // CONTENT-AWARE, NOT A FIXED HOLD: 200 wpm plus a 750ms comprehension buffer,
    // floored at four seconds, computed from the words each stage actually carries.
    // Only the copy is counted, so no fade is ever counted as reading time.
    && hookB.words === 13 && contextB.words === 27
    && hookB.holdMs === Math.max(4000, Math.round((hookB.words / 200) * 60000) + 750)
    && contextB.holdMs === Math.max(4000, Math.round((contextB.words / 200) * 60000) + 750)
    // The promise lands in the brief's 4.5–5s, and the 27-word paragraph is never
    // cut off after four.
    && hookB.holdMs >= 4500 && hookB.holdMs <= 5000
    && contextB.holdMs >= 6000
    && full.beats.every((b) => typeof b.holdMs === 'number' && b.holdMs > 0)
    // The fades are the brief's 600–800ms, and they are NOT reading time.
    && [hookB.fadeInMs, hookB.fadeOutMs, contextB.fadeInMs, contextB.fadeOutMs]
      .every((d) => d >= 600 && d <= 800)
    // The wall clock is every fade, every hold and the emergence beat.
    && full.totalMs === full.beats.reduce((n, b) => n + b.fadeInMs + b.holdMs + b.fadeOutMs, 0),
    `hook=${hookB.holdMs}ms ctx=${contextB.holdMs}ms total=${full.totalMs}ms`);

  // ── V26 — the choice appears ONLY with the first question ────────────────
  const choiceAt = revealSrc.indexOf('<ArrivalChoices');
  const questionAt = revealSrc.indexOf('atQuestion && (');
  check('V26', 'the choice appears only with the first question, in the ONE reveal region',
    questionAt > 0 && choiceAt > questionAt
    // The interaction is not mounted before the question is reached, and the
    // choice is not on screen before the acknowledgement replaces it.
    && /atQuestion && \(/.test(revealSrc)
    && /!acknowledging && \(/.test(revealSrc)
    // ONE region with ONE floor, sized to the tallest of the three stages — so the
    // orb above cannot move, and no dead space can reopen beneath it either: the
    // old fixed band and its collapse-to-nothing are both gone.
    && /min-h-\[272px\]/.test(stageSrc) && /md:min-h-\[192px\]/.test(stageSrc)
    && /items-center justify-start/.test(stageSrc)
    && !/settled/.test(stageSrc)
    && !/min-h-\[300px\]/.test(revealSrc) && !/md:min-h-\[208px\]/.test(revealSrc)
    && !/<ArrivalChoices/.test(stageSrc));

  // ── V27 — the visitor is never trapped in the animation ──────────────────
  check('V27', 'the timeline can always be cut short or moved on — control, click, tap or key',
    revealSrc.includes('ARRIVAL_COPY.skip')
    && /const skip = useCallback/.test(revealSrc)
    && /const advance = useCallback/.test(revealSrc)
    && /ADVANCE_KEYS/.test(revealSrc) && /addEventListener\('keydown'/.test(revealSrc)
    // The skip control cuts to the question; a click on the presentation moves ONE
    // stage forward, and does nothing once the question has arrived.
    && /onClick=\{\s*atQuestion\s*\?\s*undefined/.test(revealSrc)
    && /e\.stopPropagation\(\)/.test(revealSrc)
    && /stageIndex >= questionStep/.test(revealSrc));

  // ── V28 — THE SEQUENCE IS NOT THE FILM (the live defect) ────────────────
  check('V28', 'having seen the film never collapses the introduction',
    // A FRESH session runs the introduction — with or without the film's own flag.
    arrivalFlag(C, '', { film: false, sequence: false }) === true
    && arrivalFlag(C, '', { film: true, sequence: false }) === true
    // Only the SEQUENCE's session flag, set by reaching the choice, resumes there.
    && arrivalFlag(C, '', { film: false, sequence: true }) === false
    && arrivalFlag(C, '', { film: true, sequence: true }) === false
    // The two review queries force it, whatever either flag says.
    && arrivalFlag(C, '?intro=replay', { film: true, sequence: true }) === true
    && arrivalFlag(C, '?intro=skip', { film: true, sequence: true }) === true
    // Two facts, two keys, written by two different events: the film when it ends
    // or is skipped, the sequence when the visitor reaches the choice.
    && C.ARRIVAL_SEQUENCE_KEY === 'vision_arrival_sequence_complete_v1'
    && C.ARRIVAL_FILM_KEY === 'vision_arrival_film_seen_v2'
    && /sessionStorage\.setItem\(ARRIVAL_SEQUENCE_KEY/.test(contentSrc)
    && /if \(atQuestion\) markArrivalSequenceComplete\(\)/.test(revealSrc)
    // Read once, at mount.
    && /useState\(shouldPlayArrivalSequence\)/.test(arrivalSrc)
    && /cinematic \? 0 : questionStep/.test(revealSrc));

  // ── V29 — ONE controller: generation-guarded, locked, one stage per action ──
  check('V29', 'a stale callback can never advance a later stage, and one click moves one stage',
    // Every path goes through ONE transition, clamped at the question.
    /const target = Math\.max\(0, Math\.min\(next, questionStep\)\)/.test(revealSrc)
    && (revealSrc.match(/setStageIndex\(/g) || []).length === 1
    // The hold is armed from FULL VISIBILITY, and only for the stage that is current.
    && /onSettled=\{onStageSettled\}/.test(revealSrc)
    && /onAnimationComplete=\{\(\) => onSettled\?\.\(beat\.id\)\}/.test(stageSrc)
    && /current\.id !== settledId/.test(revealSrc)
    // A timer armed under an older generation is inert.
    && /if \(generation !== genRef\.current\) return;/.test(revealSrc)
    && /genRef\.current \+= 1/.test(revealSrc)
    && /clearTimeout\(holdRef\.current\)/.test(revealSrc)
    // The invisible lock sits inside the brief's 300–500ms, and a click counts only
    // when its press BEGAN on this surface.
    && /const INTERACTION_LOCK_MS = 450;/.test(revealSrc)
    && /if \(Date\.now\(\) < lockUntilRef\.current\) return;/.test(revealSrc)
    && /pressArmedRef\.current = Date\.now\(\) >= lockUntilRef\.current;/.test(revealSrc));

  // ── Truthfulness — the orb never fakes work during the arrival ───────────
  check('TRUTH', 'the arrival shows no fabricated processing state',
    !/'thinking'|"thinking"|'analyzing'|"analyzing"/.test(revealCode + stageCode + ackCode)
    && !/thinking|analyzing/.test(sequenceSrc)
    // Every beat state is one the arrival can honestly stand behind.
    && full.beats.every((b) => ['idle', 'listening', 'responding'].includes(b.state))
    && full.questionState === 'idle'
    && /state=\{orbState\}/.test(revealCode)
    && /'attention'/.test(ackCode)
    && !/setTimeout\([^)]*,\s*[2-9][0-9]{3}\)/.test(arrivalSurface.replace(/ACK_HOLD_MS/g, 'x')));

  return failures;
}

const TOTAL_CHECKS = 30;
const baseline = runChecks();
const pass = TOTAL_CHECKS - baseline.length;

console.log('');
console.log('  VISION ARRIVAL — contract checks (V1–V29 subset)');
console.log('  ─────────────────────────────────────────────────────────────────');
if (baseline.length) baseline.forEach((f) => console.log(`  FAIL ${f}`));
console.log('');
console.log(`  checks     : ${pass} PASS`);

const mutations = [
  {
    name: 'M-NEWVIDEO a second film is introduced',
    sources: () => ({ ARRIVAL: read(ARRIVAL).replace("from '@/lib/galileo/arrivalContent'", "from '@/lib/galileo/arrivalContent';\nconst EXTRA = 'https://media.base44.com/videos/public/x/other_intro.mp4';") }),
    mustFail: ['V2'],
  },
  {
    name: 'M-TWICE    the durable flag is forked, so the film repeats',
    sources: () => ({ CONTENT: read(CONTENT).replace("export const INTRO_SEEN_KEY = 'vision_intro_completed';", "export const INTRO_SEEN_KEY = 'vision_arrival_seen_v2';") }),
    mustFail: ['V23'],
  },
  {
    name: 'M-LEAK     business data is handed to the orb',
    sources: () => ({ REVEAL: read(REVEAL).replace('<GalileoOrb state={orbState} size="hero" intelligence={0} emerge={!reduced} continuity="galileo" />', '<GalileoOrb state={orbState} size="hero" intelligence={0} emerge={!reduced} continuity="galileo" businessId="x" />') }),
    mustFail: ['V21'],
  },
  {
    name: 'M-CLONE    the orb is re-implemented instead of reused',
    sources: () => ({ REVEAL: read(REVEAL).replace('<GalileoOrb', '{requestAnimationFrame(() => {})}\n          <GalileoOrb') }),
    mustFail: ['V8'],
  },
  {
    name: 'M-COPY     the headline drifts from the brief',
    sources: () => ({ CONTENT: read(CONTENT).replace("headline: 'See what your business is really capable of.'", "headline: 'Welcome to VISION.'") }),
    mustFail: ['V10'],
  },
  {
    name: 'M-ANONGATE the arrival is gated on "anonymous" again (the live defect)',
    sources: () => ({ REIMAGINED: read(REIMAGINED).replace("if (surface === 'arrival') {", 'if (arrivalOpen && !home.isAuthenticated) {') }),
    mustFail: ['V3'],
  },
  {
    name: 'M-STACK    the whole introduction is put on screen at once again',
    sources: () => ({
      REVEAL: read(REVEAL).replace(
      '<ArrivalMessageStage beat={beat} reduced={reduced} onSettled={onStageSettled}>',
      '<ArrivalMessageStage beat={beat} reduced={reduced} onSettled={onStageSettled} />\n{sequence.beats.map((b) => <ArrivalMessageStage key={b.id} beat={b} reduced={reduced} />)}',
      ),
    }),
    mustFail: ['V24'],
  },
  {
    name: 'M-EARLYCHOICE the choice controls appear during the introduction',
    sources: () => ({ REVEAL: read(REVEAL).replace('{atQuestion && (', '{true && (') }),
    mustFail: ['V26'],
  },
  {
    name: 'M-SKIPLESS the cinematic can no longer be cut short',
    sources: () => ({
      REVEAL: read(REVEAL)
        .replace('{ARRIVAL_COPY.skip}', "{'Continue'}")
        .replace("onClick={atQuestion ? undefined : skip}", 'onClick={undefined}'),
    }),
    mustFail: ['V27'],
  },
  {
    name: 'M-NOSEQ     reduced motion is ignored (the full cinematic still runs)',
    sources: () => ({ SEQUENCE: read(SEQUENCE).replace('return assemble(reduced ? ARRIVAL_TIMING.reduced : ARRIVAL_TIMING.full);', 'return assemble(ARRIVAL_TIMING.full);') }),
    mustFail: ['V22'],
  },
  {
    name: 'M-FLAGGATE the film flag decides the sequence again (THE LIVE DEFECT)',
    sources: () => ({
      CONTENT: read(CONTENT).replace('return !hasCompletedArrivalSequence();', 'return !hasSeenIntro();'),
    }),
    mustFail: ['V28'],
  },
  {
    name: 'M-FIXHOLD  the holds go back to one fixed four seconds',
    sources: () => ({ SEQUENCE: read(SEQUENCE).replace('holdMs: stagedHoldMs(text),', 'holdMs: 4000,') }),
    mustFail: ['V25'],
  },
  {
    name: 'M-NOLOCK   the interaction lock is removed (one press can skip two stages)',
    sources: () => ({ REVEAL: read(REVEAL).replace('const INTERACTION_LOCK_MS = 450;', 'const INTERACTION_LOCK_MS = 0;') }),
    mustFail: ['V29'],
  },
  {
    name: 'M-STALE    a stale timer is no longer guarded by its generation',
    sources: () => ({ REVEAL: read(REVEAL).replace('if (generation !== genRef.current) return;', 'void generation;') }),
    mustFail: ['V29'],
  },
  {
    name: 'M-EARLYDONE the sequence is marked complete the moment it mounts',
    sources: () => ({ REVEAL: read(REVEAL).replace('if (atQuestion) markArrivalSequenceComplete();', 'markArrivalSequenceComplete();') }),
    mustFail: ['V28'],
  },
];

(async () => {
  const results = [];
  for (const m of mutations) {
    const found = runChecks(m.sources());
    const caught = m.mustFail.every((id) => found.some((f) => f.startsWith(id)));
    results.push(caught);
    console.log(`  ${caught ? 'CAUGHT  ' : 'MISSED  '}${m.name}`);
  }
  console.log('');
  console.log(`  mutations  : ${results.filter(Boolean).length}/${results.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  const ok = baseline.length === 0 && results.every(Boolean);
  console.log('');
  console.log(`  VISION ARRIVAL — ${ok ? 'ALL CHECKS PASS' : 'NOT CERTIFIED'}`);
  console.log('  NOTE: structure, order and copy only. The composition and the orb’s');
  console.log('        motion were NOT observed in a browser and are not claimed here.');
  console.log('');
  process.exit(ok ? 0 : 1);
})();