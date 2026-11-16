/**
 * Galileo Welcome Component
 * 
 * Intelligent concierge introduction.
 * Not a chatbot. Not customer support. Not AI.
 * Galileo is the guide helping build an enterprise.
 * 
 * Design:
 * - Pure black background
 * - White text
 * - Warm metallic gold accents
 * - Large, minimal, elegant typography
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

export default function GalileoWelcome({ onBegin }) {
  const { navigateToLogin } = useAuth();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-8">
      {/* Main Content */}
      <div className="max-w-2xl text-center space-y-8">
        {/* Galileo Introduction */}
        <div className="space-y-6">
          <p className="text-2xl font-light text-white/90 leading-relaxed">
            I'm Galileo.
          </p>
          <p className="text-xl font-light text-white/75 leading-relaxed max-w-lg mx-auto">
            I'm going to help you understand what your business is worth, where it can go, and how to get there.
          </p>
        </div>

        {/* Primary Action */}
        <div className="pt-8">
          <Button
            onClick={onBegin}
            className="bg-[#D4A853] hover:bg-[#D4A853]/90 text-black font-medium px-12 py-6 text-lg tracking-wide"
          >
            Let's Begin
          </Button>
        </div>
      </div>
    </div>
  );
}