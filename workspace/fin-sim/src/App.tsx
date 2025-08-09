import { useMemo, useState } from 'react'
import './App.css'
import { StrategyEnum, SimulationInput, SimulationResult } from '../shared/simTypes'
import { runSimulation } from '../shared/simulate'
import Papa from 'papaparse'

const defaultPlan: SimulationInput = {
  age: { current: 35, lifespan: 90 },
  income: { annual: 70000 },
  expenses: { annual: 50000 },
  balances: { nonRegistered: 50000, tfsa: 40000, rrsp: 100000 },
  returns: { nonRegistered: 0.05, tfsa: 0.06, rrsp: 0.06 },
  strategy: 'AGGR_NON_REGISTERED'
}

function App() {
  const [plan, setPlan] = useState<SimulationInput>(defaultPlan)
  const result = useMemo(() => runSimulation(plan), [plan])
  const [insight, setInsight] = useState('')
  const [compareQ, setCompareQ] = useState('')
  const [compareResult, setCompareResult] = useState<any>(null)
  const [brainstorm, setBrainstorm] = useState<any[]>([])
  const [ttsBusy, setTtsBusy] = useState(false)

  const onNumber = (path: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value || '0')
    setPlan(prev => {
      const copy = JSON.parse(JSON.stringify(prev)) as SimulationInput
      const keys = path.split('.') as any
      let t: any = copy
      for (let i=0;i<keys.length-1;i++) t = t[keys[i]]
      t[keys[keys.length-1]] = isNaN(value) ? 0 : value
      return copy
    })
  }

  const exportCsv = () => {
    const rows = result.years.map(y => ({
      age: y.age,
      income: y.income,
      expenses: y.expenses,
      start_nonReg: y.startBalances.nonRegistered,
      start_tfsa: y.startBalances.tfsa,
      start_rrsp: y.startBalances.rrsp,
      ret_nonReg: y.returns.nonRegistered,
      ret_tfsa: y.returns.tfsa,
      ret_rrsp: y.returns.rrsp,
      w_nonReg: y.withdrawals.nonRegistered,
      w_tfsa: y.withdrawals.tfsa,
      w_rrsp: y.withdrawals.rrsp,
      end_nonReg: y.endBalances.nonRegistered,
      end_tfsa: y.endBalances.tfsa,
      end_rrsp: y.endBalances.rrsp,
      total_end: y.totalAssetsEnd
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulation.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const getInsight = async () => {
    const res = await fetch('/api/insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
    const data = await res.json()
    setInsight(data.tip || '')
  }

  const speakInsight = async () => {
    if (!insight) return
    // Try Web Speech first
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(insight)
      window.speechSynthesis.speak(utter)
      return
    }
    // Fallback to server TTS
    try {
      setTtsBusy(true)
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: insight }) })
      const data = await res.json()
      if (data.audioBase64) {
        const bytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.play()
      }
    } finally {
      setTtsBusy(false)
    }
  }

  const doBrainstorm = async () => {
    const res = await fetch('/api/brainstorm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
    const data = await res.json()
    setBrainstorm(data.scenarios || [])
  }

  const doCompare = async () => {
    const res = await fetch('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, question: compareQ }) })
    const data = await res.json()
    setCompareResult(data)
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
      <h2>Financial Simulation</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <fieldset>
          <legend>Age</legend>
          <label>Current
            <input type="number" value={plan.age.current} onChange={onNumber('age.current')} />
          </label>
          <label>Lifespan
            <input type="number" value={plan.age.lifespan} onChange={onNumber('age.lifespan')} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Cash Flow</legend>
          <label>Income (annual)
            <input type="number" value={plan.income.annual} onChange={onNumber('income.annual')} />
          </label>
          <label>Expenses (annual)
            <input type="number" value={plan.expenses.annual} onChange={onNumber('expenses.annual')} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Balances</legend>
          <label>Non-Registered
            <input type="number" value={plan.balances.nonRegistered} onChange={onNumber('balances.nonRegistered')} />
          </label>
          <label>TFSA
            <input type="number" value={plan.balances.tfsa} onChange={onNumber('balances.tfsa')} />
          </label>
          <label>RRSP
            <input type="number" value={plan.balances.rrsp} onChange={onNumber('balances.rrsp')} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Return rates</legend>
          <label>Non-Registered
            <input type="number" step={0.01} value={plan.returns.nonRegistered} onChange={onNumber('returns.nonRegistered')} />
          </label>
          <label>TFSA
            <input type="number" step={0.01} value={plan.returns.tfsa} onChange={onNumber('returns.tfsa')} />
          </label>
          <label>RRSP
            <input type="number" step={0.01} value={plan.returns.rrsp} onChange={onNumber('returns.rrsp')} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Withdrawal Strategy</legend>
          <select value={plan.strategy} onChange={(e) => setPlan({ ...plan, strategy: e.target.value as StrategyEnum })}>
            <option value="TAX_ADV_FIRST">Tax-Advantaged First</option>
            <option value="AGGR_NON_REGISTERED">Aggressive Non-Registered</option>
            <option value="AGGR_RRSP">Aggressive RRSP</option>
          </select>
        </fieldset>
      </div>

      <div style={{ marginTop: 16 }}>
        {result.shortfall.exists ? (
          <div style={{ color: 'crimson' }}>
            Shortfall projected at age {result.shortfall.age}
          </div>
        ) : (
          <div style={{ color: 'green' }}>No shortfall projected through age {plan.age.lifespan}</div>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={exportCsv}>Download CSV</button>
        <button onClick={getInsight}>Get AI Tip</button>
        <button onClick={speakInsight} disabled={!insight || ttsBusy}>{ttsBusy ? 'Speaking…' : 'Speak Tip'}</button>
        {result.shortfall.exists && <button onClick={doBrainstorm}>Brainstorm 3 Scenarios</button>}
      </div>

      {insight && (
        <div style={{ marginTop: 8, padding: 8, background: '#f4f6f8', borderRadius: 8 }}>
          <strong>AI Tip:</strong> {insight}
        </div>
      )}

      {brainstorm.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Scenarios</h3>
          <ol>
            {brainstorm.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong>
                <ul>
                  {(s.actions||[]).map((a: string, j: number) => (<li key={j}>{a}</li>))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3>Compare Scenarios</h3>
        <input style={{ width: '100%' }} placeholder="e.g., What if I increased my annual income by $5,000?" value={compareQ} onChange={e => setCompareQ(e.target.value)} />
        <button onClick={doCompare} disabled={!compareQ.trim()}>Compare</button>
        {compareResult && (
          <div style={{ marginTop: 12 }}>
            <div><strong>Modified Plan:</strong></div>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(compareResult.modifiedPlan, null, 2)}</pre>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <h4>Current Plan</h4>
                <SummaryCard result={compareResult.baseResult} lifespan={plan.age.lifespan} />
              </div>
              <div>
                <h4>New Plan</h4>
                <SummaryCard result={compareResult.newResult} lifespan={plan.age.lifespan} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>First 10 years</h3>
        <table>
          <thead>
            <tr>
              <th>Age</th>
              <th>Total End</th>
              <th>NR End</th>
              <th>TFSA End</th>
              <th>RRSP End</th>
              <th>Withdrawals (NR/TFSA/RRSP)</th>
            </tr>
          </thead>
          <tbody>
            {result.years.slice(0, 10).map(y => (
              <tr key={y.age}>
                <td>{y.age}</td>
                <td>{y.totalAssetsEnd.toLocaleString()}</td>
                <td>{y.endBalances.nonRegistered.toLocaleString()}</td>
                <td>{y.endBalances.tfsa.toLocaleString()}</td>
                <td>{y.endBalances.rrsp.toLocaleString()}</td>
                <td>{y.withdrawals.nonRegistered.toLocaleString()} / {y.withdrawals.tfsa.toLocaleString()} / {y.withdrawals.rrsp.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ result, lifespan }: { result: SimulationResult, lifespan: number }) {
  const last = result.years[result.years.length - 1]
  return (
    <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 8 }}>
      <div>Total assets at end: <strong>{last.totalAssetsEnd.toLocaleString()}</strong></div>
      <div>Shortfall: {result.shortfall.exists ? `Yes at age ${result.shortfall.age}` : `No (to ${lifespan})`}</div>
    </div>
  )
}

export default App
