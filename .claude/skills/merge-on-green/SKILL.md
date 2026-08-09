---
name: merge-on-green
description: >-
  Watch an open pull request's CI through to completion and squash-merge it the
  moment it is genuinely green. Use this whenever a task's changes still need to
  land on main — right after pushing a branch or opening a PR/MR, and any time
  the request involves waiting for CI, checking the pipeline, "is the build
  done", "merge it when it's green", or babysitting/monitoring a PR. Use it even
  for what sounds like a one-off status check, because *how* you read the status
  is exactly what goes wrong. Defines what "green" actually means on this repo,
  how to wait without burning context, and the exact merge call.
---

# Merge on green

Your job is to get an open PR from "pushed" to "merged", without ever merging
something CI has not actually vetted.

This sounds trivial and is not. The naive version — "ask GitHub for the checks,
they all look fine, merge" — is wrong on this repo in a way that produces a
green-looking merge of unverified code, and it has already happened here.

## The failure this prevents

`trip_planner` PR #126 was opened at 12:53:02 and merged at 12:53:49. Forty-seven
seconds. Here is what the checks on its head commit actually did:

| Check | Started | Finished |
|---|---|---|
| Vercel Preview Comments | 12:53:40 | 12:53:40 |
| Supabase Preview | 12:53:42 | 12:53:42 (skipped) |
| Lint · Typecheck · Unit tests | 12:53:08 | **12:55:05** |
| E2E (Playwright) | **12:55:07** | 13:00:00 |

At the moment of the merge, the unit-test job was still running and the E2E job
**did not exist yet** — its check run is only created after `quality` succeeds,
because of `needs: quality`. The session asked GitHub for the state of the world,
got back two instantaneous third-party checks that both looked fine, concluded
"green", and merged. CI had verified nothing.

Two properties of GitHub cause this, and every rule below follows from them:

1. **The set of checks grows over time.** A check that has not been created yet
   is indistinguishable, in the API response, from a check that does not exist.
   So "everything I can see has passed" is not a safe stopping condition — you
   have to know what you are waiting *for*.
2. **Different CI systems report through different APIs.** GitHub Actions jobs
   arrive as *check runs*; Vercel's deployment arrives as a *commit status*.
   Reading one and not the other gives a confident, wrong answer. On PR #165 the
   combined status endpoint returned `state: "success"` with exactly one entry
   (Vercel) while both Actions jobs were still running.

## What "green" means here

Green is not "nothing is failing". Green is:

> Every **required** check exists on the **current head SHA**, every one has
> `status: "completed"`, and every one concluded `success` (or `skipped` /
> `neutral`) — and no other check on that SHA concluded in a failure state.

All three clauses matter. Drop "exists" and you get PR #126. Drop "current head
SHA" and you merge on the strength of a CI run for code you have since replaced.

### Deriving the required set

Do this once, at the start, rather than guessing: read `.github/workflows/*.yml`
and take the `name:` of every job triggered by `pull_request` (fall back to the
job key if a job has no `name:`). That list is your manifest. Matrix jobs expand
to one check run per combination, named `Job name (value)`.

For both `application_tracker` and `trip_planner` today the manifest is:

- `Lint · Typecheck · Unit tests`
- `E2E (Playwright)`

Everything else you will see on a PR here — `Vercel Preview Comments`,
`Supabase Preview` (usually `skipped`), and the `Vercel` commit status — is a
third-party integration. Those are **not** required: never wait on them and
never treat their success as evidence of anything. They still count against you
if one concludes `failure`, since that is a real signal worth looking at before
merging.

Re-derive the manifest rather than trusting this list if the workflow files have
changed — the list is a snapshot, the workflow is the truth.

## The loop

### 1. Anchor to the head SHA

```
mcp__github__pull_request_read({method: "get", owner, repo, pullNumber})
```

Record `head.sha`. Confirm `state: "open"` and `draft: false`. Every later
observation is about *this* SHA; if it changes, your evidence is void and the
clock restarts (see step 5).

### 2. Wait before you look

Nothing useful exists in the first few minutes. On these two repos `quality`
takes 1–2 minutes, E2E's check run is not created until `quality` succeeds, and
E2E itself runs 5 minutes. The earliest a PR here has ever been truly green is
about **5.5 minutes** after opening.

So: **first check at 5 minutes, then every 2 minutes.** Checking sooner cannot
teach you anything and is precisely where the early-merge bug lives.

To wait, run `sleep` as a **background** Bash command and end your turn:

```
Bash({command: "sleep 300", run_in_background: true, description: "wait before first CI check"})
```

The session is re-invoked when it exits, so the wait costs one tool call and no
context. Use `mcp__Claude_Code_Remote__send_later({delay_minutes: N, message: "..."})`
instead for waits beyond ~10 minutes or when the container may be recycled —
it survives restarts, at one-minute granularity.

Do not wait any other way. Foreground `sleep` is blocked by the harness.
Back-to-back tool calls to pass time burn context and reveal nothing. A `Monitor`
poll loop cannot work here: there is no `gh` CLI, and the proxy returns 403 for
`api.github.com` repo endpoints even with the token, so a shell cannot reach the
GitHub API. The `mcp__github__*` tools are the only route.

Optionally call `subscribe_pr_activity` alongside the loop — it pushes CI
failures and review comments into the session promptly. Treat it as a way to
hear about failures *sooner*, never as a substitute for the poll: success events
and pushes are documented to arrive late or not at all, so silence from it is
not evidence of anything.

### 3. Read both surfaces

```
mcp__github__pull_request_read({method: "get_check_runs", owner, repo, pullNumber})
mcp__github__pull_request_read({method: "get_status",     owner, repo, pullNumber})
```

Both, every time — check runs for the Actions jobs, combined status for Vercel.
Verify the SHA on the status response still matches step 1's.

### 4. Decide

Walk the manifest and classify. Only the first row is a merge.

| What you observe | What it means | Do |
|---|---|---|
| Every required check present, `completed`, and `success`/`skipped`/`neutral`; nothing else failed | Genuinely green | Merge (step 6) |
| A required check is **absent** | Not created yet — a `needs:` dependency is still running | Keep waiting |
| A required check is `queued` or `in_progress` | Still running | Keep waiting |
| A required check concluded `failure` or `timed_out` | Real failure | Diagnose and fix (step 5) |
| A required check concluded `cancelled` | Run was killed; no verdict | Push a fix or re-run the workflow — never read it as a pass |
| A non-required check concluded `failure` | Preview deploy broke | Look before merging; usually worth fixing, and say so if you merge anyway |
| `mergeable_state: "dirty"` | Conflicts with main | Do not merge. Rebase onto `origin/main`, resolve, push — then restart at step 1 |
| `mergeable_state: "unknown"` | GitHub is still computing it | Re-read once next cycle; it is not a blocker by itself |
| Still incomplete after ~25 minutes | Runner backlog or a stuck workflow | Stop and tell the user, with the check names and their states |

`skipped` is a pass, not a gap — `Supabase Preview` is skipped on essentially
every PR here. `cancelled` is the one that reads like a pass and is not.

### 5. On failure, fix the cause

Pull the logs directly rather than opening the web UI:

```
mcp__github__get_job_logs({owner, repo, run_id, failed_only: true, return_content: true, tail_lines: 200})
```

`run_id` is in the failing check's `html_url` (`.../actions/runs/<run_id>/job/<job_id>`).

Fix the underlying problem in the branch, reproducing locally first where you
can. Never reach green by weakening an assertion, skipping a test, or re-running
a job until it passes — the repo's CLAUDE.md is explicit that the suite is the
only review these PRs get, and a flake you re-ran away is a bug you shipped.

After pushing, **the clock and the evidence reset**: go back to step 1, read the
new head SHA, and wait 5 minutes again. Checks from the old SHA say nothing about
the new one.

### 6. Merge

Confirm one last time that the PR is still open and that the SHA you validated is
still `head.sha` — then squash, per the repo's merge policy:

```
mcp__github__merge_pull_request({
  owner, repo, pullNumber,
  merge_method: "squash",
  commit_title: "<PR title> (#<number>)",
  commit_message: "<one-line summary>"
})
```

Passing `commit_title` and `commit_message` keeps main's history clean; the
default squash body is the concatenation of every "fix lint" commit on the
branch.

Then verify rather than assume: re-read the PR and confirm `merged_at` is set.
A 405 means GitHub refused the merge — re-read `mergeable_state` for the reason
instead of retrying. Note that `list_pull_requests` reports `merged: false` even
for merged PRs; trust `merged_at` from `pull_request_read`.

Report the outcome plainly: merged, or what is blocking it.

## Do not

- **Do not use `get_status` alone as a green signal.** It sees only Vercel here
  and will say `success` while the tests are mid-flight.
- **Do not merge because everything visible is passing.** That is the PR #126
  bug verbatim. Check the manifest.
- **Do not use `enable_pr_auto_merge` as a shortcut.** It only waits for checks
  that branch protection marks *required*; with none configured it merges as
  soon as it can, which is this same bug with fewer opportunities to notice. It
  is a reasonable tool only once the repo has required checks configured —
  verify that first.
- **Do not stop watching a PR you opened.** An unmerged PR left behind is an
  unfinished task, and no one else is coming to finish it.
