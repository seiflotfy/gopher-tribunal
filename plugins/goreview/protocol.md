# GoLegends protocol

This is the host-neutral contract for the Claude command, the Codex skill, and
the workflow engine. Host adapters may add parsing and rendering mechanics;
they must not redefine these rules.

## Configuration

Load `review.json` from the plugin root. It owns plugin identity, the language,
judge metadata, default selection, conflict priority, fixer identity,
verification, and review-round limits. Every referenced path is relative to the
plugin root. Each judge record links one canonical rubric with one canonical
methodology; paths are unique and are never copied into host adapters.

A repository may add `.goreview.json`:

```json
{
  "judges": ["rsc", "bradfitz", "robpike"],
  "maxReviewRounds": 3
}
```

Reject unknown fields, judges, duplicate judges, malformed linked files, and
mismatched agent names. Judge precedence in read-only mode is: explicit command
judges, repository configuration, then `defaultJudges`. Fix mode ignores
repository-configured judges and uses explicit judges or automatic selection.
Review-round precedence in fix mode is: explicit `--max-rounds`, repository
configuration, then `defaultMaxReviewRounds`.

Read-only mode always runs one review round. Fix mode accepts an integer from 2
through `maxAllowedReviewRounds`. The last allowed round never edits because no
round would remain to verify and re-review that edit. Five review rounds
therefore permit at most four fix attempts.

## Review

1. Resolve a non-empty set of installed judges within the engine's seat cap.
2. Load each selected judge's canonical rubric and linked methodology. The
   methodology orders the investigation but cannot create or change a
   deduction. Do not give judges `policy.md`, repository house style, or fixer
   instructions.
3. Run judges independently and in parallel over the same scope. A judge may
   deduct only under its own rubric and cited repository evidence.
4. Every cited deduction contains points, file plus symbol, an explanation, and
   a concrete change. Unverified observations carry zero points and never lower
   the score.
5. Each applicable judge starts at 10, subtracts cited points with a floor of
   zero, and reports that score. The engine repeats the arithmetic and rejects a
   mismatched score as `JUDGES_UNAVAILABLE`; it assigns PASS at 8 or higher. A
   valid N/A reports a null score. A seat that crosses its initial deadline gets
   one grace window on the same in-flight agent before it is unavailable.
6. Every judge JSON object and serialized per-judge result begins with `score`,
   followed immediately by `deductions`. The engine adds the verdict after
   validating both. Each deduction cites one file and one symbol. Summaries are
   at most 160 characters; deduction explanations and proposed changes are at
   most 200 characters, and top fixes are at most 280 characters after
   normalization. If a judge joins multiple locations, rendering keeps the
   first complete file-and-symbol location instead of emitting a broken `;…`.
7. A missing or malformed judge result fails closed as `JUDGES_UNAVAILABLE`.
8. A rendered scorecard contains one score-and-verdict line, at most four cited
   deductions, a count of any remaining cited deductions, and one top fix for a
   failure. It omits per-deduction change text and unverified observations;
   those remain available in the structured result.
9. Read-only mode reports rendered scorecards and never edits files.

## Fix

1. Warn that `--fix` writes files and ask the user not to edit the scope during
   the run.
2. Serialize writers with an atomic directory at the path returned by
   `git rev-parse --git-path goreview-fix.lock`. Never remove a lock the
   current run did not acquire.
3. Before each edit, give every selected judge the combined cited deductions.
   Each returns AGREE, AMEND, or WITHDRAW.
4. The highest-priority selected judge chairs one coherent plan. Every planned
   change names its file and symbol, the exact behavior to change, the behavior
   that must not change, and the cited deduction it resolves. Resolve only
   irreconcilable requests using `conflictPriority` from `review.json`. Stop
   before editing when the plan still requires the fixer to make a design
   decision.
5. Load `policy.md` once and give it only to the one write-capable fixer as
   implementation guidance. It may shape how the chaired plan is implemented;
   it may not add findings or widen the plan. Apply only that plan and run the
   scoped verification declared by `review.json`.
6. A failed fixer or verification is terminal and leaves the tree potentially
   partial. Otherwise re-run every selected judge.
7. Stop fail-closed on unavailable judges, insufficient budget, rising
   deductions, the configured round limit, or an unrecognized result.

## Result

Every result identifies `plugin`, `language`, `selectedJudges`, `selection`,
`reviewRounds`, `fixAttempts`, `maxReviewRounds`, and one terminal verdict. Fix
mode also identifies fixer-policy provenance. Only `ACCEPTED` is a pass. All
other verdicts must be reported without being reinterpreted as acceptance.
Host adapters print each scorecard once, one overall verdict, and one compact
run line. They do not add a narrative postmortem or dump the raw result unless
the user asks for details.

The named judges are homages based on public work. They are not the people
themselves and do not imply affiliation, participation, or endorsement.
