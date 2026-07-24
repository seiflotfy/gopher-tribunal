const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const pluginRoot = path.join(root, 'plugins', 'goreview')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const readPlugin = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8')
const json = relative => JSON.parse(read(relative))
const pluginJson = relative => JSON.parse(readPlugin(relative))
const frontmatter = source => source.split('---')[1]

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(absolute)
    return entry.name.endsWith('.md') ? [absolute] : []
  })
}

test('Claude and Codex packages agree on the named GoLegends 0.2.1 identity', () => {
  const repository = 'https://github.com/axiomhq/go-legends'
  const claudePlugin = pluginJson('.claude-plugin/plugin.json')
  const codexPlugin = pluginJson('.codex-plugin/plugin.json')
  const claudeMarketplace = json('.claude-plugin/marketplace.json')
  const codexMarketplace = json('.agents/plugins/marketplace.json')

  assert.equal(claudePlugin.name, 'goreview')
  assert.equal(claudePlugin.version, '0.2.1')
  assert.equal(codexPlugin.name, claudePlugin.name)
  assert.equal(codexPlugin.version.split('+', 1)[0], claudePlugin.version)
  assert.match(codexPlugin.version, /^0\.2\.1\+codex\.\d{14}$/)
  assert.equal(claudePlugin.repository, repository)
  assert.equal(codexPlugin.repository, repository)
  assert.equal(claudeMarketplace.name, 'go-legends')
  assert.equal(codexMarketplace.name, 'go-legends')
})

test('review.json owns stable lens IDs, severity rules, sources, and neutral support agents', () => {
  const config = pluginJson('review.json')
  const labels = config.judges.map(judge => judge.label)
  const lensIds = config.judges.map(judge => judge.lensId)
  const methods = config.judges.map(judge => judge.method)

  assert.equal(config.schemaVersion, 2)
  assert.equal(config.name, 'GoLegends')
  assert.equal(config.language, 'Go')
  assert.equal(config.defaultMaxReviewRounds, 3)
  assert.equal(config.maxAllowedReviewRounds, 6)
  assert.deepEqual(config.passPolicy.severityPoints, { minor: 1, major: 3, blocker: 10 })
  assert.deepEqual(config.passPolicy.failOnSeverities, ['major', 'blocker'])
  assert.equal(config.passPolicy.minimumApplicableJudges, 1)
  assert.equal(config.chair, 'chair')
  assert.equal(config.verifier, 'verifier')
  assert.equal(config.fixer, 'fixer')
  assert.equal(labels.length, 12)
  assert.equal(new Set(labels).size, labels.length)
  assert.equal(new Set(lensIds).size, lensIds.length)
  assert.equal(new Set(methods).size, methods.length)
  assert.equal(labels.includes('dvyukov'), true)

  for (const judge of config.judges) {
    assert.match(judge.label, /^[a-z0-9-]+$/)
    assert.match(judge.lensId, /^[a-z0-9-]+$/)
    assert.equal(typeof judge.displayName, 'string')
    assert.equal(typeof judge.appliesWhen, 'string')
    assert.equal(judge.sources.length >= 2, true)
    assert.equal(judge.rules.length > 0, true)
    assert.equal(new Set(judge.rules.map(rule => rule.id)).size, judge.rules.length)
    for (const rule of judge.rules) {
      assert.match(rule.id, /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
      assert.equal(['minor', 'major', 'blocker'].includes(rule.severity), true)
      if (rule.remediation !== undefined) {
        assert.equal(['code', 'external-evidence'].includes(rule.remediation), true)
      }
    }
    assert.equal(fs.existsSync(path.join(pluginRoot, judge.path)), true)
    assert.equal(fs.existsSync(path.join(pluginRoot, judge.method)), true)
  }
})

test('judge names remain public identities while rubrics use stable rule catalogs', () => {
  const config = pluginJson('review.json')
  const expectedNames = new Map([
    ['robpike', 'Rob Pike'],
    ['bradfitz', 'Brad Fitzpatrick'],
    ['rsc', 'Russ Cox'],
    ['mitchellh', 'Mitchell Hashimoto'],
    ['kamstrup', 'Mikkel Kamstrup Erlandsen'],
    ['peterbourgon', 'Peter Bourgon'],
    ['armon', 'Armon Dadgar'],
    ['tsenart', 'Tomás Senart'],
    ['dgryski', 'Damian Gryski'],
    ['filosottile', 'Filippo Valsorda'],
    ['rakyll', 'Jaana Dogan'],
    ['dvyukov', 'Dmitry Vyukov'],
  ])

  for (const judge of config.judges) {
    assert.equal(judge.displayName, expectedNames.get(judge.label))
    const source = readPlugin(judge.path)
    const header = frontmatter(source)
    assert.match(header, new RegExp(`^name:\\s*${judge.label}$`, 'm'))
    assert.match(header, /^tools: Read, Grep, Glob$/m)
    assert.doesNotMatch(header, /\b(?:Bash|Edit|Write)\b/)
    for (const heading of [
      '## Voice',
      '## Applies when',
      '## Does not apply when',
      '## Owns',
      '## Does not own',
      '## Evidence rule',
      '## Rule catalog',
      '## Structured response',
    ]) assert.equal(source.includes(heading), true, `${judge.path} missing ${heading}`)
    assert.doesNotMatch(source, /Auto-fail/)
    for (const rule of judge.rules) assert.equal(source.includes(`\`${rule.id}\``), true, `${judge.path} missing ${rule.id}`)
    assert.match(source, /not affiliated with or endorsed by/i)
  }
})

test('named judges cannot invoke shell writes; only the fixer edits and verifier runs checks', () => {
  const config = pluginJson('review.json')
  const fixer = readPlugin('fixer.md')
  const verifier = readPlugin('verifier.md')
  const chair = readPlugin('chair.md')
  const guest = readPlugin('judges/guest.md')

  for (const judge of config.judges) {
    assert.doesNotMatch(frontmatter(readPlugin(judge.path)), /\b(?:Bash|Edit|Write)\b/)
  }
  assert.match(frontmatter(guest), /^tools: Read, Grep, Glob$/m)
  assert.match(frontmatter(chair), /^tools: Read, Grep, Glob$/m)
  assert.match(frontmatter(verifier), /^tools: Read, Grep, Glob, Bash$/m)
  assert.doesNotMatch(frontmatter(verifier), /\b(?:Edit|Write)\b/)
  assert.match(frontmatter(fixer), /^tools: Read, Grep, Glob, Edit, Write, Bash$/m)
  assert.match(verifier, /gofmt -d/)
  assert.match(verifier, /out of scope/i)
})

test('every method is process-only and the local concurrency method is evidence-backed', () => {
  const config = pluginJson('review.json')
  for (const judge of config.judges) {
    const method = readPlugin(judge.method)
    assert.match(method, /^# .+ method$/m)
    assert.match(method, /^## Review sequence$/m)
    assert.match(method, /^## Evidence to seek$/m)
    assert.match(method, /^## Stop condition$/m)
    assert.doesNotMatch(method, /^## (?:Deductions|Rule catalog)$/m)
  }

  assert.match(readPlugin('methods/dvyukov.md'), /happens-before/i)
  assert.match(readPlugin('judges/dvyukov.md'), /send and close/i)
  assert.match(readPlugin('methods/dgryski.md'), /does\s+not execute commands/i)
  assert.match(readPlugin('judges/dgryski.md'), /measurement\s+opportunity, not proof/i)
  const dgryski = config.judges.find(judge => judge.label === 'dgryski')
  assert.deepEqual(
    dgryski.rules.find(rule => rule.id === 'performance.cost-unquantified'),
    { id: 'performance.cost-unquantified', severity: 'minor', remediation: 'external-evidence' },
  )
})

test('Claude manifest exposes the canonical judges plus guest, chair, verifier, and fixer', () => {
  const config = pluginJson('review.json')
  const manifest = pluginJson('.claude-plugin/plugin.json')
  const expected = [
    ...config.judges.map(judge => `./${judge.path}`),
    './judges/guest.md',
    './chair.md',
    './verifier.md',
    './fixer.md',
  ]
  assert.deepEqual([...manifest.agents].sort(), expected.sort())
})

test('host adapters share snapshot, provenance, rules, neutral verification, and verdict semantics', () => {
  const protocol = readPlugin('protocol.md')
  const command = readPlugin('commands/goreview.md')
  const skill = readPlugin('skills/goreview/SKILL.md')
  const workflow = readPlugin('workflow.js')

  for (const source of [protocol, command, skill, workflow]) {
    assert.match(source, /snapshot/i)
    assert.match(source, /rule ID/i)
    assert.match(source, /severit(?:y|ies)/i)
    assert.match(source, /INSUFFICIENT_COVERAGE/)
    assert.match(source, /EVIDENCE_REQUIRED/)
    assert.match(source, /OSCILLATION/)
  }
  for (const source of [protocol, command, skill]) {
    assert.match(source, /neutral chair/i)
    assert.match(source, /independent verifier/i)
    assert.match(source, /repository.*judges/i)
  }
})

test('GitHub guest validation requires an approved rubric, method, and rule catalog', () => {
  const fixture = path.join(root, 'tests', 'fixtures', 'github-judge.json')
  const script = path.join(pluginRoot, 'scripts', 'github_judge.py')
  const fetched = childProcess.spawnSync('python3', [script, 'fetch', '@octogo', '--fixture', fixture], { encoding: 'utf8' })
  assert.equal(fetched.status, 0, fetched.stderr)
  const snapshot = JSON.parse(fetched.stdout)
  assert.equal(snapshot.repositories.length, 2)
  assert.equal(snapshot.sources[1].revision, '1'.repeat(40))

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-guest-'))
  const guestDir = path.join(temp, 'octogo')
  fs.mkdirSync(guestDir)
  fs.writeFileSync(path.join(guestDir, 'profile.json'), JSON.stringify({
    schemaVersion: 1,
    label: 'gh-octogo',
    github: 'octogo',
    displayName: 'Octo Go',
    lens: 'Bounded input',
    retrievedAt: snapshot.retrievedAt,
    sources: snapshot.sources,
  }))
  fs.writeFileSync(path.join(guestDir, 'judge.md'), [
    '# Octo Go-inspired lens',
    '## Voice', 'Be precise.',
    '## Applies when', 'Inputs change.',
    '## Does not apply when', 'Inputs do not change.',
    '## Owns', 'Bounds.',
    '## Does not own', 'Other concerns.',
    '## Evidence rule', 'Cite code.',
    '## Rule catalog', '- `guest.unbounded-input` — major: External input has no bound.',
    '## Structured response', 'Lead with score.',
  ].join('\n'))
  fs.writeFileSync(path.join(guestDir, 'method.md'), [
    '# Octo Go method',
    '## Review sequence', '1. Inspect.',
    '## Evidence to seek', '- A bound.',
    '## Stop condition', 'Stop when bounded.',
  ].join('\n'))
  fs.writeFileSync(path.join(guestDir, 'rules.json'), JSON.stringify({
    schemaVersion: 1,
    rules: [{ id: 'guest.unbounded-input', severity: 'major', summary: 'External input has no bound.' }],
  }))

  const validated = childProcess.spawnSync('python3', [script, 'validate', guestDir], { encoding: 'utf8' })
  assert.equal(validated.status, 0, validated.stderr)
  const record = JSON.parse(validated.stdout)
  assert.deepEqual(record.rules, [{ id: 'guest.unbounded-input', severity: 'major', summary: 'External input has no bound.' }])
  fs.rmSync(temp, { recursive: true, force: true })
})

test('all local Markdown links resolve', () => {
  const files = markdownFiles(root).filter(file => !file.includes(`${path.sep}.git${path.sep}`))
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1]
      if (/^(?:https?:|mailto:|#)/.test(target)) continue
      const clean = target.split('#', 1)[0]
      assert.equal(fs.existsSync(path.resolve(path.dirname(file), clean)), true, `${file}: missing ${target}`)
    }
  }
})

test('CI and release documentation cover the complete validation surface', () => {
  const ci = read('.github/workflows/ci.yml')
  const changelog = read('CHANGELOG.md')
  assert.match(ci, /node --test tests\/\*\.test\.cjs/)
  assert.match(ci, /node --check plugins\/goreview\/workflow\.js/)
  assert.match(ci, /github_judge\.py/)
  assert.match(ci, /node --test evals\/\*\.test\.cjs/)
  assert.match(ci, /git diff --check/)
  assert.match(changelog, /## 0\.2\.0/)
  assert.doesNotMatch(changelog, /0\.1\.0 — unreleased/)
})
