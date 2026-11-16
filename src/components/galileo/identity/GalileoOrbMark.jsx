/**
 * GalileoOrbMark — Galileo at identity weight (inputs, headers).
 *
 * A thin wrapper over the canonical still frame: the same Galileo, small, with
 * no per-frame renderer. `live` is a boolean the caller already knows.
 */

import React from 'react';
import GalileoOrbStill from './GalileoOrbStill';

export default function GalileoOrbMark({ size = 'micro', live = false, className = '' }) {
  return <GalileoOrbStill size={size} live={live} className={className} />;
}