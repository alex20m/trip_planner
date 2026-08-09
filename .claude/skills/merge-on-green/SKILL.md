---
name: merge-on-green
description: >-
  Watch an open pull request's CI through to completion and merge it the moment
  it is genuinely green. Use this whenever a task's changes still need to land on
  the default branch — right after pushing a branch or opening a PR/MR, and any
  time the request involves waiting for CI, checking the pipeline, "is the build
  done", "merge it when it's green", or babysitting/monitoring a PR. Use it even
  for what sounds like a one-off status check, because *how* you read the status
  is exactly what goes wrong. Defines what "green" actually means, how to wait
  without burning context, and how to merge and confirm it landed.
---

# Merge on green

Take an open PR from *pushed* to *merged*, without ever merging code that CI has
not actually vetted.

## Why this needs a procedure

The obvious approach — ask GitHub for the checks, see nothing failing, merge — is
wrong, and it fails silently in the direction of merging unverified code. Two
properties of GitHub cause it:

**The set of checks grows over time.** A job gated behind `needs:` gets no check
run until its dependency succeeds. A workflow that no runner has picked up yet
reports nothing at all. In the API, a check that has not been created is
indistinguishable from one that will never exist — so early in a PR's life the
response often contains only the fast third-party integrations (deploy previews,
preview-comment bots), all passing. "Nothing is failing" is then true and means
nothing.

**Different systems report through different APIs.** GitHub Actions jobs arrive
as *check runs*; many external services post *commit statuses* instead. Read one
surface and you get a confident answer built on half the evidence — a combined
status of `success` is perfectly normal while every Actions job is still running.

The dangerous window is only a few minutes wide, which is exactly what makes it
bite: it is the window a session lands in when it opens a PR and immediately
checks on it.

## What green means

> Every **required** check exists on the **current head SHA**, every one has
> `status: "completed"`, and every one concluded `success` (or `skipped` /
> `neutral`) — and no other check on that SHA concluded in a failure state.

All three clauses carry weight. Drop *exists* and you merge before the slow jobs
were ever created. Drop *current head SHA* and you merge on the strength of a run
for code you have since replaced.

### Establish the required set before you start waiting

Derive it, rather than accepting whatever the API happens to return: read
`.github/workflows/*.yml` and take the `name:` of every job triggered by
`pull_request`, falling back to the job key where a job has no `name:`. That list
is your manifest. Matrix jobs expand to one check run per combination, named
`Job name (value)`.

Anything else appearing on the PR — deploy previews, preview-comment bots,
coverage reporters — is **not** required. Never wait on one and never read its
success as evidence about the code. A *failure* on one is still worth looking at
before merging, since it is a real signal even when it is not gating.

If no workflow triggers on `pull_request` at all, there is nothing to wait for.
Say so and merge or hand back, rather than polling for checks that will never
appear.

## The loop

### 1. Anchor to the head SHA

```
mcp__github__pull_request_read({method: "get", owner, repo, pullNumber})
```

Record `head.sha`; confirm `state: "open"` and `draft: false`. Every later
observation is about *this* SHA. If it changes, the evidence is void and the
clock restarts (step 5).

### 2. Wait before you look

Estimate how long the pipeline takes before the first check, because looking
sooner cannot teach you anything. The cheapest estimate is the repo's own
history: `get_check_runs` on a recently merged PR reports `started_at` and
`completed_at` per job, which shows both the total duration and how late the
`needs:`-gated jobs appeared. Absent that, **first check at 3 minutes, then every
2**, and expect longer for suites with browser or container steps.

To wait, run `sleep` as a **background** Bash command and end the turn:

```
Bash({command: "sleep 180", run_in_background: true, description: "wait before first CI check"})
```

The session is re-invoked when it exits, so a wait costs one tool call and no
context. For waits beyond ~10 minutes, or where the container may be recycled,
`mcp__Claude_Code_Remote__send_later({delay_minutes: N, message: "..."})` survives
restarts at one-minute granularity.

Two ways of waiting that do not work: foreground `sleep` is blocked in some
harnesses, and back-to-back tool calls to pass time burn context while revealing
nothing. A `Monitor` poll loop that exits on a terminal state is a good fit *if*
the shell can actually reach the GitHub API — verify with one call rather than
assuming, because sandboxed environments frequently proxy or block
`api.github.com` and ship no `gh` CLI, leaving the MCP tools as the only route.

If a PR-activity subscription is available, use it alongside the loop to hear
about failures sooner — but never in place of the loop. Success events and pushes
are documented to arrive late or not at all, so silence from it is not evidence.

### 3. Read both surfaces

```
mcp__github__pull_request_read({method: "get_check_runs", owner, repo, pullNumber})
mcp__github__pull_request_read({method: "get_status",     owner, repo, pullNumber})
```

Both, every cycle — check runs for the Actions jobs, combined status for
everything reporting the older way. Confirm the SHA on the status response still
matches step 1's.

### 4. Decide

Walk the manifest and classify. Only the first row is a merge.

| What you observe | What it means | Do |
|---|---|---|
| Every required check present, `completed`, `success`/`skipped`/`neutral`; nothing else failed | Genuinely green | Merge (step 6) |
| A required check is **absent** | Not created yet — a `needs:` dependency is still running, or no runner has picked it up | Keep waiting |
| A required check is `queued` or `in_progress` | Still running | Keep waiting |
| A required check concluded `failure` or `timed_out` | Real failure | Diagnose and fix (step 5) |
| A required check concluded `cancelled` | The run was killed; there is no verdict | Push a fix or re-run the workflow — never read it as a pass |
| A non-required check concluded `failure` | Something outside the gate broke | Look before merging; usually worth fixing, and say so if you merge anyway |
| `mergeable_state: "dirty"` | Conflicts with the base branch | Do not merge. Rebase, resolve, push — then restart at step 1 |
| `mergeable_state: "unknown"` | GitHub is still computing it | Re-read next cycle; not a blocker by itself |
| Nothing has completed well past the expected duration | Runner backlog or a stuck workflow | Stop and report the check names and states, rather than waiting silently |

`skipped` is a pass — conditional jobs and unconfigured integrations routinely
skip. `cancelled` is the one that reads like a pass and is not.

### 5. On failure, fix the cause

```
mcp__github__get_job_logs({owner, repo, run_id, failed_only: true, return_content: true, tail_lines: 200})
```

`run_id` is in the failing check's `html_url` (`.../actions/runs/<run_id>/job/<job_id>`).

Fix the underlying problem, reproducing locally first where you can. Never reach
green by weakening an assertion, skipping a test, or re-running a job until it
passes — a flake you re-ran away is a bug you shipped, and on a repo where the
suite is the only review, nothing else will catch it.

After pushing, **the clock and the evidence reset**: return to step 1, read the
new head SHA, and wait out the pipeline again. Checks from the old SHA say
nothing about the new one.

### 6. Merge

Confirm the PR is still open and that the SHA you validated is still `head.sha`,
then merge with the method the repo's conventions call for — squash where each PR
should collapse to a single commit on the default branch:

```
mcp__github__merge_pull_request({
  owner, repo, pullNumber,
  merge_method: "squash",
  commit_title: "<PR title> (#<number>)",
  commit_message: "<one-line summary>"
})
```

Supplying `commit_title` and `commit_message` keeps history readable; the default
squash body is the concatenation of every "fix lint" commit on the branch.

Verify rather than assume: re-read the PR and confirm `merged_at` is set. A 405
means GitHub refused — re-read `mergeable_state` for the reason instead of
retrying. Note that `list_pull_requests` reports `merged: false` even for merged
PRs, so trust `merged_at` from `pull_request_read`.

Report the outcome plainly: merged, or what is blocking it.

## Do not

- **Do not treat the combined status alone as a green signal.** It may carry only
  a deploy provider's entry and say `success` while the tests are mid-flight.
- **Do not merge because everything currently visible is passing.** That is the
  central bug this skill exists to prevent. Check against the manifest.
- **Do not use auto-merge as a shortcut.** GitHub's auto-merge waits only for
  checks that branch protection marks *required*; with none configured it merges
  as soon as it can, which is this same bug with fewer chances to notice. It is a
  sound tool only once required checks are configured — verify that first.
- **Do not stop watching a PR you opened.** An unmerged PR left behind is an
  unfinished task, and no one else is coming to finish it.
