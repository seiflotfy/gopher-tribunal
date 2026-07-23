const assert = require('node:assert/strict')
const fs = require('node:fs')
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

test('Claude and Codex identities agree on GoLegends', () => {
  const repository = 'https://github.com/axiomhq/go-legends'
  const claudePlugin = pluginJson('.claude-plugin/plugin.json')
  const codexPlugin = pluginJson('.codex-plugin/plugin.json')
  const claudeMarketplace = json('.claude-plugin/marketplace.json')
  const codexMarketplace = json('.agents/plugins/marketplace.json')
  const claudeEntry = claudeMarketplace.plugins.find(({ name }) => name === claudePlugin.name)
  const codexEntry = codexMarketplace.plugins.find(({ name }) => name === claudePlugin.name)

  assert.equal(claudePlugin.name, 'goreview')
  assert.equal(codexPlugin.name, claudePlugin.name)
  assert.equal(codexPlugin.version, claudePlugin.version)
  assert.equal(claudePlugin.version, '0.1.3')
  assert.equal(claudePlugin.license, 'MIT')
  assert.equal(claudePlugin.author.name, 'Seif Lotfy')
  assert.match(claudePlugin.description, /named Go engineering perspectives/i)
  assert.deepEqual(claudePlugin.homepage, repository)
  assert.deepEqual(claudePlugin.repository, repository)
  assert.equal(codexPlugin.author.name, 'Seif Lotfy')
  assert.match(codexPlugin.description, /named Go engineering perspectives/i)
  assert.equal(codexPlugin.homepage, repository)
  assert.equal(codexPlugin.repository, repository)
  assert.equal(codexPlugin.interface.displayName, 'GoLegends')
  assert.equal(codexPlugin.interface.developerName, 'Seif Lotfy')
  assert.equal(codexPlugin.interface.websiteURL, repository)
  assert.equal(claudeMarketplace.name, 'go-legends')
  assert.equal(claudeMarketplace.owner.name, 'Seif Lotfy')
  assert.equal(claudeEntry.source, './plugins/goreview')
  assert.equal(codexMarketplace.name, 'go-legends')
  assert.equal(codexMarketplace.interface.displayName, 'GoLegends')
  assert.equal(codexEntry.source.path, './plugins/goreview')
  assert.equal(codexEntry.policy.installation, 'AVAILABLE')
  assert.equal(codexEntry.policy.authentication, 'ON_INSTALL')
})

test('review.json is the canonical Go roster and round configuration', () => {
  const reviewConfig = pluginJson('review.json')
  const labels = reviewConfig.judges.map(({ label }) => label)
  const paths = reviewConfig.judges.map(judge => `./${judge.path}`)
  const methods = reviewConfig.judges.map(judge => judge.method)
  const claudePlugin = pluginJson('.claude-plugin/plugin.json')

  assert.equal(reviewConfig.id, 'goreview')
  assert.equal(reviewConfig.name, 'GoLegends')
  assert.equal(reviewConfig.language, 'Go')
  assert.equal(reviewConfig.defaultMaxReviewRounds, 5)
  assert.equal(reviewConfig.maxAllowedReviewRounds, 10)
  assert.equal(reviewConfig.fixer, 'fixer')
  assert.match(reviewConfig.verification, /go build.*go test.*go vet/i)
  assert.equal(new Set(labels).size, 11)
  assert.equal(new Set(methods).size, labels.length)
  assert.equal(new Set(reviewConfig.conflictPriority).size, labels.length)
  assert.deepEqual([...reviewConfig.conflictPriority].sort(), [...labels].sort())
  assert.equal(reviewConfig.defaultJudges.every(label => labels.includes(label)), true)

  for (const judge of reviewConfig.judges) {
    assert.equal(fs.existsSync(path.join(pluginRoot, judge.path)), true, `missing ${judge.path}`)
    assert.equal(fs.existsSync(path.join(pluginRoot, judge.method)), true, `missing ${judge.method}`)
    assert.match(frontmatter(readPlugin(judge.path)), new RegExp(`^name:\\s*${judge.label}$`, 'm'))
    assert.equal(readPlugin(judge.path).includes(`../${judge.method}`), true, `${judge.path} must link its method`)

    const method = readPlugin(judge.method)
    assert.match(method, /^# .+ method$/m)
    assert.match(method, /^## Review sequence$/m)
    assert.match(method, /^## Evidence to seek$/m)
    assert.match(method, /^## Stop condition$/m)
    assert.doesNotMatch(method, /^## Deductions$/m)
  }

  assert.deepEqual(
    [...claudePlugin.agents].sort(),
    [...paths, './fixer.md'].sort(),
    'Claude must expose exactly the canonical judges and fixer',
  )
})

test('judges are read-only and the fixer is the only writing agent', () => {
  const reviewConfig = pluginJson('review.json')

  for (const { path: judgePath } of reviewConfig.judges) {
    const source = readPlugin(judgePath)
    const header = frontmatter(source)
    assert.match(header, /^tools: Read, Grep, Glob, Bash$/m)
    assert.doesNotMatch(header, /\b(?:Edit|Write)\b/)
    assert.match(source, /^## Structured response$/m)
    assert.match(source, /`score`: first[\s\S]*`deductions`:/)
    assert.match(source, /workflow verifies the score against cited deductions/i)
    assert.match(source, /\bpoints\b/)
    assert.match(source, /\bevidence\b/)
    assert.match(source, /-inspired lens/i)
    assert.match(source, /^## Voice$/m)
    assert.doesNotMatch(source, /policy\.md/)
    assert.doesNotMatch(source, /^## Output$/m)
  }

  const fixer = readPlugin('fixer.md')
  assert.match(frontmatter(fixer), /^name:\s*fixer$/m)
  assert.match(frontmatter(fixer), /^tools: Read, Grep, Glob, Edit, Write, Bash$/m)
})

test('the original three judges retain their distinct hard checks', () => {
  const robpike = readPlugin('judges/robpike.md')
  const bradfitz = readPlugin('judges/bradfitz.md')
  const rsc = readPlugin('judges/rsc.md')

  assert.match(robpike, /interface where a concrete type works/i)
  assert.match(robpike, /for\s+flexibility.*suspect/is)
  assert.match(bradfitz, /serialized length or offset/i)
  assert.match(bradfitz, /error is swallowed/i)
  assert.match(rsc, /unordered map traversal/i)
  assert.match(rsc, /global or build-time state/i)
})

test('the measured-performance judge is a bounded evidence audit', () => {
  const judge = readPlugin('judges/dgryski.md')
  const method = readPlugin('methods/dgryski.md')
  const protocol = readPlugin('protocol.md')

  assert.match(judge, /strict command budget/i)
  assert.match(judge, /does not run a missing performance campaign/i)
  assert.match(method, /not a performance-engineering campaign/i)
  assert.match(method, /review at most the two highest-impact claims/i)
  assert.match(method, /five-minute wall-clock budget/i)
  assert.match(method, /two existing targeted benchmark commands/i)
  assert.match(method, /-count` no greater than 3/i)
  assert.match(method, /do not run broad benchmark suites/i)
  assert.match(method, /does not generate a missing benchmark campaign/i)
  assert.match(method, /recheck only this judge's prior cited deductions/i)
  assert.match(protocol, /measured-performance seat is a bounded evidence audit/i)
  assert.match(protocol, /capped at five minutes/i)
  assert.match(readPlugin('workflow.js'), /DGRYSKI_REVIEW_WINDOW_MS\s*=\s*Math\.min\(SEAT_DEADLINE_MS, 150_000\)/)
})

test('the fixer executes a complete plan without making design decisions', () => {
  const protocol = readPlugin('protocol.md')
  const fixer = readPlugin('fixer.md')
  const workflow = readPlugin('workflow.js')

  for (const source of [protocol, fixer, workflow]) {
    assert.match(source, /file and symbol/i)
    assert.match(source, /must not change/i)
    assert.match(source, /design\s+decision/i)
  }

  assert.match(fixer, /PLAN BLOCKED/)
  assert.match(workflow, /PLAN BLOCKED/)
})

test('host adapters share one protocol and one review configuration', () => {
  const command = readPlugin('commands/goreview.md')
  const skill = readPlugin('skills/goreview/SKILL.md')
  const workflow = readPlugin('workflow.js')

  for (const source of [command, skill]) {
    assert.match(source, /protocol\.md/)
    assert.match(source, /review\.json/)
    assert.match(source, /policy\.md/)
    assert.match(source, /maxReviewRounds/)
    assert.match(source, /method/i)
    assert.match(source, /only.*fixer|fixer.*only/is)
  }

  assert.match(command, /workflow\.js/)
  assert.match(command, /--max-rounds/)
  assert.match(workflow, /defaultMaxReviewRounds/)
  assert.match(workflow, /maxAllowedReviewRounds/)
  assert.doesNotMatch(command, /const\s+(?:JUDGES|ROSTER|DEFAULT_BENCH)\s*=/)
  assert.doesNotMatch(skill, /const\s+(?:JUDGES|ROSTER|DEFAULT_BENCH)\s*=/)
})

test('Codex skill metadata is complete', () => {
  const skill = readPlugin('skills/goreview/SKILL.md')
  const metadata = readPlugin('skills/goreview/agents/openai.yaml')

  assert.doesNotMatch(skill, /\[TODO:/)
  assert.match(frontmatter(skill), /^name:\s*goreview$/m)
  assert.match(metadata, /display_name:\s*"GoLegends"/)
  assert.match(metadata, /\$goreview/)
})

test('installation docs point to the GoLegends marketplace', () => {
  const readme = read('README.md')
  assert.match(readme, /plugin marketplace add axiomhq\/go-legends/)
  assert.match(readme, /plugin install goreview@go-legends/)
  assert.match(readme, /plugin add goreview@go-legends/)
  assert.match(readme, /--max-rounds/)
  assert.match(readme, /seiflotfy/i)
})

test('all local Markdown links resolve', () => {
  for (const absolute of markdownFiles(root)) {
    if (absolute.includes(`${path.sep}.git${path.sep}`)) continue
    const relative = path.relative(root, absolute)
    const directory = path.dirname(absolute)

    for (const match of fs.readFileSync(absolute, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1]
      if (/^(?:https?:|mailto:|#)/.test(target)) continue
      const withoutAnchor = decodeURIComponent(target.split('#')[0])
      assert.equal(fs.existsSync(path.resolve(directory, withoutAnchor)), true, `${relative}: missing ${target}`)
    }
  }
})

test('the repository contains one Go review plugin', () => {
  assert.equal(fs.existsSync(path.join(root, 'docs', 'launch')), false)
  assert.deepEqual(fs.readdirSync(path.join(root, 'plugins')), ['goreview'])
  assert.equal(fs.existsSync(path.join(pluginRoot, 'languages')), false)
})

test('the GoLegends marketplace installs goreview', () => {
  const claudeMarketplace = json('.claude-plugin/marketplace.json')
  const codexMarketplace = json('.agents/plugins/marketplace.json')

  assert.equal(claudeMarketplace.name, 'go-legends')
  assert.deepEqual(claudeMarketplace.plugins.map(plugin => plugin.name), ['goreview'])
  assert.deepEqual(codexMarketplace.plugins.map(plugin => plugin.name), ['goreview'])
})

test('the engine and command document the same terminal verdicts', () => {
  const workflow = readPlugin('workflow.js')
  const command = readPlugin('commands/goreview.md')
  const verdicts = [
    'INSPECT',
    'INVALID_REQUEST',
    'JUDGES_UNAVAILABLE',
    'BUDGET_EXHAUSTED',
    'FIX_FAILED',
    'ACCEPTED',
    'REVIEW_ONLY',
    'SCOPE_EXPLOSION',
    'STALL',
  ]

  for (const verdict of verdicts) {
    assert.match(workflow, new RegExp(`\\b${verdict}\\b`), `workflow must declare ${verdict}`)
    assert.match(command, new RegExp(`\\b${verdict}\\b`), `command must handle ${verdict}`)
  }
})

test('per-judge JSON leads with the score and keeps explanations short', () => {
  const protocol = readPlugin('protocol.md')
  const workflow = readPlugin('workflow.js')
  const command = readPlugin('commands/goreview.md')

  assert.match(protocol, /judge JSON.*begins with `score`.*followed immediately by `deductions`/is)
  assert.match(protocol, /at\s+most 200 characters/i)
  assert.match(protocol, /at most four cited\s+deductions/i)
  assert.match(workflow, /MAX_EXPLANATION_CHARS\s*=\s*200/)
  assert.match(workflow, /MAX_RENDERED_DEDUCTIONS\s*=\s*4/)
  assert.match(workflow, /required:\s*\['score', 'deductions', 'summary', 'topFix'\]/)
  assert.match(workflow, /reported score.*cited deductions require/)
  assert.match(workflow, /Do not include reproduction narration/i)
  assert.match(command, /scorecard.*exactly once/is)
  assert.match(command, /Do not repeat deductions.*narrate the run/is)
})
