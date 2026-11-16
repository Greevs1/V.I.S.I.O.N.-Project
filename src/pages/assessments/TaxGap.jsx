import React from 'react';
import TaxGapAssessmentCore from '@/components/assessments/TaxGapAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Your Tax Gap estimates how much you may be overpaying in taxes each year due to your current business structure. S-Corps, accountable plans, and family employment are among the most commonly missed strategies. Enter your adjusted gross income to see your personalized estimate.";

export default function TaxGap() {
  return (
    <>
      <TaxGapAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="tax-gap" />
    </>
  );
}