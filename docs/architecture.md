# Architecture

GoLegends is one Go review plugin named `goreview`. Claude Code dispatches the
Workflow engine; Codex implements the same protocol through its native agent
orchestration. Named identities are stable for users, while lens IDs, rule IDs,
severity, and provenance are stable machine concepts.

## Ownership

- `review.json`: schema, named roster, lens IDs, applicability, authorized
  rules, severity and remediation, public sources, pass and conflict policy,
  neutral support agents, verification, and round limits.
- `protocol.md`: host-neutral snapshot, review, fix, verification, and result
  contract.
- `judges/<label>.md`: one named judge's voice, applicability, ownership
  boundary, evidence bar, and explanation of its configured rules.
- `methods/<label>.md`: one investigation order with no authority to create
  rules.
- `chair.md`: neutral reconciliation without a judge lens.
- `fixer.md`: the only source-editing seat.
- `verifier.md`: independent exact-command and changed-file verification.
- `policy.md`: implementation guidance supplied only to the fixer.
- `scripts/github_judge.py`: bounded public identity discovery and deterministic
  four-file guest validation.
- `workflow.js`: configuration, snapshot, rule, citation, arithmetic, coverage,
  progress, and result validation.
- `commands/` and `skills/`: host adapters.

## Review data flow

```text
scope + HEAD + exact diff + changed-file contents + config/model hashes
                               │
                               ▼
                    immutable review snapshot
                               │
                               ▼
       named rubric + stable lens ID + rule catalog + method
                               │
                               ▼
              independent structured findings in parallel
                               │
                               ▼
 rule authorization ─ severity check ─ primary excerpt check ─ score
                               │
                               ▼
             applicability coverage ─ verdict ─ scorecard
```

A primary citation contains path, symbol, inclusive lines, and exact excerpt.
The engine matches it against the captured changed-file content. Supporting
locations permit contract, duplicate-mechanism, and concurrency evidence to
span files; an uncaptured supporting location remains marked `reported`.

Named judge agents have only read/search tools. They cannot invoke Bash or
write tools. The adapter recomputes the final diff hash before rendering so a
scorecard cannot silently describe a different tree.

The pass policy uses both score and severity. An authorized major or blocker
fails even when arithmetic alone would meet the score threshold. N/A contributes
no coverage; too few applicable judges returns `INSUFFICIENT_COVERAGE`.

## Fix data flow

```text
failing rule-authorized findings
              │
              ▼
 partition code fixes from external evidence
         │                    │
         │                    └──────► EVIDENCE_REQUIRED
         ▼
 neutral chair synthesizes compact findings
              │
              ├──── conflict only ───► consult ≤3 finding owners
              │
              ▼
       chair produces one plan
              │
              ▼
 one fixer edits under fixer policy
              │
              ▼
independent verifier checks scope + commands
              │
              ▼
     capture next immutable snapshot
              │
              ▼
      every named judge re-reviews
```

The fixer never verifies itself. The verifier records exact commands and exit
codes for scope, `gofmt -d`, scoped build, test, and vet checks, rejects
out-of-scope files, and captures the snapshot used by the next round.

Rules can classify remediation as `code` or `external-evidence`. An
evidence-only failure bypasses deliberation and editing, returning
`EVIDENCE_REQUIRED` with the bounded measurement requests. Mixed failures send
only code-remediation findings through the writer; re-review can then hand the
remaining evidence back to the author.

Round progress tracks stable finding fingerprints and severity weight, not raw
finding count. A repeated finding set stops as `OSCILLATION`; rising risk stops
as `SCOPE_EXPLOSION`. The final configured review round never edits.

## Guest judges

Guest discovery is separate from review. GitHub metadata establishes a bounded
identity snapshot but is not treated as proof of a person's private review
philosophy. The user supplies and approves the intended narrow basis. A guest
directory contains exactly `profile.json`, `judge.md`, `rules.json`, and
`method.md` and is revalidated before each explicit use.
