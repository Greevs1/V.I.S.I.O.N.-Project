/**
 * GalileoOrbFallback — what the living orb shows when WebGL cannot run.
 *
 * A thin wrapper: it IS the canonical still frame of Galileo (GalileoOrbStill),
 * at the same size and in the same state. No second drawing of Galileo exists.
 */

import React from 'react';
import GalileoOrbStill from './GalileoOrbStill';

export default function GalileoOrbFallback({ size = 96, state = 'idle', intelligence = 0 }) {
  return <GalileoOrbStill size={size} state={state} intelligence={intelligence} role="fallback" />;
}