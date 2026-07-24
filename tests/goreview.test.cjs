const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pluginRoot = path.join(root, 'plugins', 'goreview')
const reviewConfig = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'review.json'), 'utf8'))
const source = fs
  .readFileSync(path.join(pluginRoot, 'workflow.js'), 'utf8')
  .replace(/^export const meta/m, 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const workflow = new AsyncFunction('args', 'log', 'phase', 'agent', 'parallel', 'budget', source)

const defaultParallel = async tasks => Promise.all(tasks.map(task => task()))
const noBudget = { remaining: () => null }
const methods = Object.fromEntries(reviewConfig.judges.map(judge => [
  judge.label,
  fs.readFileSync(path.join(pluginRoot, judge.method), 'utf8'),
]))
const fileContent = [
  'package example',
  '',
  'func Open() error {',
  '\treturn nil',
  '}',
  '',
].join('\n')
const snapshot = {
  head: 'a'.repeat(40),
  diffHash: 'b'.repeat(64),
  capturedAt: '2026-07-24T10:00:00Z',
  diff: [
    'diff --git a/pkg/example.go b/pkg/example.go',
    'index 0000000..1111111 100644',
    '--- a/pkg/example.go',
    '+++ b/pkg/example.go',
    '@@ -1,4 +1,5 @@',
    ' package example',
    '+func Open() error { return nil }',
  ].join('\n'),
  files: [{ path: 'pkg/example.go', content: fileContent }],
}
const provenance = {
  host: 'test',
  model: 'test-model',
  reviewHash: 'c'.repeat(64),
  protocolHash: 'd'.repeat(64),
}
const baseArgs = { review: reviewConfig, methods, snapshot, provenance }
const fixArgs = {
  ...baseArgs,
  policy: 'Version: 1\nUse boring Go.',
  policySource: 'policy.md@1',
  apply: true,
  lockHeld: true,
}

const judgeConfig = label => reviewConfig.judges.find(judge => judge.label === label)
const ruleFor = (label, severity = null) => {
  const rules = judgeConfig(label).rules
  return rules.find(rule => !severity || rule.severity === severity) || rules[0]
}
const pointsFor = severity => reviewConfig.passPolicy.severityPoints[severity]
const primary = overrides => ({
  file: 'pkg/example.go',
  symbol: 'Open',
  startLine: 3,
  endLine: 3,
  excerpt: 'func Open() error {',
  ...overrides,
})
const deduction = (label, {
  severity = 'major',
  evidence = 'cited',
  rule = ruleFor(label, severity),
  overrides = {},
} = {}) => ({
  ruleId: rule.id,
  severity: rule.severity,
  primary: primary(),
  supporting: [],
  explanation: 'The cited invariant is violated.',
  evidence,
  change: 'Apply the smallest bounded correction.',
  ...overrides,
})
const scoreFor = deductions => Math.max(0, 10 - deductions
  .filter(item => item.evidence === 'cited')
  .reduce((total, item) => total + pointsFor(item.severity), 0))
const review = (label, deductions = []) => ({
  score: scoreFor(deductions),
  deductions,
  summary: deductions.length ? 'The change has a cited problem.' : 'The change is sound under this lens.',
  topFix: deductions.some(item =>
    item.evidence === 'cited' &&
    reviewConfig.passPolicy.failOnSeverities.includes(item.severity)
  ) || scoreFor(deductions) < reviewConfig.passPolicy.scoreThreshold
    ? 'Apply the cited correction.'
    : '',
})
const notApplicable = () => ({
  score: null,
  deductions: [],
  summary: 'This lens does not apply to the captured change.',
  topFix: '',
})
const deliberate = options => options.label === 'chair:chair'
  ? {
      status: 'READY',
      plan: 'Change pkg/example.go:Open while preserving its documented return behavior.',
      resolvedDisagreements: [],
      consultations: [],
      blockers: [],
    }
  : { position: 'KEEP', proposal: 'Apply the cited request.', rationale: 'The request remains necessary.' }
const verifiedSnapshot = {
  diffHash: 'e'.repeat(64),
  capturedAt: '2026-07-24T10:01:00Z',
  diff: snapshot.diff,
  files: snapshot.files,
}
const verification = (verified = true, overrides = {}) => ({
  verified,
  checks: reviewConfig.verification.requiredChecks.map(id => ({
    id,
    command: `verify-${id}`,
    exitCode: verified ? 0 : (id === 'test' ? 1 : 0),
    output: verified ? 'ok' : 'failed',
  })),
  changedFiles: ['pkg/example.go'],
  outOfScopeFiles: [],
  snapshot: verifiedSnapshot,
  report: verified ? 'All independent checks passed.' : 'The test check failed.',
  ...overrides,
})
const run = ({ args = {}, agent, parallel = defaultParallel, budget = noBudget, logs = [] }) =>
  workflow(args, message => logs.push(message), () => {}, agent, parallel, budget)

test('inspect exposes named judges, stable lens IDs, and neutral support agents without spawning', async () => {
  let calls = 0
  const result = await run({
    args: { review: reviewConfig, inspect: true },
    agent: async () => { calls++; throw new Error('agent should not run') },
  })

  assert.equal(result.verdict, 'INSPECT')
  assert.equal(result.roster.length, 12)
  assert.equal(result.roster.find(judge => judge.label === 'robpike').displayName, 'Rob Pike')
  assert.equal(result.roster.find(judge => judge.label === 'robpike').lensId, 'simplicity')
  assert.equal(result.roster.find(judge => judge.label === 'dvyukov').displayName, 'Dmitry Vyukov')
  assert.equal(result.chair, 'chair')
  assert.equal(result.verifier, 'verifier')
  assert.equal(result.defaultMaxReviewRounds, 3)
  assert.equal(result.maxAllowedReviewRounds, 6)
  assert.equal(calls, 0)
})

test('read-only mode uses defaults and preserves snapshot and model provenance', async () => {
  const calls = []
  const result = await run({
    args: baseArgs,
    agent: async (_prompt, options) => {
      calls.push(options.label)
      return review(options.label.replace('judge:', ''))
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  assert.deepEqual(result.selectedJudges, ['rsc', 'bradfitz', 'robpike'])
  assert.deepEqual(calls, ['judge:rsc', 'judge:bradfitz', 'judge:robpike'])
  assert.equal(result.snapshot.diffHash, snapshot.diffHash)
  assert.equal(result.provenance.model, 'test-model')
})

test('snapshot and provenance are required before a review seat can start', async () => {
  let calls = 0
  const agent = async () => { calls++; return review('robpike') }

  const missingSnapshot = await run({ args: { review: reviewConfig, methods, provenance }, agent })
  assert.equal(missingSnapshot.reason, 'SNAPSHOT_INVALID')

  const missingProvenance = await run({ args: { review: reviewConfig, methods, snapshot }, agent })
  assert.equal(missingProvenance.reason, 'PROVENANCE_INVALID')
  assert.equal(calls, 0)
})

test('a major rule fails even though older 8-of-10 semantics would have passed it', async () => {
  const finding = deduction('robpike', { severity: 'major' })
  const result = await run({
    args: { ...baseArgs, judges: [{ label: 'robpike' }] },
    agent: async () => review('robpike', [finding]),
  })

  assert.equal(result.verdict, 'REVIEW_ONLY')
  assert.equal(result.scores[0].score, 7)
  assert.equal(result.scores[0].verdict, 'FAIL')
  assert.equal(result.scores[0].deductions[0].severity, 'major')
  assert.equal(result.scores[0].deductions[0].primary.citationStatus, 'snapshot-verified')
})

test('Damian keeps benchmark-covered safety cost advisory and hands blocking evidence to the author', async () => {
  const costRule = judgeConfig('dgryski').rules.find(rule => rule.id === 'performance.cost-unquantified')
  const advisories = [
    deduction('dgryski', { severity: 'minor', rule: costRule }),
    deduction('dgryski', {
      severity: 'minor',
      rule: costRule,
      overrides: {
        primary: primary({
          symbol: 'Open return',
          startLine: 4,
          endLine: 4,
          excerpt: 'return nil',
        }),
      },
    }),
  ]
  const advisoryResult = await run({
    args: { ...baseArgs, judges: [{ label: 'dgryski' }] },
    agent: async () => review('dgryski', advisories),
  })
  assert.equal(advisoryResult.verdict, 'ACCEPTED')
  assert.equal(advisoryResult.scores[0].score, 8)
  assert.equal(advisoryResult.scores[0].deductions.length, 2)
  assert.match(advisoryResult.scores[0].scorecard, /MINOR EVIDENCE/)

  let calls = 0
  const evidenceFinding = deduction('dgryski', {
    severity: 'major',
    overrides: {
      change: 'Benchmark base and candidate with benchmem and publish the benchstat comparison.',
    },
  })
  const evidenceResult = await run({
    args: { ...fixArgs, judges: [{ label: 'dgryski' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      calls++
      if (options.label === 'judge:dgryski') return review('dgryski', [evidenceFinding])
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(evidenceResult.verdict, 'EVIDENCE_REQUIRED')
  assert.equal(evidenceResult.fixAttempts, 0)
  assert.equal(evidenceResult.evidenceRequests[0].ruleId, 'performance.no-baseline')
  assert.match(evidenceResult.evidenceRequests[0].request, /Benchmark base and candidate/)
  assert.equal(calls, 1)
})

test('minor findings can pass while all-N/A results never become ACCEPTED', async () => {
  const minor = deduction('robpike', { severity: 'minor' })
  const pass = await run({
    args: { ...baseArgs, judges: [{ label: 'robpike' }] },
    agent: async () => review('robpike', [minor]),
  })
  assert.equal(pass.verdict, 'ACCEPTED')
  assert.equal(pass.scores[0].score, 9)

  const noCoverage = await run({
    args: { ...baseArgs, judges: [{ label: 'rsc' }, { label: 'armon' }] },
    agent: async () => notApplicable(),
  })
  assert.equal(noCoverage.verdict, 'INSUFFICIENT_COVERAGE')
  assert.equal(noCoverage.applicableJudges, 0)
})

test('the engine rejects unauthorized rules, severity changes, bad excerpts, and arithmetic mismatch', async () => {
  const cases = [
    deduction('robpike', { overrides: { ruleId: 'simplicity.invented' } }),
    deduction('robpike', { overrides: { severity: 'blocker' } }),
    deduction('robpike', { overrides: { primary: primary({ excerpt: 'not in the file' }) } }),
  ]
  for (const finding of cases) {
    const result = await run({
      args: { ...baseArgs, judges: [{ label: 'robpike' }] },
      agent: async () => review('robpike', [finding]),
    })
    assert.equal(result.verdict, 'JUDGES_UNAVAILABLE')
  }

  const mismatch = await run({
    args: { ...baseArgs, judges: [{ label: 'robpike' }] },
    agent: async () => ({ ...review('robpike', [deduction('robpike')]), score: 10 }),
  })
  assert.equal(mismatch.verdict, 'JUDGES_UNAVAILABLE')
  assert.match(mismatch.seatErrors[0].error, /cited deductions require 7/)
})

test('supporting locations preserve cross-file evidence without corrupting compact rendering', async () => {
  const finding = deduction('kamstrup', {
    severity: 'major',
    overrides: {
      supporting: [{
        file: 'pkg/existing.go',
        symbol: 'Existing',
        startLine: 8,
        endLine: 8,
        excerpt: 'func Existing',
      }],
    },
  })
  const result = await run({
    args: { ...baseArgs, judges: [{ label: 'kamstrup' }] },
    agent: async () => review('kamstrup', [finding]),
  })

  assert.equal(result.scores[0].deductions[0].supporting[0].citationStatus, 'reported')
  assert.match(result.scores[0].scorecard, /pkg\/example\.go:3:Open/)
  assert.doesNotMatch(result.scores[0].scorecard, /pkg\/existing\.go/)
})

test('missing or slow seats fail closed and one grace window reuses the same promise', async () => {
  const missing = await run({
    args: baseArgs,
    parallel: async tasks => [await tasks[0]()],
    agent: async (_prompt, options) => review(options.label.replace('judge:', '')),
  })
  assert.equal(missing.verdict, 'JUDGES_UNAVAILABLE')
  assert.deepEqual(missing.missingJudges, ['bradfitz', 'robpike'])

  let calls = 0
  const slow = await run({
    args: { ...baseArgs, judges: [{ label: 'robpike' }], seatDeadlineMs: 1000 },
    agent: (_prompt, options) => {
      calls++
      return new Promise(resolve => setTimeout(() => resolve(review(options.label.replace('judge:', ''))), 1050))
    },
  })
  assert.equal(slow.verdict, 'ACCEPTED')
  assert.equal(calls, 1)
})

test('fix mode uses one neutral chair, one writer, independent verification, and re-review', async () => {
  const labels = []
  let reviewRound = 0
  const result = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      labels.push({ label: options.label, agentType: options.agentType })
      if (options.label === 'judge:robpike') {
        reviewRound++
        return review('robpike', reviewRound === 1 ? [deduction('robpike')] : [])
      }
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'Applied the chaired edit.' }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  assert.equal(result.fixAttempts, 1)
  assert.equal(result.reviewRounds, 2)
  assert.equal(result.history[0].deliberation.chair, 'chair')
  assert.deepEqual(result.history[0].deliberation.consultedJudges, [])
  assert.equal(result.history[0].fixVerified, true)
  assert.equal(labels.find(call => call.label === 'chair:chair').agentType, 'goreview:chair')
  assert.equal(labels.some(call => call.label.startsWith('deliberate:') || call.label.startsWith('consult:')), false)
  assert.equal(labels.find(call => call.label === 'verify:verifier').agentType, 'goreview:verifier')
  assert.equal(result.snapshot.diffHash, verifiedSnapshot.diffHash)
})

test('the chair synthesizes a multi-judge result without respawning the judges', async () => {
  const calls = []
  let round = 0
  const result = await run({
    args: {
      ...fixArgs,
      judges: [{ label: 'rsc' }, { label: 'bradfitz' }, { label: 'robpike' }],
      maxReviewRounds: 3,
      roundCostPerSeat: 0,
    },
    agent: async (prompt, options) => {
      calls.push({ label: options.label, prompt })
      if (options.label.startsWith('judge:')) {
        const label = options.label.replace('judge:', '')
        if (label === 'rsc') round++
        return review(label, round === 1 && label === 'robpike' ? [deduction('robpike')] : [])
      }
      if (options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'Applied the chaired edit.' }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  assert.equal(calls.filter(call => call.label === 'chair:chair').length, 1)
  assert.equal(calls.some(call => call.label.startsWith('deliberate:') || call.label.startsWith('consult:')), false)
  const chairPrompt = calls.find(call => call.label === 'chair:chair').prompt
  assert.doesNotMatch(chairPrompt, /Snapshot JSON/)
  assert.doesNotMatch(chairPrompt, /judge-method/)
  assert.match(chairPrompt, /Findings JSON/)
})

test('the chair consults only the finding owner needed to resolve a concrete conflict', async () => {
  const labels = []
  let reviewRound = 0
  let chairRound = 0
  const rscFinding = deduction('rsc')
  const pikeFinding = deduction('robpike')
  const result = await run({
    args: {
      ...fixArgs,
      judges: [{ label: 'rsc' }, { label: 'robpike' }],
      maxReviewRounds: 3,
      roundCostPerSeat: 0,
    },
    agent: async (_prompt, options) => {
      labels.push(options.label)
      if (options.label.startsWith('judge:')) {
        const label = options.label.replace('judge:', '')
        if (label === 'rsc') reviewRound++
        if (reviewRound > 1) return review(label)
        return review(label, [label === 'rsc' ? rscFinding : pikeFinding])
      }
      if (options.label === 'chair:chair') {
        chairRound++
        return {
          status: 'CONSULT',
          plan: '',
          resolvedDisagreements: [],
          consultations: [{
            seat: 'robpike',
            fingerprints: [pikeFinding.ruleId
              ? `robpike:${pikeFinding.ruleId}:pkg/example.go:Open:3`
              : ''],
            question: 'Can this request preserve the contract required by the other finding?',
          }],
          blockers: [],
        }
      }
      if (options.label === 'consult:robpike') {
        return {
          position: 'AMEND',
          proposal: 'Keep the contract while simplifying only the internal branch.',
          rationale: 'The public behavior does not need to change.',
        }
      }
      if (options.label === 'chair-final:chair') {
        return {
          status: 'READY',
          plan: 'Change pkg/example.go:Open internally, preserve its return contract, and resolve both cited fingerprints.',
          resolvedDisagreements: ['The internal simplification now preserves the public contract.'],
          consultations: [],
          blockers: [],
        }
      }
      if (options.label === 'fix') return { report: 'Applied the chaired edit.' }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  assert.equal(chairRound, 1)
  assert.deepEqual(result.history[0].deliberation.consultedJudges, ['robpike'])
  assert.equal(labels.includes('consult:rsc'), false)
  assert.equal(labels.filter(label => label.startsWith('consult:')).length, 1)
  assert.equal(labels.filter(label => label.startsWith('chair')).length, 2)
})

test('fix mode stops on independent verification failure and repeated finding oscillation', async () => {
  const failedVerification = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      if (options.label === 'judge:robpike') return review('robpike', [deduction('robpike')])
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'Edited.' }
      if (options.label === 'verify:verifier') return verification(false)
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(failedVerification.verdict, 'FIX_FAILED')
  assert.equal(failedVerification.fixAttempts, 1)

  const changedFileMismatch = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      if (options.label === 'judge:robpike') return review('robpike', [deduction('robpike')])
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'Edited.' }
      if (options.label === 'verify:verifier') return verification(true, { changedFiles: ['pkg/other.go'] })
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(changedFileMismatch.verdict, 'FIX_FAILED')

  let verifierCalls = 0
  const blockedPlan = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      if (options.label === 'judge:robpike') return review('robpike', [deduction('robpike')])
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'PLAN BLOCKED: the plan omitted a required symbol.' }
      if (options.label === 'verify:verifier') { verifierCalls++; return verification(true) }
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(blockedPlan.verdict, 'FIX_FAILED')
  assert.equal(verifierCalls, 0)

  let fixes = 0
  const oscillation = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      if (options.label === 'judge:robpike') return review('robpike', [deduction('robpike')])
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') { fixes++; return { report: 'Edited.' } }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(oscillation.verdict, 'OSCILLATION')
  assert.equal(fixes, 1)
})

test('the final review round never edits and budget shedding reserves verifier cost', async () => {
  let fixes = 0
  const stall = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 2, roundCostPerSeat: 0 },
    agent: async (_prompt, options) => {
      if (options.label === 'judge:robpike') return review('robpike', [deduction('robpike')])
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') { fixes++; return { report: 'Edited.' } }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })
  assert.equal(stall.verdict, 'OSCILLATION')
  assert.equal(fixes, 1)

  let calls = 0
  const budgetResult = await run({
    args: { ...fixArgs, judges: [{ label: 'robpike' }], maxReviewRounds: 3 },
    budget: { remaining: () => 1 },
    agent: async (_prompt, options) => {
      calls++
      return review(options.label.replace('judge:', ''), [deduction('robpike')])
    },
  })
  assert.equal(budgetResult.verdict, 'BUDGET_EXHAUSTED')
  assert.equal(calls, 1)
  assert.equal(budgetResult.fixAttempts, 0)
})

test('approved guests retain names, pinned provenance, rules, and one generic seat', async () => {
  const guest = {
    label: 'gh-octogo',
    github: 'octogo',
    displayName: 'Octo Go',
    lens: 'Bounded network inputs',
    rubric: [
      '# Octo Go-inspired lens',
      '## Voice',
      'Be precise.',
      '## Applies when',
      'Network input changes.',
      '## Does not apply when',
      'No network input changes.',
      '## Owns',
      'One narrow concern.',
      '## Does not own',
      'Everything else.',
      '## Evidence rule',
      'Cite code.',
      '## Rule catalog',
      'Use supplied rules.',
      '## Structured response',
      'Lead with score.',
    ].join('\n'),
    method: [
      '# Octo Go method',
      '## Review sequence',
      '1. Inspect input.',
      '## Evidence to seek',
      '- Concrete code.',
      '## Stop condition',
      'Stop when bounded.',
    ].join('\n'),
    rules: [{ id: 'guest.bounded-input', severity: 'major' }],
    retrievedAt: '2026-07-23T10:00:00Z',
    sources: [
      { kind: 'profile', url: 'https://github.com/octogo' },
      { kind: 'repository', url: 'https://github.com/octogo/one', revision: '1'.repeat(40), pushedAt: '2026-07-22T10:00:00Z' },
      { kind: 'repository', url: 'https://github.com/octogo/two', revision: '2'.repeat(40), pushedAt: '2026-07-21T10:00:00Z' },
    ],
  }
  const result = await run({
    args: { ...baseArgs, guestJudges: [guest], judges: [{ label: guest.label }] },
    agent: async (_prompt, options) => {
      assert.equal(options.agentType, 'goreview:guest')
      return review('robpike')
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  assert.equal(result.roster.find(item => item.label === 'robpike').displayName, 'Rob Pike')
  assert.equal(result.guestJudges[0].github, 'octogo')
})

test('house style remains fixer-only and performance re-review stays bounded to prior findings', async () => {
  const prompts = []
  let round = 0
  const codeRule = judgeConfig('dgryski').rules.find(rule =>
    rule.severity === 'major' && rule.remediation === 'code'
  )
  const result = await run({
    args: { ...fixArgs, judges: [{ label: 'dgryski' }], maxReviewRounds: 3, roundCostPerSeat: 0 },
    agent: async (prompt, options) => {
      prompts.push({ prompt, label: options.label })
      if (options.label === 'judge:dgryski') {
        round++
        return review('dgryski', round === 1 ? [deduction('dgryski', { rule: codeRule })] : [])
      }
      if (options.label.startsWith('deliberate:') || options.label === 'chair:chair') return deliberate(options)
      if (options.label === 'fix') return { report: 'Edited benchmark evidence.' }
      if (options.label === 'verify:verifier') return verification(true)
      throw new Error(`unexpected ${options.label}`)
    },
  })

  assert.equal(result.verdict, 'ACCEPTED')
  const judgePrompts = prompts.filter(item => item.label === 'judge:dgryski')
  assert.equal(judgePrompts.length, 2)
  assert.doesNotMatch(judgePrompts[0].prompt, /Use boring Go/)
  assert.match(judgePrompts[1].prompt, /Recheck only its cited deductions/)
  assert.match(prompts.find(item => item.label === 'fix').prompt, /Use boring Go/)
})
