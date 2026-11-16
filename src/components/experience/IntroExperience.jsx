/**
 * Intro Experience Component
 *
 * Full-screen cinematic video introduction — THE EXISTING VISION INTRO VIDEO.
 * The media URL below is the production asset; it is a permanent public media
 * URL, never a private or signed one.
 *
 * Supports:
 * - Autoplay on mount (muted, inline — the only combination browsers permit)
 * - Skip
 * - Replay (opt-out with showReplay={false})
 * - onComplete on video end
 * - A graceful brand frame if autoplay is refused or the media cannot load
 *
 * PERFORMANCE: `preload="metadata"` with a poster, so the first frame is on
 * screen immediately and the full file is not fetched ahead of playback. Nothing
 * else in the application waits on this media — Galileo mounts independently.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
/**
 * Safe technical telemetry only: a reason word, never identity or business
 * context. The client is loaded lazily, only when a media problem occurs.
 */
const reportMedia = (reason) => {
  import('@/api/base44Client')
    .then(({ base44 }) => base44.analytics?.track?.({ eventName: 'vision_intro_media_issue', properties: { reason } }))
    .catch(() => { /* best-effort */ });
};
import { VISION_WORDMARK_URL, VISION_WORDMARK_WINDOW, VISION_HERO_BACKGROUND_URL } from '@/lib/visionBrand';

const VIDEO_URL = 'https://media.base44.com/videos/public/6a2338cb6dd7f8bfcf561ec3/be6c89ab6_Visionintrovideo.mp4';

/**
 * The static frame used while the film buffers, and as the whole fallback when
 * autoplay is refused or the media fails. It is the production cinematic
 * backdrop plus the real wordmark — never a text approximation of the brand.
 */
function BrandFrame({ onEnter, note }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      <img
        src={VISION_HERO_BACKGROUND_URL}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="relative flex flex-col items-center px-6 text-center">
        <span className={VISION_WORDMARK_WINDOW.window}>
          <img
            src={VISION_WORDMARK_URL}
            alt="V.I.S.I.O.N. Platform"
            className={VISION_WORDMARK_WINDOW.image.className}
            style={VISION_WORDMARK_WINDOW.image.style}
          />
        </span>
        {note && <p className="mt-4 text-[13px] text-white/55">{note}</p>}
        <Button
          onClick={onEnter}
          className="mt-7 rounded-full bg-vision-gold px-7 py-2.5 text-[13px] font-medium text-black hover:bg-vision-gold/90"
        >
          Enter VISION
        </Button>
      </div>
    </div>
  );
}

export default function IntroExperience({ onComplete, onSkip, showReplay = true }) {
  const videoRef = useRef(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  // Playback could not start on its own (autoplay policy, or the media failed).
  const [needsGesture, setNeedsGesture] = useState(false);
  // Autoplay is only permitted muted; the visitor can turn the sound on.
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    // React doesn't reliably apply the `muted` DOM attribute — set it imperatively
    // so browsers allow autoplay (muted autoplay is always permitted).
    video.muted = true;
    video.defaultMuted = true;

    const handleLoadedData = () => {
      setVideoLoaded(true);
      video.muted = true;
      video.play().catch(() => {
        reportMedia('autoplay_refused');
        setNeedsGesture(true);
      });
    };

    // Kick off playback immediately as well
    video.play().catch(() => setNeedsGesture(true));

    const handleEnded = () => {
      setVideoEnded(true);
      onComplete?.();
    };

    const handleError = () => {
      reportMedia('media_error');
      setNeedsGesture(true);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onComplete]);

  const handleSkip = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onSkip?.();
  };

  const handleReplay = () => {
    setVideoEnded(false);
    setNeedsGesture(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => setNeedsGesture(true));
    }
  };

  // Playback refused or media unavailable: an elegant still frame with a clear
  // way in, rather than a broken <video> element.
  const showBrandFrameOnly = needsGesture && !videoLoaded;

  const handleEnter = () => {
    const video = videoRef.current;
    if (!video) {
      onComplete?.();
      return;
    }
    video.muted = true;
    video
      .play()
      .then(() => setNeedsGesture(false))
      .catch(() => onComplete?.());
  };

  if (showBrandFrameOnly) {
    return <BrandFrame onEnter={handleEnter} />;
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* Skip Button - Top Right */}
      <div className="absolute top-8 right-8 z-10">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-white/60 hover:text-white text-sm tracking-wide bg-transparent"
        >
          Skip →
        </Button>
      </div>

      <video
        ref={videoRef}
        src={VIDEO_URL}
        poster={VISION_HERO_BACKGROUND_URL}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
        preload="metadata"
      />

      {!videoEnded && !needsGesture && (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          className="absolute bottom-8 right-8 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3.5 py-2 text-[12px] text-white/60 backdrop-blur-sm transition-colors hover:text-white"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {muted ? 'Sound' : 'Mute'}
        </button>
      )}

      {/* Only if playback never began: the same still frame, over the media. */}
      {needsGesture && videoLoaded && (
        <div className="absolute inset-0 bg-black/70">
          <BrandFrame onEnter={handleEnter} note="Your browser paused the film." />
        </div>
      )}

      {/* Replay Button (shown after video ends) */}
      {showReplay && videoEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-12"
        >
          <Button
            variant="ghost"
            onClick={handleReplay}
            className="text-white/60 hover:text-white text-sm bg-transparent"
          >
            Replay
          </Button>
        </motion.div>
      )}
    </div>
  );
}