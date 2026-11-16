/**
 * Business Creation Scene
 * 
 * First step in Enterprise Journey™ after GalileoWelcome.
 * Guides visitor to create their first business entity.
 * 
 * Design:
 * - Black background, white text, warm gold accents
 * - Minimalist, advisory tone (not form-heavy)
 * - Galileo guidance card (no chat input)
 * 
 * Guest Session Behavior:
 * - Stores business data in business_snapshot JSON
 * - Does NOT create production business_entities
 * - Does NOT create profile or auth user
 * - Supports multiple businesses (array structure)
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';

const ENTITY_TYPES = [
  'Operating Company',
  'Holding Company',
  'Real Estate Entity',
  'Professional Practice',
  'Investment Entity',
  'Other',
];

const GALILEO_MESSAGE = 'Every enterprise begins with one business. Let\'s name yours first.';

export default function BusinessCreationScene({ onNext, onSkip }) {
  const [businessName, setBusinessName] = useState('');
  const [ownershipPercentage, setOwnershipPercentage] = useState('100');
  const [entityType, setEntityType] = useState('Operating Company');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!businessName.trim()) {
      newErrors.businessName = 'Business name is required';
    }

    const ownership = parseFloat(ownershipPercentage);
    if (isNaN(ownership) || ownership < 0 || ownership > 100) {
      newErrors.ownershipPercentage = 'Must be between 0 and 100';
    }

    if (!entityType) {
      newErrors.entityType = 'Entity type is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const guestSessionId = getGuestSessionId();

      // Build business snapshot entry
      const businessEntry = {
        temp_business_id: crypto.randomUUID(),
        business_name: businessName.trim(),
        ownership_percentage: parseFloat(ownershipPercentage),
        entity_type: entityType,
        business_family_type: 'operating_company',
        is_first_business: true,
        created_at: new Date().toISOString(),
      };

      // Check if server-side session row exists; create it if not.
      // guestSessionService wraps all params under `data: { ... }`.
      const existingRes = await base44.functions.invoke('guestSessionService', {
        action: 'getGuestSession',
        data: { guest_session_id: guestSessionId },
      });

      if (!existingRes.data?.exists) {
        await base44.functions.invoke('guestSessionService', {
          action: 'createGuestSession',
          data: { guest_session_id: guestSessionId },
        });
      }

      const existingBusinesses = existingRes.data?.session?.business_snapshot?.businesses || [];
      const updatedBusinesses = [...existingBusinesses, businessEntry];

      // Save business_snapshot — payload nested under `data` as backend expects
      await base44.functions.invoke('guestSessionService', {
        action: 'updateGuestSession',
        data: {
          guest_session_id: guestSessionId,
          updates: {
            business_snapshot: {
              businesses: updatedBusinesses,
            },
          },
        },
      });

      // Navigate to next scene
      onNext?.();
    } catch (error) {
      console.error('Failed to save business:', error);
      setErrors({ submit: "I couldn't save that yet. Please try once more." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-lg space-y-8"
      >
        {/* Galileo Guidance */}
        <div className="text-center space-y-4">
          <p className="text-lg text-white/70 font-light italic">
            "{GALILEO_MESSAGE}"
          </p>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <h2 className="text-4xl font-display font-bold text-white tracking-tight">
            Let's start with your first business.
          </h2>
          <p className="text-white/60 font-light text-base leading-relaxed">
            I'll use this to understand where value, profit, operations, and freedom opportunities may exist.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6 pt-4">
          {/* Business Name */}
          <div className="space-y-2">
            <Label className="text-white/80 text-sm font-medium tracking-wide">
              Business Name
            </Label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Acme Holdings LLC"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#D4A853]/50 focus:ring-[#D4A853]/20 h-12"
              disabled={isSubmitting}
            />
            {errors.businessName && (
              <p className="text-[#D4A853] text-xs font-medium">{errors.businessName}</p>
            )}
          </div>

          {/* Ownership % */}
          <div className="space-y-2">
            <Label className="text-white/80 text-sm font-medium tracking-wide">
              Ownership %
            </Label>
            <Input
              type="number"
              value={ownershipPercentage}
              onChange={(e) => setOwnershipPercentage(e.target.value)}
              placeholder="100"
              min="0"
              max="100"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#D4A853]/50 focus:ring-[#D4A853]/20 h-12"
              disabled={isSubmitting}
            />
            {errors.ownershipPercentage && (
              <p className="text-[#D4A853] text-xs font-medium">{errors.ownershipPercentage}</p>
            )}
          </div>

          {/* Entity Type */}
          <div className="space-y-2">
            <Label className="text-white/80 text-sm font-medium tracking-wide">
              Entity Type
            </Label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full h-12 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:border-[#D4A853]/50 focus:ring-[#D4A853]/20 outline-none px-3"
              disabled={isSubmitting}
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type} className="bg-black text-white">
                  {type}
                </option>
              ))}
            </select>
            {errors.entityType && (
              <p className="text-[#D4A853] text-xs font-medium">{errors.entityType}</p>
            )}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <p className="text-[#D4A853] text-xs font-medium">{errors.submit}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90 transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Continue →'}
            </Button>
            <Button
              onClick={handleSkip}
              variant="ghost"
              disabled={isSubmitting}
              className="h-12 text-white/60 hover:text-white"
            >
              I'll do this later
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}