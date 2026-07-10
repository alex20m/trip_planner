# Claude Workflow Rules

## Core Principle

All work must be isolated, reproducible, and branch-based:

- Do not commit directly to `main`.
- Do all work in a dedicated branch/worktree.
- Keep changes scoped to one task — do not bundle unrelated fixes into the same branch.

Do not stop after planning. Start implementing immediately and only ask if blocked.

---

## PR & Merge Policy (default: auto)

This is a standing, advance authorization for the harness's normal
"confirm before PR / confirm before merge" behavior. It applies unless the
user says otherwise for that specific task:

- Always open an MR/PR when a task's changes are pushed — do not wait to be
  asked.
- Once CI/the pipeline goes green on that MR, merge it automatically.
  Getting CI green **is** sufficient authorization to merge — do not stop
  and ask first.
- Branch deletion after merge is handled automatically by GitHub
  ("Automatically delete head branches" is enabled in repo Settings →
  General). Claude does not have a tool to delete remote branches anyway —
  do not attempt to delete the branch manually after merging; GitHub takes
  care of it.
- Do not auto-merge if the MR has merge conflicts with `main` (not
  mergeable), even if CI is green. Rebase onto `origin/main` and resolve
  the conflicts in the same branch, then re-check CI before merging. If
  conflict resolution is non-trivial or changes intent, ask before
  proceeding instead of guessing.
- This default can be suspended per-task by an explicit instruction (e.g.
  "don't merge this one", "wait for review first"). Absent that, always
  auto-PR and auto-merge on green.
- This policy covers PR creation and merging only. It does not extend to
  other destructive/hard-to-reverse actions (force-push, history rewrites,
  deleting branches other than the task's own worktree branch, etc.) —
  those still follow normal confirm-first behavior.

---

## Parallel Workflow

Multiple tasks may be in flight at once (different agents/sessions or the same
agent multitasking). To keep them from colliding:

- **One task = one worktree = one branch = one MR.** Never share a worktree or
  branch across tasks, even "quick" ones.
- **Unique names.** Derive `<task-name>` / `<branch-name>` from the task itself
  (e.g. `fix/calendar-404`, `feat/trip-sharing`), not generic names like `fix`
  or `update`. Two parallel tasks must never produce the same worktree path or
  branch name.
- **Check before creating.** Run `git worktree list` and `git branch -a`
  first so a new task doesn't collide with one already in progress.
- **Always branch from fresh `origin/main`.** Run `git fetch origin` right
  before creating the worktree so parallel tasks start from the same
  up-to-date base and don't inherit each other's in-progress work.
- **Assume shared files may be touched by other in-flight tasks.** Keep
  diffs small and scoped so rebasing is cheap; rebase onto `origin/main`
  often (not just at the end) to surface conflicts early instead of in one
  large resolution at the end.
- **Isolate runtime state per worktree.** Each worktree gets its own
  `node_modules`/install step and its own dev-server port/env file — never
  point two worktrees at the same running dev server, port, or `.env.local`.
- **If a task's MR is already merged**, don't stack follow-up work on the old
  branch/worktree. Recreate the branch from the latest `origin/main` (same
  branch name is fine) and open a new MR — see "Follow-up changes later".

---

## Worktrees

- Always use Git worktrees for any task.
- Create one worktree per feature/fix/task.
- Never reuse a worktree for unrelated work.
- Rebase new code on top of `origin/main`.
- At the end, create an MR to `main`.
- Remove the worktree when the task is finished.
- If changes are requested later, create a fresh worktree from the same branch.

### Create worktree

```bash
git fetch origin
git worktree add ../<task-name> -b <branch-name> origin/main
```

### Commit conventions

- Write commit messages that explain *why*, not just what.
- Prefer several small, logical commits over one giant commit when a task
  naturally splits (e.g. "add migration" / "add API endpoint" / "add tests").
- Never amend or force-push commits that are already pushed and part of an
  open MR unless explicitly asked.

### Finish task

Before finishing work, verify tests and pipeline status:

- Add unit/integration/UI tests for new functionality.
- Do not modify existing tests unless functionality changed.
- Run tests locally to confirm they pass.

Rebase on top of `origin/main`:

```bash
git fetch origin
git rebase origin/main
```

Then commit and push:

```bash
git add -A
git commit -m "<message>"
git push -u origin <branch-name>
```

Open an MR from `<branch-name>` to `main` and wait for CI/CD to run.

- Check the pipeline/PR status and do NOT remove the worktree or stop the agent until all checks pass.
- If CI fails, iterate in the same worktree/branch and re-run the pipeline.
- Once all checks are green, merge automatically — see "PR & Merge Policy"
  above. Do not wait to be asked, unless the user said not to merge this
  particular task.

### Delete worktree

```bash
git worktree remove ../<task-name>
git worktree prune
```

Run this from the main repo, not from inside the worktree.

Periodically run `git worktree list` to spot stale/abandoned worktrees left
over from finished or dropped tasks, and clean them up so paths stay free for
new work.

### Follow-up changes later

```bash
git fetch origin
git worktree add ../<task-name>-followup <branch-name>
```

Use the same `<branch-name>` as before, but create a new worktree instead of reopening the old one.

Goal:

The user should always be able to inspect, delete, or switch branches without encountering "used by worktree" errors.

## Efficiency rules

- Do NOT scan the entire repository.
- Only read files directly relevant to the task.
- Avoid repeated file reads.
- Ask before broad architectural exploration.
- Prefer targeted grep/search over repo summarization.
