import React from 'react';
import RecastEbitdaAssessmentCore from '@/components/assessments/RecastEbitdaAssessmentCore';
import GalileoPageGuide from '@/components/galileo/GalileoPageGuide';

const MESSAGE = "Recast EBITDA adds back owner-specific expenses to show a buyer what the business really earns. Owner salary above market rate, personal expenses run through the business, and one-time costs can significantly increase your valuation. Every $100K in add-backs can mean $300K–$500K more in enterprise value.";

export default function RecastEBITDA() {
  return (
    <>
      <RecastEbitdaAssessmentCore mode="member" />
      <GalileoPageGuide message={MESSAGE} pageKey="recast-ebitda" />
    </>
  );
}