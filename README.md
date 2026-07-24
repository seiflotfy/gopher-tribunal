# GoLegends

**Named Go engineering perspectives review your code and explain every
deduction.**

GoLegends is a Go-only review tool whose judges keep the names and voices of
engineers whose public work shaped each perspective. Names are the human-facing
identities; stable lens IDs and rule IDs are the machine contract. The people
are not affiliated with, endorsing, or personally participating in reviews.

Judges review one immutable diff independently, use only authorized rules and
severity, cite exact code, and can optionally deliberate over one guarded fix.

## Install

Claude Code:

```text
/plugin marketplace add axiomhq/go-legends
/plugin install goreview@go-legends
```

Codex:

```text
codex plugin marketplace add axiomhq/go-legends
codex plugin add goreview@go-legends
```

Invoke `/goreview` in Claude Code or `$goreview` in Codex.

## Use

```text
/goreview
/goreview list
/goreview robpike rsc
/goreview dvyukov -- pkg/worker
/goreview filosottile -- pkg/auth
/goreview robpike -- pr 123
/goreview:add @davecheney
/goreview @davecheney -- pkg/cache
/goreview --fix
/goreview --fix --max-rounds 3 robpike rsc
```

Everything after the literal `--` is scope. Without scope, GoLegends reviews
the staged and unstaged working-tree change.

## Immutable, rule-authorized review

Before a judge starts, the adapter captures HEAD, exact diff and SHA-256, UTC
time, and the full contents of every changed file. It also records host, model,
and config hashes. Judges receive only read/search tools.

Every deduction contains:

- a stable rule ID and configured severity;
- a `code` or `external-evidence` remediation class;
- one primary changed-file path, symbol, line range, and exact excerpt;
- up to three supporting locations;
- one factual explanation; and
- one minimal proposed change.

The engine rejects invented rules, changed severity, mismatched primary
excerpts, duplicate fingerprints, and incorrect score arithmetic.

```text
ROB PIKE — Simplicity: 7/10 — FAIL
−3 MAJOR  sparse.go:41:set.ForEach — the wrapper creates a second iteration path with no distinct contract
Top fix: collapse the wrapper and use the underlying set API directly
```

Severity points are `minor=1`, `major=3`, and `blocker=10`. Major and blocker
findings fail even if a numerical threshold alone would pass. Minor findings
remain visible and can accumulate below the score threshold. Unverified
observations carry zero points and cannot drive a fix.

N/A means the lens did not apply; it is not assent. A run with no applicable
judge returns `INSUFFICIENT_COVERAGE`, never `ACCEPTED`.

## Judges

Defaults are `rsc`, `bradfitz`, and `robpike`.

| Judge | Stable lens ID | Default | Lens |
|---|---|:---:|---|
| `robpike` | `simplicity` | ✓ | Simplicity |
| `bradfitz` | `input-integrity` | ✓ | Parser and I/O integrity |
| `rsc` | `contract-evolution` | ✓ | Contract evolution |
| `mitchellh` | `package-boundaries` |  | Package boundaries |
| `kamstrup` | `composition-reuse` |  | Demonstrated composition and reuse |
| `peterbourgon` | `runtime-lifecycle` |  | Runtime lifecycle |
| `armon` | `distributed-invariants` |  | Distributed invariants |
| `tsenart` | `overload-control` |  | Overload control |
| `dgryski` | `performance-evidence` |  | Performance evidence |
| `filosottile` | `security-boundaries` |  | Security boundaries |
| `rakyll` | `production-diagnostics` |  | Production diagnostics |
| `dvyukov` | `local-concurrency` |  | Local concurrency |

Each judge declares when it applies, when it does not, what it owns, what it
does not own, authorized rule IDs, required evidence, and at least two public
source references. Subjective design preferences cannot auto-fail a change.

## Repository configuration

Add `.goreview.json` at the reviewed repository root:

```json
{
  "judges": ["robpike", "filosottile", "@davecheney"],
  "maxReviewRounds": 3
}
```

Judge precedence is consistent in read-only and fix mode:

1. Explicit command judges.
2. Repository judges.
3. Shipped defaults in read-only mode, or automatic named-judge selection in
   fix mode.

Round precedence is command option, repository configuration, then the shipped
default of three. The hard range is 2–6. The final round never edits.

## Guarded fixes

`--fix` writes files. Before each edit:

1. A neutral chair synthesizes the compact cited findings into one coherent
   plan under invariant-first conflict policy. Named judges never chair.
2. Only when cited requests concretely conflict does the chair ask up to three
   finding owners one narrow question each. Passing and uninvolved judges are
   not respawned.
3. One fixer applies only that plan using `policy.md`.
4. An independent verifier—not the fixer—checks changed-file scope,
   `gofmt -d`, and scoped build, test, and vet commands with exact exit codes.
5. The verifier captures the next immutable snapshot.
6. Every selected judge re-reviews that snapshot.

Finding fingerprints and severity weight track progress. A repeated finding set
returns `OSCILLATION`; rising risk returns `SCOPE_EXPLOSION`. Verification
failure is terminal and leaves the working tree for human inspection.

Evidence-only gates do not enter the edit loop. When every blocking finding
requires an author-supplied benchmark, profile, or other measurement,
GoLegends returns `EVIDENCE_REQUIRED` immediately with the exact requests. If
code and evidence findings coexist, it fixes only the code findings, re-reviews,
and then hands off any remaining evidence.

Damian's performance lens distinguishes a production hot path established by
supplied profile or budget evidence from code that merely has an adjacent
benchmark. Correctness or security hardening that adds measurable work to
benchmark-covered code receives a visible minor advisory and can still pass.
Explicit performance claims or established hot-path changes without a baseline
remain blocking evidence requests.

Writers are serialized by an atomic Git-local lock. If an interrupted run
leaves a stale lock, first verify no GoLegends fixer is active, then inspect:

```bash
git rev-parse --git-path goreview-fix.lock
```

## Repository-pinned guest judges

Guest discovery is explicit:

```text
/goreview:add @github-handle
```

GitHub profile and recent repository metadata establish a bounded identity
snapshot; repository names and topics are not treated as proof of a person's
review philosophy. The user supplies and approves the intended narrow basis.

An approved guest contains exactly:

```text
.goreview/judges/<handle>/
  profile.json
  judge.md
  rules.json
  method.md
```

Guests are repository-local, validated before each explicit use, share one
generic read-only seat, and are never automatically selected or silently
refreshed.

## Project structure

| Path | Owns |
|---|---|
| [`review.json`](plugins/goreview/review.json) | Named identities, stable lens IDs, rules, severity, sources, pass policy, support agents, verification, and rounds |
| [`protocol.md`](plugins/goreview/protocol.md) | Host-neutral snapshot, review, fix, and result contract |
| [`judges/`](plugins/goreview/judges/) | Named voice, applicability, ownership, evidence, and rule explanations |
| [`methods/`](plugins/goreview/methods/) | Investigation order without rule authority |
| [`chair.md`](plugins/goreview/chair.md) | Neutral fix-plan reconciliation |
| [`fixer.md`](plugins/goreview/fixer.md) | The only source-editing seat |
| [`verifier.md`](plugins/goreview/verifier.md) | Independent exact-command and changed-file verification |
| [`policy.md`](plugins/goreview/policy.md) | Fixer-only implementation guidance |
| [`workflow.js`](plugins/goreview/workflow.js) | Snapshot, rule, evidence, score, coverage, progress, and result validation |
| [`evals/`](evals/) | Human-labelled positive, negative, applicability, and cross-lens fixtures |

See [the architecture](docs/architecture.md).

## Add a built-in judge

1. Add the named rubric and investigation method.
2. Add display name, unique stable lens ID, applicability, at least two public
   sources, and authorized rules to `review.json`.
3. Add every rule ID to the rubric's Rule catalog with the exact severity.
4. Add positive, negative, applicability, and cross-lens eval expectations.
5. Add the judge path to the Claude manifest.
6. Run the complete validation suite.

Named labels and lens IDs use lowercase letters, digits, and hyphens. Rule IDs
are stable dotted lowercase identifiers.

## Validate

```bash
node --test tests/*.test.cjs
node --test evals/*.test.cjs
node --check plugins/goreview/workflow.js
python3 plugins/goreview/scripts/github_judge.py fetch @octogo --fixture tests/fixtures/github-judge.json
claude plugin validate --strict plugins/goreview/.claude-plugin/plugin.json
claude plugin validate --strict .claude-plugin/marketplace.json
uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/goreview
uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" plugins/goreview/skills/goreview
git diff --check
```

## Origin

GoLegends began while working on EventDB, Axiom's object-storage-based
database. AI-generated Go often compiled while missing design, serialization,
and failure-path problems that later appeared in human review.

[The first public prompt](https://gist.github.com/seiflotfy/76fdca5cf4fcc8e67bd5899b09320a37)
put Rob Pike, Brad Fitzpatrick, and Russ Cox into one iterative loop. Later
iterations separated judging from writing, required cited evidence, bounded the
fix loop, and made every judge independent.

## The names

The names remain because they make the perspectives memorable and acknowledge
the public work that inspired them. Stable lens IDs keep configuration
independent from presentation. If a referenced person wants their name removed,
open an issue; it will be changed without argument.

## License

[MIT](LICENSE)
