import React from 'react';
import ProfitGapAssessmentCore from '@/components/assessments/ProfitGapAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Your Profit Gap compares your current net margin to best-in-class operators in your industry. Even a 2–3% improvement in margin can add hundreds of thousands annually to your bottom line. Enter your revenue and current margin — I'll calculate the opportunity.";

export default function ProfitGap() {
  return (
    <>
      <ProfitGapAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="profit-gap" />
    </>
  );
}