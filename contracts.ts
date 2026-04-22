/**
 * League of Thrones contract math.
 *
 * Keeper formula: each year, next = round((current + 2) * 1.05)
 *
 * CRITICAL: the formula iterates on the WHOLE-DOLLAR rounded value of the
 * previous year — not on accumulated decimals. This matches the league's
 * existing spreadsheet (verified against multiple owner tabs).
 *
 * Example trace for a $29 Year 1 contract:
 *   Y1 → $29
 *   Y2 → round((29 + 2) * 1.05) = round(32.55) = $33
 *   Y3 → round((33 + 2) * 1.05) = round(36.75) = $37
 *   Y4 → round((37 + 2) * 1.05) = round(40.95) = $41
 *
 * If you ever feel tempted to keep decimals through the chain "for accuracy",
 * stop — that produces $36/$40 in years 3/4, which doesn't match the sheet.
 */

export const MAX_CONTRACT_YEARS = 4;
export const KEEPER_INCREMENT = 2;
export const KEEPER_MULTIPLIER = 1.05;

/**
 * Cost (whole dollars) for a given contract year (1–4).
 * Returns null if the year or price is out of range.
 */
export function contractCostAtYear(
  yearOnePrice: number,
  year: number,
): number | null {
  if (year < 1 || year > MAX_CONTRACT_YEARS) return null;
  if (!Number.isFinite(yearOnePrice) || yearOnePrice < 0) return null;
  let cost = Math.round(yearOnePrice);
  for (let i = 2; i <= year; i++) {
    cost = Math.round((cost + KEEPER_INCREMENT) * KEEPER_MULTIPLIER);
  }
  return cost;
}

/**
 * Cost to keep this contract next season, or null if it's in its final year.
 */
export function nextYearCost(
  yearOnePrice: number,
  currentYear: number,
): number | null {
  if (currentYear >= MAX_CONTRACT_YEARS) return null;
  return contractCostAtYear(yearOnePrice, currentYear + 1);
}

/**
 * True if this is the last season the player can be kept under this contract.
 */
export function isExpiring(currentYear: number): boolean {
  return currentYear >= MAX_CONTRACT_YEARS;
}

/**
 * Render a cost for the UI. Pass null/undefined to render an em-dash.
 */
export function displayCost(cost: number | null | undefined): string {
  if (cost == null) return '—';
  return `$${cost}`;
}
