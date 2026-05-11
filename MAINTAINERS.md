# Maintainers Guide

Internal guide for Clopen core maintainers. External contributors should follow [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Roles

| Role | Rights |
|------|--------|
| Maintainer | Review, request changes, push to contributor forks (when allowed), squash-merge to `main`. |
| Reviewer | Review and approve PRs. No merge rights. |

Maintainer list is managed via GitHub repo settings (Teams / Collaborators).

---

## Receiving a Pull Request from a Fork

### 1. Checkout the PR locally

```bash
gh pr checkout <PR-NUMBER>
```

This sets the branch's push remote to the contributor's fork, so any push goes back into the PR. Verify with:

```bash
git config branch.<branch-name>.pushRemote
```

### 2. Audit scope

After reading the diff, audit two things — **before** asking the contributor to validate or iterate:

1. **Adjacent code** — similar gaps the PR didn't address, especially for security or refactor PRs.
2. **Adjacent patterns** — does the PR introduce a new mechanism (e.g. prefix matching, new helper, new abstraction) where an established pattern already covers this class of problem (e.g. explicit enumeration in `ADMIN_ONLY_ROUTES`, ownership checks via `ensureAccess`)? Inconsistency is a recurring source of regressions. Default to the established pattern unless there's a concrete reason to diverge.

Decide:

- **Bundle into this PR** — same theme, same risk class, contributor agrees → add commits on top of the existing branch.
- **Separate PR** — out-of-scope items get a follow-up PR after this one merges.
- **Close and replace** — the PR's structural approach needs to change (different pattern, scope significantly expanded into areas the contributor can't easily reach, e.g. frontend changes on a backend-only PR). See §[Closing and Replacing a Contributor PR](#closing-and-replacing-a-contributor-pr).

When in doubt, ask in the PR comments before adding commits. **Do the audit before asking the contributor to validate end-to-end** — if you discover the shape needs to change after they've already re-tested, that wasted their time.

### 3. Adding fixes on top of a contributor's PR

Only when `maintainerCanModify: true` (default for fork PRs unless contributor opts out).

```bash
# 1. Make your edits locally
# 2. Verify
bun run check && bun run lint && bun run build

# 3. Commit your own commit (do NOT amend the contributor's)
git add -A
git commit -m "<type>(<scope>): description"

# 4. Sync with upstream main (resolve conflicts locally, not in GitHub UI)
git fetch origin main
git merge origin/main
bun run check && bun run lint && bun run build   # re-verify after merge

# 5. Push to the contributor's fork
git push
```

Use `merge` (not `rebase`) when syncing with `main` to preserve the contributor's commit hashes.

### 4. Post a PR comment describing what changed

Comment via the **GitHub PR UI** (not `gh pr comment`) so markdown previews and `@mention` notifications behave correctly.

Use this format so the contributor knows exactly what was added:

```markdown
Hi @contributor, thanks a lot for this contribution! I built on top of your commit with a few additional fixes — everything has been pushed to this branch.

## Summary
…

## Why
…

## Changes
- …

## Notes
- `bun run check` and `bun run lint` both pass clean.
- N files changed, +X/-Y.
- Branch synced with latest `main`.
```

The same optional headers from [CONTRIBUTING.md → Pull Request Format](./CONTRIBUTING.md#pull-request-format) apply (`## Security impact`, `## Test plan`, etc.).

---

## Closing and Replacing a Contributor PR

Use this path when the audit in §[2. Audit scope](#2-audit-scope) reveals the PR's shape needs to change — different pattern, scope expanded beyond what the contributor can reasonably reach, or the original direction has knock-on consequences (UX regressions, inconsistency with established patterns) that can't be fixed by stacking commits.

### When to close vs iterate

| Iterate (push on contributor's branch) | Close and replace |
|---|---|
| Same shape, small additions / fixes | Different shape (e.g. prefix vs. explicit enumeration) |
| Scope unchanged | Scope expanded into different files/areas the contributor can't easily test |
| Contributor has bandwidth and is engaged | You'd be rewriting most of the diff yourself |
| One review round resolves it | You've already changed your mind once after asking them to validate |

If you've already asked the contributor to validate and you're now reconsidering the approach, **stop and audit first**. Don't ask for a second validation round on a direction you're not confident in.

### Closing courtesy

Post the closing comment via the **GitHub PR UI** (not `gh pr comment`). The tone matters — the contributor identified a real gap; you're reshaping the fix, not rejecting the intent.

Include:

- **Apology if you changed your mind** after they validated. Own the reversal explicitly; don't frame it as if the new pattern was always obvious.
- **Why** the shape needs to change, with file/line references so it's auditable, not opinion.
- **What you'll do instead** — branch name, scope, and that you'll credit them in the replacement PR. This makes the closure feel like continuation rather than dismissal.

### Attribution in the replacement PR

The contributor must still get credit for spotting the issue, even if no line of their code survives.

**In the replacement PR description** (under `## Notes` or `## Related`):

```markdown
Builds on #NNN by @username, reshaped after review to <one-sentence reason>.
```

This creates two-way cross-links: the closed PR shows "Referenced in PR #MMM", and the new PR shows the original as context.

**At squash-merge time**, add a `Co-authored-by:` trailer to the squash commit body. This is the **only acceptable exception** to the "leave extended description empty" rule in §[Merging to `main`](#merging-to-main) — attribution is the reason.

```
Co-authored-by: Full Name <email@example.com>
```

Format is strict — GitHub silently drops malformed trailers:

- Header is `Co-authored-by:` exactly (capital C, lowercase rest, single space after the colon).
- Email wrapped in `<>` with no spaces inside, preceded by one space after the name.
- Use the email associated with the contributor's GitHub account (check their commits on the closed PR — `git log <branch> -1 --format='%ae'`).
- If the body has other text, separate the trailer with one blank line above it.

**Verify after merge** — open the squash commit on `main` and confirm the contributor's avatar appears next to the "Co-authored by" line. If only your avatar shows, the trailer didn't parse. Fixing this after the fact requires rewriting `main` history, so check before walking away from the merge.

---

## Merging to `main`

- **Strategy:** Always squash-merge.
- **Subject:** GitHub's default (`<PR title> (#NNN)`) — leave as is. PR title must already follow the conventional commit format.
- **Extended description:** Leave empty. Repo convention is subject-only — see merged PRs (#220, #224) for reference. Detail belongs in the PR description, not duplicated into the commit body. **Exception:** `Co-authored-by:` trailers for replacement-PR attribution — see §[Closing and Replacing a Contributor PR](#closing-and-replacing-a-contributor-pr).
- **Branch deletion:** Delete the source branch via the GitHub button after merge.

### Local cleanup

```bash
git checkout main
git pull origin main
git branch -D <merged-branch>
```

---

## Force-Push Policy

- **Never** force-push to `main`.
- Force-pushing to a contributor's fork branch is allowed only when rebasing solves a real problem, and only after coordinating with the contributor. Default to `merge` to preserve commit hashes.
- Never use `--no-verify` or skip pre-commit hooks.

---

## Security PRs

Extra discipline applies:

- **Audit adjacent code** before merging — IDOR-style bugs, privilege-escalation patterns, and input-validation gaps usually cluster.
- **Audit frontend visibility** when restricting a backend route. A member won't trigger an `Admin access required` error only from the obvious Settings tab — any open polling, status badge, navigator button, deep-linked modal, or auto-mounted store that calls the now-gated route will surface the same error. Test the gated route as a member end-to-end (UI walkthrough, not just the WS call), not just as an admin. PR #226 and the post-#227 reshape were both this exact regression class.
- **Prefer established patterns** over new mechanisms (see §[2. Audit scope](#2-audit-scope)). For authorization specifically: explicit enumeration in `ADMIN_ONLY_ROUTES` for global system mutations, per-resource ACL helpers (`ensureAccess`, `requireProjectAccess`) for user-owned resources. Reads of benign state stay open by default — see the `engine:*` block comment in `backend/auth/permissions.ts` for the canonical rationale.
- **Surface DB-layer bypasses** in the PR comment even when fixed (e.g. `INSERT OR IGNORE`-style implicit grants, missing transaction boundaries).
- **Threat model** in `## Security impact`: who is the attacker, what can they reach now, what is closed by this PR.
- **Scope discipline:** if the audit finds out-of-scope issues, file separate PRs immediately rather than letting the original PR balloon.
- **No public CVE-style disclosure** in the PR description until the fix has shipped to a release; use neutral framing ("hardens authorization checks") instead of attack details.

---

## Conflict Resolution Between Maintainers

If two maintainers disagree on a merge decision:

1. Move the discussion into the PR comments so it's recorded.
2. If unresolved within 24h, escalate to the project lead.
3. Default action: do not merge until consensus is reached.

---

## Release Process

(To be documented when the release flow stabilizes.)

---

## Questions?

Internal team: use the team Slack/Discord channel.
