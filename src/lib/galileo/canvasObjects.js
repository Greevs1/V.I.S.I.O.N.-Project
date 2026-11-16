/**
 * Canvas Objects — persistent intelligence on the Galileo canvas.
 *
 * Conversation is the CONTROL MECHANISM. The Business Model is the PRODUCT.
 *
 * When Galileo discovers an Opportunity, it becomes a persistent object
 * on the canvas — it doesn't disappear when the conversation scrolls.
 * Same for Scenarios, Plays (sprints), and Saved items.
 *
 * This module manages the canvas object registry: what objects exist,
 * their state, and how they're rendered.
 */

export const CanvasObjectType = {
  OPPORTUNITY: 'opportunity',
  SCENARIO: 'scenario',
  PLAY: 'play',
  SAVED: 'saved',
  BENCHMARK: 'benchmark',
  VALUE_ESTIMATE: 'value_estimate',
};

/**
 * createCanvasObject — creates a new canvas object from an insight.
 *
 * @param {string} type — CanvasObjectType
 * @param {object} data — the insight data
 * @returns {object} — { id, type, data, createdAt, state }
 */
export function createCanvasObject(type, data) {
  return {
    id: `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    createdAt: new Date().toISOString(),
    state: 'active',
  };
}

/**
 * extractCanvasObjects — scans conversation entries and extracts
 * persistent intelligence that should remain on the canvas.
 *
 * Opportunities, Scenarios, Plays, and Saved items become canvas objects.
 * Messages and questions remain as conversation (they collapse).
 */
export function extractCanvasObjects(conversation = []) {
  const objects = [];

  for (const entry of conversation) {
    if (entry.type !== 'insight') continue;

    switch (entry.variant) {
      case 'opportunity': {
        if (entry.data?.opportunity) {
          objects.push(createCanvasObject(CanvasObjectType.OPPORTUNITY, entry.data.opportunity));
        }
        break;
      }
      case 'scenario': {
        if (entry.data?.strategy) {
          objects.push(createCanvasObject(CanvasObjectType.SCENARIO, {
            strategy: entry.data.strategy,
            opportunity: entry.data.opportunity,
            model: entry.data.model,
          }));
        }
        break;
      }
      case 'sprint_preview': {
        if (entry.data?.strategy) {
          objects.push(createCanvasObject(CanvasObjectType.PLAY, {
            opportunity: entry.data.opportunity,
            strategy: entry.data.strategy,
          }));
        }
        break;
      }
      case 'value': {
        if (entry.data?.signal) {
          objects.push(createCanvasObject(CanvasObjectType.VALUE_ESTIMATE, {
            signal: entry.data.signal,
            model: entry.data.model,
            updated: entry.data.updated,
          }));
        }
        break;
      }
      case 'profitability': {
        if (entry.data?.signal?.benchmark) {
          objects.push(createCanvasObject(CanvasObjectType.BENCHMARK, {
            signal: entry.data.signal,
            model: entry.data.model,
            updated: entry.data.updated,
          }));
        }
        break;
      }
      case 'preservation': {
        // Preservation is a moment, not a persistent object
        break;
      }
      default:
        break;
    }
  }

  // Deduplicate by type + data identity
  return deduplicateObjects(objects);
}

function deduplicateObjects(objects) {
  const seen = new Set();
  return objects.filter((obj) => {
    const key = `${obj.type}_${JSON.stringify(obj.data?.id || obj.data?.strategy || obj.data?.signal?.current || '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * getCanvasObjectLabel — returns a short label for a canvas object.
 */
export function getCanvasObjectLabel(obj) {
  switch (obj.type) {
    case CanvasObjectType.OPPORTUNITY:
      return obj.data?.title || 'Opportunity';
    case CanvasObjectType.SCENARIO:
      return 'Scenario';
    case CanvasObjectType.PLAY:
      return '90-Day Play';
    case CanvasObjectType.SAVED:
      return 'Saved';
    case CanvasObjectType.BENCHMARK:
      return 'Profit Benchmark';
    case CanvasObjectType.VALUE_ESTIMATE:
      return 'Value Estimate';
    default:
      return '';
  }
}

/**
 * shouldShowCanvasObjects — determines if canvas objects should be visible.
 *
 * Canvas objects appear once the user is past discovery — they're the
 * persistent intelligence that remains while conversation collapses.
 */
export function shouldShowCanvasObjects(flowState, canvasObjects) {
  if (!canvasObjects || canvasObjects.length === 0) return false;
  const discoveryStates = ['welcoming', 'intent', 'client_role', 'discovering', 'plausibility_check', 'estimating'];
  return !discoveryStates.includes(flowState);
}