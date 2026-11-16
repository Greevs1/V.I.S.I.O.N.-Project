/**
 * opportunityScenarios — the client-side mirror of the What If lever catalog.
 *
 * WHY THIS IS A SEPARATE, TINY MODULE
 * The authoritative catalog lives in the backend (base44/shared/scenarioEngine)
 * and is served to the UI by the whatIfEngine function, which is what the What
 * If surface itself renders from. The client cannot import backend TypeScript,
 * so the resolver needs the lever KEYS and PROMPTS to decide whether an
 * opportunity can be modelled at all.
 *
 * This file is deliberately restricted to keys and prompts. It holds no
 * arithmetic, no defaults and no modelling logic: those remain in the engine
 * only. If a lever is added or removed in the engine, this list is the one
 * place the resolver follows it.
 */

export const LEVERS = {
  raise_prices: { title: 'Raise prices', prompt: 'What if I raised my prices?' },
  add_revenue: { title: 'Increase revenue', prompt: 'What if I added revenue?' },
  improve_margins: { title: 'Improve margins', prompt: 'What if I improved my margins?' },
  hire_manager: { title: 'Hire a general manager', prompt: 'What if I hired a general manager?' },
  hire_salesperson: { title: 'Hire a salesperson', prompt: 'What if I hired a salesperson?' },
  reduce_owner_involvement: {
    title: 'Reduce owner involvement',
    prompt: 'What if I reduced my involvement in the business?',
  },
};