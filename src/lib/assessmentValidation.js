/**
 * Assessment Validation Utility
 * 
 * Ensures each assessment's calculated results will correctly populate
 * the corresponding IQ™ dashboard gap card.
 * 
 * Each assessment type has required fields that MUST be present in the
 * results object for the IQ™ card to display data instead of "—".
 */

const validationRules = {
  profit_gap: {
    required: ['gapToBest', 'profitScore'],
    optional: ['gapToAvg', 'avg', 'best'],
    severityField: 'gapToBest',
    iqFields: ['profit_gap.gap_to_best', 'profit_gap.score'],
    validate: (results) => {
      const errors = [];
      if (typeof results.gapToBest !== 'number' || results.gapToBest < 0) {
        errors.push('gapToBest must be a non-negative number');
      }
      if (typeof results.profitScore !== 'number' || results.profitScore < 0 || results.profitScore > 100) {
        errors.push('profitScore must be between 0 and 100');
      }
      return errors;
    },
  },
  
  value_gap: {
    required: ['currentValue', 'potentialValue', 'valueGap'],
    optional: [],
    severityField: 'valueGap',
    iqFields: ['value_gap.potential_value', 'value_gap.gap_amount'],
    validate: (results) => {
      const errors = [];
      if (typeof results.currentValue !== 'number' || results.currentValue < 0) {
        errors.push('currentValue must be a non-negative number');
      }
      if (typeof results.potentialValue !== 'number' || results.potentialValue < 0) {
        errors.push('potentialValue must be a non-negative number');
      }
      if (typeof results.valueGap !== 'number' || results.valueGap < 0) {
        errors.push('valueGap must be a non-negative number');
      }
      return errors;
    },
  },
  
  tax_gap: {
    required: ['t3_annual_gap', 't3_strategies'],
    optional: ['t3_ten_year_cost'],
    severityField: 't3_annual_gap',
    iqFields: ['tax_gap.annual_overpayment', 'tax_gap.ten_year_cost'],
    validate: (results) => {
      const errors = [];
      if (typeof results.t3_annual_gap !== 'number' || results.t3_annual_gap < 0) {
        errors.push('t3_annual_gap must be a non-negative number');
      }
      if (!Array.isArray(results.t3_strategies)) {
        errors.push('t3_strategies must be an array');
      }
      return errors;
    },
  },
  
  operations_gap: {
    required: ['operations_score'],
    optional: ['monthly_value_freed'],
    severityField: 'operations_score',
    iqFields: ['operations_gap.score'],
    validate: (results) => {
      const errors = [];
      if (typeof results.operations_score !== 'number' || results.operations_score < 0 || results.operations_score > 100) {
        errors.push('operations_score must be between 0 and 100');
      }
      return errors;
    },
  },
};

/**
 * Validates assessment results before saving to ensure IQ™ cards will populate.
 * @param {string} assessmentType - The type of assessment (e.g., 'profit_gap')
 * @param {object} results - The calculated results object
 * @param {object} state - The current assessment state
 * @returns {object} Validation result: { valid: boolean, missing: string[], errors: string[], severity: string }
 */
export function validateAssessmentResults(assessmentType, results, state) {
  const rules = validationRules[assessmentType];
  
  if (!rules) {
    return {
      valid: true,
      missing: [],
      errors: [],
      severity: 'unknown',
      message: `No validation rules defined for ${assessmentType}`,
    };
  }
  
  // Check required fields
  const missing = rules.required.filter(field => {
    const value = results[field];
    return value === undefined || value === null;
  });
  
  // Run custom validation
  const errors = rules.validate(results);
  
  // Calculate severity
  let severity = 'low';
  const severityValue = results[rules.severityField];
  
  if (assessmentType === 'profit_gap' || assessmentType === 'value_gap') {
    if (severityValue > 500_000) severity = 'significant';
    else if (severityValue > 100_000) severity = 'moderate';
    else severity = 'low';
  }
  
  if (assessmentType === 'operations_gap') {
    if (severityValue < 45) severity = 'significant';
    else if (severityValue < 75) severity = 'moderate';
    else severity = 'low';
  }
  
  if (assessmentType === 'tax_gap') {
    if (severityValue > 500_000) severity = 'significant';
    else if (severityValue > 100_000) severity = 'moderate';
    else severity = 'low';
  }
  
  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
    severity,
    iqFields: rules.iqFields,
  };
}

/**
 * Logs validation results for debugging.
 */
export function logValidation(assessmentType, validation) {
  const prefix = `[ASSESSMENT_VALIDATION:${assessmentType}]`;
  
  if (validation.valid) {
    console.log(`${prefix} ✓ Validation passed - IQ™ card will populate correctly`);
    console.log(`${prefix} Severity: ${validation.severity}`);
    console.log(`${prefix} IQ™ fields that will be written:`, validation.iqFields);
  } else {
    console.error(`${prefix} ✗ Validation FAILED - IQ™ card will show "—"`);
    if (validation.missing.length > 0) {
      console.error(`${prefix} Missing required fields:`, validation.missing);
    }
    if (validation.errors.length > 0) {
      console.error(`${prefix} Validation errors:`, validation.errors);
    }
  }
}

/**
 * Pre-save validation wrapper that can be called from assessment pages.
 * @param {string} assessmentType
 * @param {object} results
 * @param {object} state
 * @returns {object} Validation result with additional metadata
 */
export function preSaveValidation(assessmentType, results, state) {
  const validation = validateAssessmentResults(assessmentType, results, state);
  
  return {
    ...validation,
    timestamp: new Date().toISOString(),
    assessmentType,
    canProceed: validation.valid,
    recommendation: validation.valid
      ? 'Ready to save - IQ™ card will display data'
      : 'Fix missing fields before saving',
  };
}

/**
 * Maps assessment results to the exact dashboard_metrics JSONB structure.
 * This ensures the backend writes the correct field paths.
 */
export function mapToDashboardMetrics(assessmentType, results, state) {
  const mapping = {
    profit_gap: {
      profit_gap: {
        gap_to_best: results.gapToBest,
        gap_to_average: results.gapToAvg,
        score: results.profitScore,
        severity: (() => {
          if (results.gapToBest > 500_000) return 'significant';
          if (results.gapToBest > 100_000) return 'moderate';
          return 'low';
        })(),
      },
    },
    value_gap: {
      enterprise_value: results.currentValue,
      value_gap: {
        current_value: results.currentValue,
        potential_value: results.potentialValue,
        gap_amount: results.valueGap,
        severity: (() => {
          if (results.valueGap > 500_000) return 'significant';
          if (results.valueGap > 100_000) return 'moderate';
          return 'low';
        })(),
      },
    },
    operations_gap: {
      operations_gap: {
        score: results.operations_score,
        monthly_value_freed: results.monthly_value_freed || null,
        severity: (() => {
          if (results.operations_score < 45) return 'significant';
          if (results.operations_score < 75) return 'moderate';
          return 'low';
        })(),
      },
    },
  };
  
  return mapping[assessmentType] || {};
}