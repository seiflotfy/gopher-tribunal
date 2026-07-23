# Damian Gryski review method

Use this method for explicit performance claims or changes to a demonstrated
hot path. The judge rubric owns deductions; this file owns a bounded evidence
audit. This is not a performance-engineering campaign.

## Review sequence

1. Read the diff, its commit message or supplied scope, and the benchmarks next
   to changed symbols. Inventory explicit claims about time, throughput,
   allocations, retention, or another named resource.
2. If there is no performance claim and no demonstrated hot path, return N/A.
   Do not manufacture a campaign for ordinary code.
3. Rank the claims by user impact. Review at most the two highest-impact claims
   in one seat; do not expand into unrelated optimizations.
4. Inspect the evidence supplied by the change first: baseline and candidate
   numbers, workload shape, Go version, allocation counts, profiles, and the
   benchmark code that produced them.
5. If required evidence is absent, take the rubric's missing-measurement
   deduction. The review seat does not generate a missing benchmark campaign
   on the author's behalf.

## Command budget

The investigation has a five-minute wall-clock budget. Stop starting commands
after four minutes and use the remaining time to return the structured score.

The complete seat may run at most:

- one existing targeted correctness test; and
- two existing targeted benchmark commands.

Every benchmark command must:

- select one existing benchmark family with a narrow anchored `-bench` filter;
- use `-run=^$`, `-benchmem`, `-count` no greater than 3,
  `-benchtime` no greater than 1 second, and `-timeout` no greater than 1
  minute; and
- exercise the changed path or the benchmark whose honesty is being judged.

Do not run broad benchmark suites, multiple workload families in one command,
custom scratch benchmarks, temporary source variants, background jobs,
profilers, disassembly, or compiler experiments. Do not install tools. Those
belong in a separately requested performance campaign, not a review seat.

## Evidence to seek

For each selected claim:

1. Check that the benchmark isolates the claimed cost rather than setup, random
   generation, I/O, logging, or fixture construction.
2. Check that the workload shape is representative and reaches the changed
   branch.
3. Check that baseline and candidate use comparable binaries, environments,
   metrics, and samples.
4. Check that allocation claims include `-benchmem` evidence and that claimed
   wins exceed noise without hiding adjacent regressions.
5. Treat profiles and compiler output already supplied by the change as
   supporting evidence, never as substitutes for end-to-end numbers.

## Re-review

On later fix rounds, recheck only this judge's prior cited deductions and the
performance-relevant code changed to resolve them. Do not rescan the repository
for unrelated claims. Add a new deduction only for a performance regression
introduced by the intervening fix.

## Stop condition

Return the structured score as soon as the supplied evidence and bounded
command budget confirm or reject the selected claims. An unresolved hypothesis
is an unverified observation with zero points, not permission to keep
experimenting. A missing baseline or dishonest benchmark is already a complete
rubric finding.

Go references: [Diagnostics](https://go.dev/doc/diagnostics),
[benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat), and
[profile-guided optimization](https://go.dev/doc/pgo).
