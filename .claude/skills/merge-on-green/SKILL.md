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

Wait for everything to finish, then merge. The whole difficulty is that GitHub
will happily tell you everything has finished when it has not yet started.

## The one trap

Ask GitHub for a PR's checks a few seconds after opening it and you get a short
list — typically just the fast external integrations, deploy previews and the
like — every one of them passed. Nothing is pending. Nothing is failing.

That answer is worthless, because **checks are created over time, not all at
once.** A job gated behind `needs:` gets no check run until its dependency
succeeds. A workflow no runner has picked up yet reports nothing at all. And in
the API, a check that has not been created is indistinguishable from one that
will never exist. So "every check I can see has completed and passed" is
satisfied, trivially, in the window before the real work starts — and merging
there means merging code CI never looked at.

Everything below exists to close that window. There is no manifest to maintain
and no workflow file to parse: you just need one signal that is true *before* the
jobs exist, which is the workflow run itself.

## What green means

Two conditions, both on the **current head SHA**:

1. **Nothing is still running.** Every check run has `status: "completed"`, every
   commit status is terminal (not `pending`), **and** every Actions *workflow
   run* for that SHA has `status: "completed"`.
2. **Nothing failed.** No check run, commit status, or workflow run concluded in
   a failure state. `success`, `skipped`, and `neutral` are all fine.

The workflow-run clause is the one doing the real work. A run stays `in_progress`
for its entire duration — including while its `needs:`-gated jobs have no check
runs yet — so it is true exactly when there is more to come, which is what the
check-run list cannot tell you. Verified: on a PR whose second job had not been
created, the run reported `in_progress` throughout.

The rest of the list is deliberately broad. Checking *every* check and status,
rather than a list of ones you expect, is what makes this portable: external
services (deploy previews, coverage bots, preview-comment bots) never appear in
`.github/workflows/` and cannot be enumerated from the repo, but they do show up
here for free.

Anchoring to the head SHA matters just as much: a green run for code you have
since replaced says nothing about what you are about to merge.

## The loop

### 1. Anchor to the head SHA

```
mcp__github__pull_request_read({method: "get", owner, repo, pullNumber})
```

Record `head.sha`; confirm `state: "open"` and `draft: false`. If that SHA ever
changes, the evidence is void and the clock restarts (step 5).

### 2. Wait before looking

Looking early cannot teach you anything, so spend the time asleep rather than
polling. Estimate the pipeline's duration from the repo's own history —
`get_check_runs` on a recently merged PR reports `started_at` and `completed_at`
per job — and default to **3 minutes, then every 2** when there is nothing to
measure. Expect longer for suites with browser or container steps.

Wait with a **background** `sleep`, then end the turn:

```
Bash({command: "sleep 180", run_in_background: true, description: "wait before first CI check"})
```

The session is re-invoked when it exits, so a wait costs one tool call and no
context. For waits beyond ~10 minutes, or where the container may be recycled,
`mcp__Claude_Code_Remote__send_later({delay_minutes: N, message: "..."})` survives
restarts, at one-minute granularity.

Two non-options: foreground `sleep` is blocked in some harnesses, and firing
tool calls back-to-back to pass time burns context while revealing nothing. A
`Monitor` poll loop that exits on a terminal state is a good fit *if* the shell
can reach the GitHub API — worth one call to check, since sandboxed environments
often proxy or block `api.github.com` and ship no `gh` CLI, leaving the MCP tools
as the only route.

A PR-activity subscription, where available, is a fine way to hear about failures
sooner — but never a replacement for the loop. Success events and pushes are
documented to arrive late or not at all, so silence from it is not evidence.

### 3. Poll both check surfaces

```
mcp__github__pull_request_read({method: "get_check_runs", owner, repo, pullNumber})
mcp__github__pull_request_read({method: "get_status",     owner, repo, pullNumber})
```

Both, every cycle. Actions jobs arrive as *check runs*; many external services
post *commit statuses* instead, so one surface alone is half the evidence — a
combined status of `success` is perfectly normal while every Actions job is still
running. Confirm the SHA on the status response still matches step 1's.

Anything not `completed`, or any pending status → wait and repeat.

### 4. Before merging, confirm the pipeline is actually over

Only when step 3 looks entirely done, spend one more call to rule out jobs that
do not exist yet:

```
mcp__github__actions_list({
  method: "list_workflow_runs", owner, repo,
  workflow_runs_filter: {branch: "<head branch>"}
})
```

Keep the runs whose `head_sha` equals yours and read only `status` and
`conclusion` — these objects are very large, so ignore the rest. Every one must
be `completed`. Any `queued` or `in_progress` run means more checks are coming,
however finished the check-run list looked.

Doing this once at the end rather than every cycle keeps the cost to a single
call per PR.

Two sanity cases worth handling explicitly:

- **No checks and no workflow runs at all.** Either CI is not configured for
  pull requests, or you looked too early. Wait one more interval; if it is still
  empty, say so rather than polling forever — there may genuinely be nothing to
  wait for.
- **A run appears after you thought you were done** (some workflows are triggered
  by another completing). It will be `queued`; go back to waiting.

### 5. Decide

| What you observe | What it means | Do |
|---|---|---|
| All check runs completed, all statuses terminal, all workflow runs completed, nothing failed | Genuinely green | Merge (step 6) |
| A workflow run is `queued` or `in_progress` | More jobs are coming, whatever the check list shows | Keep waiting |
| A check run is `queued` or `in_progress`, or a status is `pending` | Still running | Keep waiting |
| Anything concluded `failure` or `timed_out` | Real failure | Diagnose and fix (step 5) |
| Anything concluded `cancelled` | The run was killed; there is no verdict | Push a fix or re-run — never read it as a pass |
| `mergeable_state: "dirty"` | Conflicts with the base branch | Do not merge. Rebase, resolve, push — then restart at step 1 |
| `mergeable_state: "unknown"` | GitHub is still computing it | Re-read next cycle; not a blocker by itself |
| Nothing has completed well past the expected duration | Runner backlog or a stuck workflow | Stop and report the names and states rather than waiting silently |

`skipped` is a pass — conditional jobs and unconfigured integrations skip
routinely. `cancelled` is the one that reads like a pass and is not.

A failure on a check that is not gating (a deploy preview, say) still deserves a
look before you merge; it is a real signal even when nothing enforces it.

### 6. On failure, fix the cause

```
mcp__github__get_job_logs({owner, repo, run_id, failed_only: true, return_content: true, tail_lines: 200})
```

`run_id` is in the failing check's `html_url` (`.../actions/runs/<run_id>/job/<job_id>`).

Fix the underlying problem, reproducing locally where you can. Never reach green
by weakening an assertion, skipping a test, or re-running a job until it passes —
a flake you re-ran away is a bug you shipped, and where the suite is the only
review, nothing else will catch it.

After pushing, **the clock and the evidence reset**: back to step 1 with the new
head SHA, and wait out the pipeline again.

### 7. Merge

Confirm the PR is still open and the SHA you validated is still `head.sha`, then
merge with the method the repo's conventions call for — squash where each PR
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

- **Do not merge on "everything I can see has passed."** That is the trap this
  whole skill exists to close. Confirm no workflow run is still going first.
- **Do not treat the combined status alone as green.** It may carry only a deploy
  provider's entry and say `success` while the tests are mid-flight.
- **Do not use auto-merge as a shortcut.** GitHub's auto-merge waits only for
  checks that branch protection marks *required*; with none configured it merges
  as soon as it can, which is this same bug with fewer chances to notice. It is a
  sound tool once required checks are configured — verify that first.
- **Do not stop watching a PR you opened.** An unmerged PR left behind is an
  unfinished task, and no one else is coming to finish it.
