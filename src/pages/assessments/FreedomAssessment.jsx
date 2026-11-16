import React from 'react';
import FreedomAssessmentCore from '@/components/assessments/FreedomAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Your Freedom Score measures how close you are to owning a business that works for you — not the other way around. Consider your desired lifestyle income, current savings, and your ideal exit timeline. There's no wrong answer — this is about aligning your business to your life goals.";

export default function FreedomAssessment() {
  return (
    <>
      <FreedomAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="freedom-assessment" />
    </>
  );
}