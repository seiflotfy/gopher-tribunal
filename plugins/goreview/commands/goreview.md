---
description: "Run GoLegends' named or approved repo-pinned Go judges over an immutable snapshot. Read-only by default; --fix uses a neutral chair, one fixer, independent verification, and re-review."
argument-hint: "[list] [--fix] [--max-rounds N] [judge|@github...] [-- <scope path or pr N>]"
---

Arguments: `$ARGUMENTS`

Read `${CLAUDE_PLUGIN_ROOT}/protocol.md` completely before acting. It is the
host-neutral contract. This command supplies Claude-specific parsing, snapshot
capture, workflow dispatch, locking, and rendering.

## Load and validate

Read `${CLAUDE_PLUGIN_ROOT}/review.json` as JSON. Require schema version 2 and
validate its identity, named judge labels, unique stable lens IDs, linked judge
and method files, authorized rule IDs, severities and remediation, public sources, pass
policy, neutral `chair`, `verifier`, `fixer`, verification checks, and round
limits. The Claude manifest must list exactly every named judge plus guest,
chair, verifier, and fixer.

Load optional `.goreview.json` from the reviewed repository root. It may contain
only `judges` and `maxReviewRounds`. Reject unknown fields, duplicate or
unresolved judges, and invalid rounds.

## Parse

Split on the first literal `--`; everything after it is review scope. Before
it:

- `list` is metadata-only and cannot be combined.
- `--fix` enables writes.
- `--max-rounds N` requires `--fix` and the configured integer range.
- Remaining tokens are named judge labels or explicit `@github-handle`
  references. Strip only the exact `goreview:` namespace.

Judge precedence is identical in read-only and fix mode: explicit labels,
repository `judges`, then shipped defaults in read-only or automatic selection
in fix mode. Repository policy must not disappear merely because fixes were
requested.

For each guest, validate:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/github_judge.py" validate \
  "<repo-root>/.goreview/judges/<lowercase-handle>"
```

The returned object—including its approved rules—is the only guest record
passed to the workflow. Never fetch, create, refresh, or repair a guest during
review.

## Capture immutable input

For every non-list run, resolve the exact Git diff represented by scope. Use
`git diff --no-ext-diff --binary` plus staged diff for the default working-tree
scope; use the corresponding explicit path, branch, or PR range otherwise.
Before spawning any judge, capture:

- `git rev-parse HEAD`;
- the exact diff and its SHA-256;
- a UTC timestamp; and
- every changed repository-relative path plus its complete current content.

Reject symlinks outside the repository, path traversal, duplicate paths,
missing changed files, and protocol size-limit violations. Deleted files are
represented by their pre-change content when available. Compute SHA-256 for
`review.json` and `protocol.md`. Pass:

```text
snapshot: { head, diffHash, capturedAt, diff, files: [{path, content}] }
provenance: { host: "claude-code", model, reviewHash, protocolHash }
```

Read every selected named method through `review.json`. In automatic fix
selection, load all named methods. Named judge agents already contain their
rubrics; the workflow supplies their canonical rule catalog. Judge and guest
seats have only Read, Grep, and Glob—never Bash, Edit, or Write.

## Dispatch

For `list`, call the workflow with `inspect: true`, parsed review config, and
validated guests. Do not capture a snapshot or load methods.

For read-only review, pass `apply: false`, selected judges, methods, guests,
scope, snapshot, and provenance.

For fix mode:

1. Warn that files will change and ask the user not to edit the scope.
2. Acquire the atomic directory returned by
   `git rev-parse --git-path goreview-fix.lock`; never remove an existing lock.
3. Load `policy.md` and its numeric Version provenance.
4. Call the workflow with `apply: true`, `lockHeld: true`, policy and source,
   resolved rounds, selected judges, methods, guests, snapshot, and provenance.
5. Await the one fixer and independent verifier. The neutral chair is the only
   planner; named judges never chair.
6. Release only the lock acquired by this run.

When every blocking finding has `external-evidence` remediation, the workflow
returns `EVIDENCE_REQUIRED` before deliberation. Print each structured evidence
request once; do not invoke or simulate the fixer. When code and evidence
findings coexist, only code findings enter the edit plan.

After any workflow result, recompute the current diff SHA-256. Compare it with
the result's final `snapshot.diffHash`. A mismatch not produced and captured by
the verified fix cycle returns `SNAPSHOT_CHANGED`; do not print stale
scorecards as current.

## Render

Print each `scores[].scorecard` once, then exactly one verdict and one compact
run line containing selection, rationale, judge labels, applicable count,
rounds, fix attempts, snapshot hash prefix, model, and config hash prefix.
When deliberation occurred, print its neutral chair, targeted consultation
count, and disagreement count.
When verification occurred, print the required check IDs and whether all
passed. In fix mode print fixer-policy provenance.

Print `ACCEPTED` only for that exact verdict. Handle
`INSUFFICIENT_COVERAGE`, `REVIEW_ONLY`, `EVIDENCE_REQUIRED`, `JUDGES_UNAVAILABLE`,
`BUDGET_EXHAUSTED`, `FIX_FAILED`, `OSCILLATION`, `SCOPE_EXPLOSION`, `STALL`,
`SNAPSHOT_CHANGED`, and `INVALID_REQUEST` according to the protocol. Unknown
verdicts print `UNKNOWN` and stop.

Do not repeat findings, narrate a postmortem, recommend rerunning or reverting,
or dump raw JSON unless requested. Never claim that a named judge personally
participated in or endorsed the review.
