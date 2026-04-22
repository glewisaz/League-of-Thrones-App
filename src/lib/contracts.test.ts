import { describe, it, expect } from 'vitest';
import {
  contractCostAtYear,
  displayCost,
  isExpiring,
  MAX_CONTRACT_YEARS,
  nextYearCost,
} from './contracts';

// Test cases verified against the 2025 Offseason spreadsheet across
// multiple owner tabs. If any of these break, the math has drifted.

describe('contractCostAtYear', () => {
  it('returns the year-one price unchanged for year 1', () => {
    expect(contractCostAtYear(29, 1)).toBe(29);
    expect(contractCostAtYear(0, 1)).toBe(0);
    expect(contractCostAtYear(100, 1)).toBe(100);
  });

  it('matches Mark Andrews ($29 → $33 → $37 → $41)', () => {
    expect(contractCostAtYear(29, 2)).toBe(33);
    expect(contractCostAtYear(29, 3)).toBe(37);
    expect(contractCostAtYear(29, 4)).toBe(41);
  });

  it('matches Mike Evans ($23 → $26 → $29 → $33)', () => {
    expect(contractCostAtYear(23, 2)).toBe(26);
    expect(contractCostAtYear(23, 3)).toBe(29);
    expect(contractCostAtYear(23, 4)).toBe(33);
  });

  it('matches Stafford ($0 → $2 → $4 → $6)', () => {
    expect(contractCostAtYear(0, 2)).toBe(2);
    expect(contractCostAtYear(0, 3)).toBe(4);
    expect(contractCostAtYear(0, 4)).toBe(6);
  });

  it('matches Jeudy ($1 → $3 → $5 → $7)', () => {
    expect(contractCostAtYear(1, 2)).toBe(3);
    expect(contractCostAtYear(1, 3)).toBe(5);
    expect(contractCostAtYear(1, 4)).toBe(7);
  });

  it('returns null for out-of-range years', () => {
    expect(contractCostAtYear(10, 0)).toBeNull();
    expect(contractCostAtYear(10, MAX_CONTRACT_YEARS + 1)).toBeNull();
  });

  it('returns null for invalid prices', () => {
    expect(contractCostAtYear(-1, 1)).toBeNull();
    expect(contractCostAtYear(NaN, 1)).toBeNull();
  });
});

describe('nextYearCost', () => {
  it('computes the cost for the following year', () => {
    expect(nextYearCost(29, 1)).toBe(33);
    expect(nextYearCost(29, 2)).toBe(37);
    expect(nextYearCost(29, 3)).toBe(41);
  });

  it('returns null when the contract is in its final year', () => {
    expect(nextYearCost(29, 4)).toBeNull();
  });
});

describe('isExpiring', () => {
  it('is true for year 4', () => {
    expect(isExpiring(4)).toBe(true);
  });

  it('is false for years 1–3', () => {
    expect(isExpiring(1)).toBe(false);
    expect(isExpiring(2)).toBe(false);
    expect(isExpiring(3)).toBe(false);
  });
});

describe('displayCost', () => {
  it('renders dollar values with a $ prefix', () => {
    expect(displayCost(29)).toBe('$29');
    expect(displayCost(0)).toBe('$0');
  });

  it('renders an em-dash for null/undefined', () => {
    expect(displayCost(null)).toBe('—');
    expect(displayCost(undefined)).toBe('—');
  });
});
