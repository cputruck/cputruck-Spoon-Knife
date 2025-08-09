import { z } from 'zod';

export const StrategyEnum = z.enum(['TAX_ADV_FIRST', 'AGGR_NON_REGISTERED', 'AGGR_RRSP']);

export const SimulationInput = z.object({
  age: z.object({ current: z.number().int().min(0).max(120), lifespan: z.number().int().min(1).max(130) }),
  income: z.object({ annual: z.number().min(0) }),
  expenses: z.object({ annual: z.number().min(0) }),
  balances: z.object({
    nonRegistered: z.number().min(0),
    tfsa: z.number().min(0),
    rrsp: z.number().min(0),
  }),
  returns: z.object({
    nonRegistered: z.number().min(-1).max(1),
    tfsa: z.number().min(-1).max(1),
    rrsp: z.number().min(-1).max(1),
  }),
  strategy: StrategyEnum,
});

export type SimulationInput = z.infer<typeof SimulationInput>;

export type YearBreakdown = {
  age: number;
  startBalances: { nonRegistered: number; tfsa: number; rrsp: number };
  returns: { nonRegistered: number; tfsa: number; rrsp: number };
  withdrawals: { nonRegistered: number; tfsa: number; rrsp: number };
  deposits: { nonRegistered: number; tfsa: number; rrsp: number };
  endBalances: { nonRegistered: number; tfsa: number; rrsp: number };
  income: number;
  expenses: number;
  totalAssetsEnd: number;
};

export const SimulationResult = z.object({
  input: SimulationInput,
  years: z.array(z.object({
    age: z.number(),
    startBalances: z.object({ nonRegistered: z.number(), tfsa: z.number(), rrsp: z.number() }),
    returns: z.object({ nonRegistered: z.number(), tfsa: z.number(), rrsp: z.number() }),
    withdrawals: z.object({ nonRegistered: z.number(), tfsa: z.number(), rrsp: z.number() }),
    deposits: z.object({ nonRegistered: z.number(), tfsa: z.number(), rrsp: z.number() }),
    endBalances: z.object({ nonRegistered: z.number(), tfsa: z.number(), rrsp: z.number() }),
    income: z.number(),
    expenses: z.number(),
    totalAssetsEnd: z.number(),
  })),
  shortfall: z.object({ exists: z.boolean(), age: z.number().nullable() }),
});

export type SimulationResult = z.infer<typeof SimulationResult>;