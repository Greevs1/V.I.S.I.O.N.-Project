import React from 'react';
import OperationsGapAssessmentCore from '@/components/assessments/OperationsGapAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Your Operations Gap measures how dependent your business is on you personally. A lower score means higher risk and lower valuation. Rate each area honestly — then enter your take-home pay to calculate the Value of Time Freed when you reduce your owner-dependence.";

export default function OperationsGap() {
  return (
    <>
      <OperationsGapAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="operations-gap" />
    </>
  );
}