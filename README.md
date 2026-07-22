# GoLegends

**Named Go engineering perspectives review your code and explain every
deduction.**

GoLegends is the Go review tool I built for myself. Its judges are Markdown
rubrics shaped by public writing, talks, and open-source work from engineers I
have learned from. They review independently, cite the code behind every
deduction, and can optionally deliberate over one guarded fix.

The project is Go-only by design. It does not try to be a generic review
framework or predict what another language implementation might need.

GoLegends was designed for Claude Code first. The `/goreview` command uses its
Workflow runtime to coordinate parallel judges, deliberation, guarded fixes,
and re-review. The Codex skill follows the same protocol and reads the same
judge rubrics, but adapts that orchestration to Codex rather than running the
Claude workflow.

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
/goreview filosottile -- pkg/auth
/goreview robpike -- pr 123
/goreview --fix
/goreview --fix --max-rounds 3 robpike rsc
```

Everything after the literal `--` is review scope. Without a scope, GoLegends
reviews the current staged and unstaged working-tree change.

## Scorecards explain the failure

Judges return structured evidence, not self-reported scores. The engine renders
one scorecard from those deductions:

```text
ROB PIKE — Simplicity: 7/10
Deductions:
  −2  sparse.go:set.ForEach — the wrapper creates two ways to iterate one set;
      change: embed the underlying set and delete the forwarding method  [cited]
  −1  sparse.go:set.add — Has followed by Add performs two lookups;
      change: return Add directly  [cited]
Verdict: FAIL
If FAIL: collapse the wrapper and use the underlying set API directly
```

Every applicable judge starts at 10. Only cited deductions lower the score; the
engine—not the judge—calculates the score and PASS/FAIL verdict. A score of 8 or
higher passes. Unverified observations remain visible but carry zero points and
cannot drive an automatic fix.

See [the complete example](docs/example-scorecard.md).

## Judges

The defaults are `rsc`, `bradfitz`, and `robpike`.

| Judge | Default | Lens |
|---|:---:|---|
| `robpike` | ✓ | Simplicity and deletability |
| `bradfitz` | ✓ | Input safety and failure isolation |
| `rsc` | ✓ | Contract longevity |
| `mitchellh` |  | Composition and boundaries |
| `kamstrup` |  | Composition, reuse, and ownership |
| `peterbourgon` |  | Operability |
| `armon` |  | Distributed correctness |
| `tsenart` |  | Behavior under load |
| `dgryski` |  | Measured performance |
| `filosottile` |  | Security posture |
| `rakyll` |  | Profiling and diagnosability |

## Repository configuration

Add `.goreview.json` at the reviewed repository root:

```json
{
  "judges": ["robpike", "filosottile", "dgryski"],
  "maxReviewRounds": 3
}
```

For read-only review, explicit judges override repository judges, which override
the shipped defaults. Fix mode ignores repository judges and uses explicit
judges or automatic three-judge selection.

Fix-mode review rounds use this precedence:

1. `--max-rounds N`
2. Repository `maxReviewRounds`
3. The shipped default of 5

The hard range is 2–10. Five review rounds permit at most four fix attempts;
the final allowed round never edits because no round would remain to verify and
re-review that edit. Read-only mode always runs one round.

## Guarded fixes

`--fix` writes files. Before each edit:

1. Every selected judge sees the combined cited deductions and returns AGREE,
   AMEND, or WITHDRAW.
2. The highest-priority selected judge chairs one coherent plan.
3. One fixer applies only that plan.
4. The fixer runs Go formatting plus scoped build, test, and vet checks.
5. Every selected judge reviews the edited tree again.

The command serializes writers with an atomic Git-local lock. If an interrupted
run leaves a stale lock, first verify no GoLegends fixer is active, then remove
the empty path printed by:

```bash
git rev-parse --git-path goreview-fix.lock
```

## Structure

The plugin has one canonical source for every review concept:

| Path | Owns |
|---|---|
| [`review.json`](plugins/goreview/review.json) | Identity, judge roster, defaults, priorities, verification, and round limits |
| [`protocol.md`](plugins/goreview/protocol.md) | Host-neutral review and fix contract |
| [`policy.md`](plugins/goreview/policy.md) | Go implementation guidance supplied only to the fixer |
| [`judges/`](plugins/goreview/judges/) | One canonical rubric file per named judge |
| [`workflow.js`](plugins/goreview/workflow.js) | Deduction engine and scorecard renderer |
| [`fixer.md`](plugins/goreview/fixer.md) | The only write-capable agent |
| [`commands/goreview.md`](plugins/goreview/commands/goreview.md) | Thin Claude adapter |
| [`skills/goreview/`](plugins/goreview/skills/goreview/) | Thin Codex adapter |

Claude's manifest links directly to the canonical judge files. Codex's skill
reads those same files. Judge rubrics are never copied between adapters, and
judge scores use only the selected rubric plus cited repository evidence. The
implementation policy is loaded only in fix mode and supplied only to the
fixer.

See [the architecture](docs/architecture.md) for ownership and data flow.

## Add a judge

1. Add one rubric under `plugins/goreview/judges/<label>.md`.
2. Add its label, display name, lens, and path to `review.json`.
3. Add the label once to `conflictPriority`.
4. Add the judge path to `.claude-plugin/plugin.json`.
5. Run the validation suite below.

Judge labels use lowercase letters, digits, and hyphens and are capped at 64
characters.

## Validate

```bash
node --test tests/*.test.cjs
node --check plugins/goreview/workflow.js
claude plugin validate --strict plugins/goreview/.claude-plugin/plugin.json
claude plugin validate --strict .claude-plugin/marketplace.json
uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/validate_plugin.py" plugins/goreview
uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" plugins/goreview/skills/goreview
git diff --check
```

## Origin

I started this while working on EventDB, Axiom's object-storage-based database.
AI helped me move quickly, but too often produced Go that compiled while
missing foundational design problems—the same problems my colleagues would
later point out in review.

I began with Rob Pike because I wanted code other people could understand. The
first result was dramatically simpler. It also exposed the limitation of one
lens: simple code could still get serialization wrong.

[The first public prompt](https://gist.github.com/seiflotfy/76fdca5cf4fcc8e67bd5899b09320a37)
put Rob Pike, Brad Fitzpatrick, and Russ Cox into one iterative review loop. I
kept using it and refining it. Later iterations separated judging from writing,
required cited evidence, bounded the fix loop, and made each judge independent.
That process became GoLegends.

## The names

The judges are homages distilled from each engineer's public writing, talks,
and open-source work. They are not affiliated with, endorsed by, or personally
participating in GoLegends reviews. If a referenced person wants their name
removed, open an issue; it will be changed without argument.

## License

[MIT](LICENSE)
