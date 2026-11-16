// Pre-built worksheet templates seeded from the CII assessment data

export const SEED_TEMPLATES = [
  {
    title: 'Augusta Rule Documentation',
    folder: 'Worksheet Templates',
    category: 'tax',
    status: 'published',
    description: 'IRC §280A Augusta Rule — document rental payments made to the owner for legitimate business use of their personal residence.',
    fields: [
      { id: 'f1', label: 'Description of Meeting / Business Purpose', type: 'textarea', placeholder: 'Describe the business purpose of the meeting held at the property...', required: true },
      { id: 'f2', label: 'Date/Time of Meeting', type: 'date', placeholder: 'Ex: 11/15/2024', required: true },
      { id: 'f3', label: 'Who Attended the Meeting', type: 'textarea', placeholder: 'Ex: Tony Stark, Steve Rogers, board members...', required: true },
      { id: 'f4', label: 'Meeting Location (Property Address)', type: 'text', placeholder: 'Ex: 123 Main St, Phoenix AZ 85001', required: true },
      { id: 'f5', label: 'Compensation / Rental Amount Paid', type: 'text', placeholder: 'Ex: $2,000', required: true },
      { id: 'f6', label: 'Fair Market Rental Rate Verified?', type: 'checkbox', required: false },
      { id: 'f7', label: 'Supporting Documentation Attached', type: 'checkbox', required: false },
      { id: 'f8', label: 'Notes', type: 'textarea', placeholder: 'Any additional notes or context...', required: false },
    ]
  },
  {
    title: 'Entity Structure Analysis',
    folder: 'Worksheet Templates',
    category: 'entity',
    status: 'published',
    description: 'Evaluate the current entity structure and identify optimization opportunities (S-Corp, C-Corp, LLC, Partnership).',
    fields: [
      { id: 'f1', label: 'Current Entity Type', type: 'dropdown', options: ['Sole Proprietorship', 'Single-Member LLC', 'Multi-Member LLC', 'S-Corporation', 'C-Corporation', 'Partnership'], required: true },
      { id: 'f2', label: 'Annual Gross Revenue', type: 'number', placeholder: 'Ex: 2000000', required: true },
      { id: 'f3', label: 'Owner W-2 Salary (if S-Corp)', type: 'number', placeholder: 'Ex: 120000', required: false },
      { id: 'f4', label: 'Number of Owners / Members', type: 'number', placeholder: 'Ex: 2', required: true },
      { id: 'f5', label: 'State of Formation', type: 'text', placeholder: 'Ex: Arizona', required: true },
      { id: 'f6', label: 'Recommended Entity Type', type: 'dropdown', options: ['Keep Current', 'S-Corporation', 'C-Corporation', 'LLC → S-Corp Election', 'Restructure Required'], required: false },
      { id: 'f7', label: 'Estimated Annual SE Tax Savings', type: 'number', placeholder: 'Ex: 8500', required: false },
      { id: 'f8', label: 'Advisor Notes & Recommendations', type: 'textarea', placeholder: 'Detail the recommended restructuring path and rationale...', required: false },
    ]
  },
  {
    title: 'Tax Strategy Discovery',
    folder: 'Worksheet Templates',
    category: 'tax',
    status: 'published',
    description: 'Identify all applicable tax strategies based on client profile — from retirement plans to cost segregation.',
    fields: [
      { id: 'f1', label: 'Adjusted Gross Income (AGI)', type: 'number', placeholder: 'Ex: 450000', required: true },
      { id: 'f2', label: 'Do you own real property used in the business?', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { id: 'f3', label: 'Do you have a qualified retirement plan?', type: 'dropdown', options: ['Yes — 401k', 'Yes — SEP IRA', 'Yes — Defined Benefit', 'No'], required: true },
      { id: 'f4', label: 'Do you have an HSA or HRA?', type: 'dropdown', options: ['Yes', 'No'], required: true },
      { id: 'f5', label: 'Do you use a vehicle for business?', type: 'dropdown', options: ['Yes — Business Owned', 'Yes — Personal/Reimbursed', 'No'], required: true },
      { id: 'f6', label: 'Do you have a home office?', type: 'dropdown', options: ['Yes — Exclusive Use', 'Yes — Partial', 'No'], required: true },
      { id: 'f7', label: 'Number of Dependent Children', type: 'number', placeholder: 'Ex: 2', required: false },
      { id: 'f8', label: 'R&D Activities Present?', type: 'dropdown', options: ['Yes', 'No', 'Unsure'], required: false },
      { id: 'f9', label: 'PTET Election Eligible?', type: 'dropdown', options: ['Yes', 'No', 'Unsure'], required: false },
      { id: 'f10', label: 'Estimated Total Annual Tax Overpayment', type: 'number', placeholder: 'Calculated from above...', required: false },
      { id: 'f11', label: 'Priority Strategies to Implement', type: 'textarea', placeholder: 'List top 3-5 strategies in order of priority...', required: false },
    ]
  },
  {
    title: 'Profit Gap Assessment Notes',
    folder: 'Session Templates',
    category: 'operations',
    status: 'published',
    description: 'Session notes for reviewing profit margin vs industry benchmarks.',
    fields: [
      { id: 'f1', label: 'Industry', type: 'text', placeholder: 'Ex: Residential HVAC', required: true },
      { id: 'f2', label: 'Current Net Profit Margin', type: 'number', placeholder: 'Ex: 12.5 (percent)', required: true },
      { id: 'f3', label: 'Industry Average Margin', type: 'number', placeholder: 'Ex: 18', required: false },
      { id: 'f4', label: 'Best-in-Class Margin', type: 'number', placeholder: 'Ex: 28', required: false },
      { id: 'f5', label: 'Gap to Best-in-Class ($)', type: 'number', placeholder: 'Calculated', required: false },
      { id: 'f6', label: 'Key Drivers of Margin Gap', type: 'textarea', placeholder: 'Where is the profit leaking? Labor, COGS, overhead?', required: false },
      { id: 'f7', label: '90-Day Action Items', type: 'textarea', placeholder: 'What are the 3 highest-leverage changes?', required: false },
    ]
  },
  {
    title: 'Exit Readiness Checklist',
    folder: 'Worksheet Templates',
    category: 'exit',
    status: 'published',
    description: 'Evaluate business readiness for an exit event — sale, transfer, or transition.',
    fields: [
      { id: 'f1', label: 'Target Exit Date', type: 'date', required: false },
      { id: 'f2', label: 'Desired Exit Type', type: 'dropdown', options: ['Strategic Sale', 'Private Equity', 'Management Buyout', 'Family Transfer', 'ESOP', 'IPO'], required: true },
      { id: 'f3', label: 'Estimated Current Valuation', type: 'number', placeholder: 'Ex: 4000000', required: true },
      { id: 'f4', label: 'Target Valuation', type: 'number', placeholder: 'Ex: 8000000', required: true },
      { id: 'f5', label: 'Financials Audited / Reviewed?', type: 'dropdown', options: ['Audited', 'Reviewed', 'Compiled', 'None'], required: true },
      { id: 'f6', label: 'Customer Concentration — Top Client % of Revenue', type: 'number', placeholder: 'Ex: 35 (percent)', required: false },
      { id: 'f7', label: 'Key Man Dependency?', type: 'dropdown', options: ['High — Owner Required Daily', 'Medium — Owner Involved Weekly', 'Low — Business Runs Independently'], required: true },
      { id: 'f8', label: 'Non-Competes / IP Agreements in Place?', type: 'checkbox', required: false },
      { id: 'f9', label: 'Management Team Capable of Running Post-Exit?', type: 'dropdown', options: ['Yes', 'Partially', 'No'], required: false },
      { id: 'f10', label: 'Advisor Notes', type: 'textarea', placeholder: 'Value drivers, deal structure recommendations, preparation steps...', required: false },
    ]
  },
  {
    title: 'Operations Gap Review',
    folder: 'Session Templates',
    category: 'operations',
    status: 'published',
    description: 'Session notes from the Operations Gap assessment — document findings and action items.',
    fields: [
      { id: 'f1', label: 'Owner Hours Per Week', type: 'number', placeholder: 'Ex: 55', required: true },
      { id: 'f2', label: 'Monthly Owner Take-Home Pay', type: 'number', placeholder: 'Ex: 15000', required: false },
      { id: 'f3', label: 'Team Leadership Score (1-6)', type: 'number', placeholder: '1 = Poor, 6 = Excellent', required: false },
      { id: 'f4', label: 'Systems & Processes Score (1-6)', type: 'number', placeholder: '1 = Poor, 6 = Excellent', required: false },
      { id: 'f5', label: 'Financial Visibility Score (1-6)', type: 'number', placeholder: '1 = Poor, 6 = Excellent', required: false },
      { id: 'f6', label: 'Top 3 Operational Bottlenecks', type: 'textarea', placeholder: 'What is slowing the business down most?', required: false },
      { id: 'f7', label: 'Recommended Hires / Systems', type: 'textarea', placeholder: 'What roles or tools would free the most time?', required: false },
      { id: 'f8', label: 'Est. Monthly Value Freed If Fixed', type: 'number', placeholder: 'Ex: 8500', required: false },
    ]
  },
];