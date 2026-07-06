# Claude Workflow Rules

## Core Principle

All work must be isolated, reproducible, and branch-based:

- Do not commit directly to `main`.
- Do all work in a dedicated branch/worktree.
- Keep changes scoped to one task.

Do not stop after planning. Start implementing immediately and only ask if blocked.

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

### Delete worktree

```bash
git worktree remove ../<task-name>
git worktree prune
```

Run this from the main repo, not from inside the worktree.

### Follow-up changes later

```bash
git fetch origin
git worktree add ../<task-name>-followup <branch-name>
```

Use the same `<branch-name>` as before, but create a new worktree instead of reopening the old one.

Goal:

The user should always be able to inspect, delete, or switch branches without encountering “used by worktree” errors.

## Efficiency rules

- Do NOT scan the entire repository.
- Only read files directly relevant to the task.
- Avoid repeated file reads.
- Ask before broad architectural exploration.
- Prefer targeted grep/search over repo summarization.

