import { SimulationInput, StrategyEnum, YearBreakdown, SimulationResult } from './simTypes';

export function runSimulation(input: SimulationInput): SimulationResult {
  const years: YearBreakdown[] = [];

  let age = input.age.current;
  let nonReg = input.balances.nonRegistered;
  let tfsa = input.balances.tfsa;
  let rrsp = input.balances.rrsp;

  let shortfallAge: number | null = null;

  while (age < input.age.lifespan) {
    const startNonReg = nonReg;
    const startTfsa = tfsa;
    const startRrsp = rrsp;

    const retNonReg = startNonReg * input.returns.nonRegistered;
    const retTfsa = startTfsa * input.returns.tfsa;
    const retRrsp = startRrsp * input.returns.rrsp;

    nonReg += retNonReg;
    tfsa += retTfsa;
    rrsp += retRrsp;

    const need = Math.max(0, input.expenses.annual - input.income.annual);
    const surplus = Math.max(0, input.income.annual - input.expenses.annual);

    let wNonReg = 0, wTfsa = 0, wRrsp = 0;
    let dNonReg = 0, dTfsa = 0, dRrsp = 0;

    if (need > 0) {
      const order = getWithdrawalOrder(input.strategy);
      let remaining = need;
      for (const acct of order) {
        if (remaining <= 0) break;
        if (acct === 'tfsa') {
          const take = Math.min(tfsa, remaining);
          tfsa -= take; wTfsa += take; remaining -= take;
        } else if (acct === 'rrsp') {
          const take = Math.min(rrsp, remaining);
          rrsp -= take; wRrsp += take; remaining -= take;
        } else {
          const take = Math.min(nonReg, remaining);
          nonReg -= take; wNonReg += take; remaining -= take;
        }
      }
      if (remaining > 0 && shortfallAge === null) {
        shortfallAge = age;
      }
    } else if (surplus > 0) {
      // Put surplus into non-registered for simplicity
      nonReg += surplus; dNonReg += surplus;
    }

    years.push({
      age,
      startBalances: { nonRegistered: startNonReg, tfsa: startTfsa, rrsp: startRrsp },
      returns: { nonRegistered: retNonReg, tfsa: retTfsa, rrsp: retRrsp },
      withdrawals: { nonRegistered: wNonReg, tfsa: wTfsa, rrsp: wRrsp },
      deposits: { nonRegistered: dNonReg, tfsa: dTfsa, rrsp: dRrsp },
      endBalances: { nonRegistered: nonReg, tfsa, rrsp },
      income: input.income.annual,
      expenses: input.expenses.annual,
      totalAssetsEnd: nonReg + tfsa + rrsp,
    });

    age += 1;
  }

  return {
    input,
    years,
    shortfall: { exists: shortfallAge !== null, age: shortfallAge },
  };
}

function getWithdrawalOrder(strategy: StrategyEnum): Array<'tfsa'|'rrsp'|'nonReg'> {
  switch (strategy) {
    case 'TAX_ADV_FIRST':
      return ['tfsa', 'rrsp', 'nonReg'];
    case 'AGGR_NON_REGISTERED':
      return ['nonReg', 'tfsa', 'rrsp'];
    case 'AGGR_RRSP':
      return ['rrsp', 'nonReg', 'tfsa'];
    default:
      return ['nonReg', 'tfsa', 'rrsp'];
  }
}

export type Modification = { path: string; op: 'set'|'add'; value: number | string };

export function applyPlanModifications(plan: SimulationInput, modifications: Modification[]): SimulationInput {
  const updated: SimulationInput = JSON.parse(JSON.stringify(plan));
  for (const m of modifications) {
    const parts = m.path.split('.');
    if (m.path === 'strategy' && m.op === 'set' && typeof m.value === 'string') {
      if ((['TAX_ADV_FIRST','AGGR_NON_REGISTERED','AGGR_RRSP'] as const).includes(m.value as any)) {
        (updated as any).strategy = m.value;
      }
      continue;
    }
    let target: any = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] === undefined) { target[parts[i]] = {}; }
      target = target[parts[i]];
    }
    const key = parts[parts.length - 1];
    if (m.op === 'set') {
      target[key] = m.value;
    } else if (m.op === 'add' && typeof m.value === 'number') {
      target[key] = (Number(target[key]) || 0) + m.value;
    }
  }
  return updated;
}