import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { SimulationInput, SimulationResult } from '../shared/simTypes';
import { runSimulation, applyPlanModifications } from '../shared/simulate';

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const geminiApiKey = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Simple health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Simulation endpoint
app.post('/api/simulate', (req, res) => {
  try {
    const input = SimulationInput.parse(req.body);
    const result = runSimulation(input);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'Simulation error' });
  }
});

// Insight generation
app.post('/api/insight', async (req, res) => {
  try {
    if (!genAI) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    const simResult = SimulationResult.parse(req.body);

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a friendly financial coach. Given this simulation summary, provide one short, encouraging, actionable tip (max 60 words). Avoid disclaimers.\n\nSummary JSON:\n${JSON.stringify(simResult)}\n\nTip:`;
    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    res.json({ tip: text });
  } catch (err) {
    res.status(500).json({ error: 'Insight generation failed' });
  }
});

// Brainstorm scenarios if shortfall
app.post('/api/brainstorm', async (req, res) => {
  try {
    if (!genAI) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    const simResult = SimulationResult.parse(req.body);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `If the plan shows a shortfall, brainstorm three creative and actionable scenarios to close the gap. Each scenario should have a title and 2-3 bullet action items. Output as JSON with: scenarios: [{title, actions: string[]}].\n\nPlan summary:\n${JSON.stringify(simResult)}\n\nJSON only:`;
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    // Best-effort JSON parse
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }
    if (!data || !Array.isArray(data.scenarios)) {
      res.json({ scenarios: [] });
      return;
    }
    res.json({ scenarios: data.scenarios });
  } catch (err) {
    res.status(500).json({ error: 'Brainstorming failed' });
  }
});

// Compare scenarios via natural language question
const CompareSchema = z.object({
  plan: SimulationInput,
  question: z.string().min(3),
});

app.post('/api/compare', async (req, res) => {
  try {
    if (!genAI) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    const { plan, question } = CompareSchema.parse(req.body);

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const schemaDescription = `Return JSON with a list of modifications to apply to the plan. Schema: { modifications: Array<Modification> } where Modification is one of: \n- { path: 'income.annual', op: 'set', value: number }\n- { path: 'expenses.annual', op: 'set', value: number }\n- { path: 'age.current', op: 'set', value: number }\n- { path: 'age.lifespan', op: 'set', value: number }\n- { path: 'returns.nonRegistered', op: 'set', value: number }\n- { path: 'returns.tfsa', op: 'set', value: number }\n- { path: 'returns.rrsp', op: 'set', value: number }\n- { path: 'balances.nonRegistered'|'balances.tfsa'|'balances.rrsp', op: 'add'|'set', value: number }\n- { path: 'strategy', op: 'set', value: 'TAX_ADV_FIRST'|'AGGR_NON_REGISTERED'|'AGGR_RRSP' }`;

    const prompt = `Given this financial plan JSON and a natural language hypothetical question, produce a small JSON object that modifies the plan to reflect the hypothesis. ${schemaDescription}\n\nPlan JSON:\n${JSON.stringify(plan)}\n\nQuestion: ${question}\n\nProvide JSON only, no extra text.`;

    const llm = await model.generateContent(prompt);
    const text = llm.response.text();

    let modifications: any = null;
    try { modifications = JSON.parse(text); } catch {}
    if (!modifications || !Array.isArray(modifications.modifications)) {
      return res.status(400).json({ error: 'Could not interpret question' });
    }

    const modifiedPlan = applyPlanModifications(plan, modifications.modifications);
    const baseResult = runSimulation(plan);
    const newResult = runSimulation(modifiedPlan);

    res.json({ baseResult, modifiedPlan, newResult });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'Comparison failed' });
  }
});

// Text-to-speech for a given text using Gemini audio output
const TtsSchema = z.object({ text: z.string().min(1).max(500) });

app.post('/api/tts', async (req, res) => {
  try {
    if (!genAI) {
      res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    const { text } = TtsSchema.parse(req.body);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([
      {
        text: `Convert the following tip into natural, upbeat speech suitable for all audiences. Output audio in 16kHz linear PCM.`
      } as any,
      { text } as any,
    ] as any);

    const parts: any = result.response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.mimeType?.includes('audio'));
    if (!audioPart) {
      return res.status(500).json({ error: 'No audio produced' });
    }
    const { data, mimeType } = audioPart.inlineData;
    res.json({ audioBase64: data, mimeType: mimeType || 'audio/wav' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.issues });
      return;
    }
    res.status(500).json({ error: 'TTS failed' });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});