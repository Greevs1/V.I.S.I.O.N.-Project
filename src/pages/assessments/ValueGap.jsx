import React from 'react';
import ValueGapAssessmentCore from '@/components/assessments/ValueGapAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Your Value Gap shows the difference between what your business is worth today versus what it could be worth with the right improvements. Most business owners are leaving 30–50% of their enterprise value on the table. Adjust the EBITDA multiple slider to explore your potential.";

export default function ValueGap() {
  return (
    <>
      <ValueGapAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="value-gap" />
    </>
  );
}