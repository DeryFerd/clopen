# Maintainers Guide

Internal guide for Clopen core maintainers. External contributors should follow [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Table of Contents

- [Roles & Permissions](#roles--permissions)
- [Guiding Principles](#guiding-principles)
- [The PR Lifecycle](#the-pr-lifecycle)
  - [1. Intake](#1-intake)
  - [2. Audit](#2-audit)
  - [3. Choose a Review Path](#3-choose-a-review-path)
  - [4. Merge](#4-merge)
- [Review Paths](#review-paths)
  - [Path A — Approve and Merge](#path-a--approve-and-merge)
  - [Path B — Iterate on the Branch](#path-b--iterate-on-the-branch)
  - [Path C — Merge As-Is, Follow-up PR](#path-c--merge-as-is-follow-up-pr)
  - [Path D — Comment and Wait](#path-d--comment-and-wait)
  - [Path E — Close and Replace](#path-e--close-and-replace)
- [Security PRs](#security-prs)
- [Communication Norms](#communication-norms)
  - [Suggest by Default; Act on Confirmation](#suggest-by-default-act-on-confirmation)
- [Operational Policy](#operational-policy)
  - [Force-Push](#force-push)
  - [Conflict Resolution Between Maintainers](#conflict-resolution-between-maintainers)
- [Reference](#reference)
  - [`Co-authored-by` Trailer Format](#co-authored-by-trailer-format)
  - [Release Process](#release-process)
  - [Questions](#questions)

---

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| Maintainer | Review, request changes, push to contributor forks (when allowed), squash-merge to `main`. |
| Reviewer | Review and approve PRs. No merge rights. |

The maintainer list is managed via GitHub repo settings (Teams / Collaborators).

---

## Guiding Principles

These principles inform every decision in this guide. Cite them in a PR comment when justifying an unusual call.

- **Audit before asking the contributor to validate.** Discovering the shape needs to change after they've already re-tested wastes their time. The audit is the maintainer's responsibility, not the contributor's.
- **Default to the established pattern.** Inconsistency between sites handling the same concern is a recurring source of regressions. New mechanisms need explicit justification before they're adopted.
- **Stay persuadable until you've decided.** If a comment raises concerns, it should also state what would change your mind. If you can't articulate that, you've already decided — pick a different path.
- **Closure is administrative, not adversarial.** A closed PR can always be reopened. Frame closure as housekeeping with the door open, never as rejection.
- **Attribution always.** Whether you build on a contributor's branch or close-and-replace, the original audit instinct still earns credit.
- **Warm, brief, substantive — in that order.** Open with one or two sentences that recognize something *specific* the contributor did well (the security instinct, the careful edge-case writeup, the test scaffolding). Generic "thanks for the PR" reads as filler; named appreciation lands. Then go straight to the audit findings in prose, anchored to file:line inline, invite counter, then stop. Multi-paragraph framing and "I want to merge this, but..." padding hide the ask — but so does cold, headerless terseness with no acknowledgement at all. Write the comment a senior engineer would feel respected receiving.

---

## The PR Lifecycle

This is the standard flow for a fork-originated PR.

### 1. Intake

Check out the PR to your local working copy:

```bash
gh pr checkout <PR-NUMBER>
```

This sets the branch's push remote to the contributor's fork, so any push goes back to the PR. Verify with:

```bash
git config branch.<branch-name>.pushRemote
```

Read the full diff before forming a position. Do not skim, do not draft comments until you've read the entire patch end-to-end.

### 2. Audit

After reading the diff, evaluate three things **before** asking the contributor to validate or iterate:

1. **Adjacent code** — search the codebase for similar gaps the PR didn't address. Bugs of the same shape usually cluster; if one site needed fixing, others likely do too. This matters most for security and refactor PRs.
2. **Adjacent patterns** — does the PR introduce a new mechanism where an established pattern in the codebase already covers this class of problem? Default to the established pattern unless the contributor can articulate why it doesn't fit.
3. **Test coverage** — does the change include `*.test.ts` where [CONTRIBUTING.md → Tests](./CONTRIBUTING.md#tests) expects them? If a test is missing, decide whether you add it on the branch ([Path B](#path-b--iterate-on-the-branch)) or request it from the contributor ([Path D](#path-d--comment-and-wait)). Security PRs without a regression test are not merge-ready.

The audit is what determines the review path. Skipping it and going straight to "looks good, please test" is the most common cause of churn.

### 3. Choose a Review Path

| Situation | Path |
|-----------|------|
| Audit is clean — no adjacent gaps, established patterns followed, scope appropriate | [Path A — Approve and Merge](#path-a--approve-and-merge) |
| Same shape, small additions / fixes needed, contributor is engaged | [Path B — Iterate on the Branch](#path-b--iterate-on-the-branch) |
| Out-of-scope items found in the audit | [Path C — Merge As-Is, Follow-up PR](#path-c--merge-as-is-follow-up-pr) |
| Concerns are substantive but you may be missing context, **or** part of the PR is mergeable while another part needs discussion | [Path D — Comment and Wait](#path-d--comment-and-wait) |
| Structural approach needs to change, or you'd be rewriting most of the diff yourself | [Path E — Close and Replace](#path-e--close-and-replace) |

The happy path ([Path A](#path-a--approve-and-merge)) is the goal — the other paths exist for when the audit surfaces something that warrants intervention. If you're unsure whether intervention is needed but lean toward "something feels off", default to [Path D](#path-d--comment-and-wait) — it preserves optionality without committing to a direction.

### 4. Merge

When the PR is ready:

- **Strategy:** Always squash-merge via the GitHub UI.
- **Subject:** Use GitHub's default (`<PR title> (#NNN)`). The PR title must already follow the conventional commit format from [CONTRIBUTING.md → Commit Messages](./CONTRIBUTING.md#commit-messages).
- **Extended description:** Leave empty. Repo convention is subject-only — check recently-merged PRs on `main` if unsure of the current style. Detail belongs in the PR description, not duplicated into the commit body. **Exception:** `Co-authored-by:` trailer when the PR is a reshape of a contributor's earlier work — see [`Co-authored-by` Trailer Format](#co-authored-by-trailer-format).
- **Branch deletion:** Delete the source branch via the GitHub button immediately after merge.

#### Local cleanup

```bash
git checkout main
git pull origin main
git branch -D <merged-branch>
```

---

## Review Paths

Five paths, one per row of [Choose a Review Path](#3-choose-a-review-path). Each subsection is self-contained: when to use it, the procedure (if any git ops), and a worked example comment.

Worked examples use these placeholders: `@contributor`, `#NNN`, `path/to/file.ts:LL`, dates in `YYYY-MM-DD`. All comments are posted via the GitHub PR UI per [Communication Norms](#communication-norms).

### Path A — Approve and Merge

Use when the audit is clean — no adjacent gaps, established patterns followed, scope appropriate, and tests are present where [CONTRIBUTING.md → Tests](./CONTRIBUTING.md#tests) requires them. Post a short approval comment, then proceed to [Merge](#4-merge).

```markdown
Thanks @contributor — nice catch on this one, and the `<specific thing they did well>` made the audit straightforward. Checked adjacent call sites in `path/to/dir` and they all follow the same shape, no gaps. `bun run check` / `bun run lint` / `bun test` green locally. Merging.
```

The opener has to name something specific — the regression test that pinned the boundary, the choice to follow an existing pattern, the threat model in the description. "Thanks for the PR!" alone is filler.

For security-sensitive PRs, also note that the threat model in the description matches the diff (or summarize it yourself in one sentence if the contributor didn't include one).

### Path B — Iterate on the Branch

Use when the PR's shape is right and only needs additions or small fixes. Requires `maintainerCanModify: true` (default for fork PRs unless the contributor opted out).

#### Procedure

```bash
# 1. Make your edits locally

# 2. Verify locally
bun run check && bun run lint && bun run build

# 3. Commit a NEW commit (do NOT amend the contributor's)
git add -A
git commit -m "<type>(<scope>): description"

# 4. Sync with upstream main (resolve conflicts locally, not in the GitHub UI)
git fetch origin main
git merge origin/main
bun run check && bun run lint && bun run build   # re-verify after merge

# 5. Push to the contributor's fork
git push
```

Use `merge` (not `rebase`) when syncing with `main` to preserve the contributor's commit hashes.

#### Post-push comment

Write the comment as prose — a PR comment is a conversation, not a document. The `## Summary / ## Why / ## Changes / ## Notes` structure belongs in PR *descriptions*, not in review comments. A short paragraph that names what you added and why is enough; reviewers will read the diff for the rest.

```markdown
Thanks @contributor — your fix at `path/to/file.ts:LL` was the right shape, and spotting the boundary case was a good catch. Built on top with two adjacent call sites (`path/to/a.ts:LL`, `path/to/b.ts:LL`) that took the same shape, plus a regression test for the 50MB boundary so the next round can't regress quietly. `bun run check` / `lint` / `test` green, synced with `main`.
```

If the additions are larger or touch unrelated areas, a couple more sentences are fine — but stay in prose. The bar is "the contributor can read this and immediately know what's now in their branch and why," not "every change has its own bullet."

### Path C — Merge As-Is, Follow-up PR

Use when the audit surfaces issues that share a shape with this PR but live in different files/areas the contributor didn't sign up for. Don't expand the scope of the open PR — credit the find, merge what's ready, file the follow-up separately.

```markdown
Thanks @contributor — this is a clean fix, and surfacing the pattern is honestly the more valuable half of it. Merging as-is.

While auditing I noticed two adjacent call sites that take the same shape (`path/to/x.ts:LL`, `path/to/y.ts:LL`), but they're outside what this PR signed up for — so I'll open a follow-up (`fix/<scope>-cover-adjacent-sites`, per [CONTRIBUTING.md → Branch Naming](./CONTRIBUTING.md#branch-naming)) and credit this PR for the find.
```

In the follow-up PR description, link back under `## Related` so the trail is legible from both sides.

### Path D — Comment and Wait

Use when concerns are substantive but the contributor may have context or reasoning you're missing — or when part of the PR is clearly mergeable while another part needs discussion. This path sits between [Path B](#path-b--iterate-on-the-branch) (you're confident, just iterate) and [Path E](#path-e--close-and-replace) (you're confident, just replace).

**Defining trait:** you'd update your position if the contributor brought a stronger argument. If you can't articulate what would change your mind, you've already decided — use [Path B](#path-b--iterate-on-the-branch) or [Path E](#path-e--close-and-replace).

#### Comment shape

Write it as prose — a Path D comment is a conversation with someone whose thinking you're building on, not a checklist. Three things have to be there, but they belong woven into the writing, not stacked as bolded headings:

- An opener that recognizes something specific about the contributor's work. The instinct that surfaced the bug, the threat model they wrote, the test they pinned the boundary with — name it. "Thanks for the PR" with no specifics is filler.
- Concerns anchored to file:line, raised conversationally. "At `path/to/file.ts:LL`, X happens — is there a reason..." reads as collaboration. A numbered list of bolded headings reads as an audit verdict.
- The question whose answer would flip your position, woven into the relevant concern. If you can't articulate one, you've already decided — use [Path B](#path-b--iterate-on-the-branch) or [Path E](#path-e--close-and-replace).
- A response deadline at the end. Without one, silence becomes drift.

Skip section headers (`## Summary` etc. — those are for PR descriptions), restated context the contributor already knows, and "I want to merge this, but..." padding. Warmth and brevity are not opposites: a four-sentence prose comment with named appreciation lands better than ten bullet points with bolded leads.

```markdown
Thanks @contributor — the threat model in the description is the kind of thinking that makes these reviews easy, and the regression test you added covers the right boundary. Two things I'd like to talk through before merging:

The validator at `path/to/file.ts:LL` checks `payload.size`, but the write a few lines down uses `payload.data` — a mismatched payload like `{ size: 1, data: <60MB Uint8Array> }` would slip past the limit. Is `payload.size` trusted by an earlier check I'm missing? If not, switching to `payload.data.byteLength` closes it. I'd update my position here if there's a threat model where `size` can't be steered by the caller.

The same shape reaches `path/to/other.ts:LL` and isn't covered — fold it in here or split into a follow-up, your call. If you fold, the existing test scaffold makes a 50MB / 50MB+1B case straightforward.

Could you take a look by YYYY-MM-DD? Otherwise it'll auto-stale per [Deadlines](#deadlines-and-auto-stale) — happy to reopen the moment you're back.
```

#### Deadlines and auto-stale

- **Default response window:** 1 week from the comment date. Adjust up for holiday periods or complex PRs, down for trivial clarifications.
- **After the deadline,** close the PR with a brief, polite note referring back to the previous comment. The contributor can reopen at any time.

GitHub has no native auto-close — track these manually (calendar reminder, scheduled task, or a weekly maintainer sweep over open PRs with stale comments).

#### If the contributor responds with a stronger argument

Update your position openly. If a credible counterargument arrives, acknowledge it and adjust (merge as-is, bundle differently). Name the change explicitly in your next comment ("you're right that X — happy to keep both in this PR") so the trail is legible to anyone reviewing the discussion later.

If you find yourself rejecting every counterargument regardless of merit, you should have used [Path E](#path-e--close-and-replace) — and the contributor's time was wasted in the back-and-forth.

### Path E — Close and Replace

Use when the audit reveals the PR's shape needs to change — different mechanism than the established pattern, scope expanded beyond what the contributor can reasonably reach (e.g. frontend changes on a backend-only PR), or knock-on consequences that can't be fixed by stacking commits.

#### Iterate vs close-and-replace

| Iterate on branch ([Path B](#path-b--iterate-on-the-branch)) | Close and replace (Path E) |
|---|---|
| Same shape, small additions / fixes | Different mechanism from the established pattern |
| Scope unchanged | Scope expanded into different files/areas the contributor can't easily test |
| Contributor has bandwidth and is engaged | You'd be rewriting most of the diff yourself |
| One review round resolves it | You've already changed your mind once after asking them to validate |

If you've already asked the contributor to validate and you're now reconsidering the approach, **stop and re-audit first** — don't ask for a second validation round on a direction you're not confident in.

#### Closing comment

The contributor identified a real gap; you're reshaping the fix, not rejecting the intent. The comment must include:

- **Apology if you changed your mind** after the contributor already validated. Own the reversal explicitly; don't frame it as if the new pattern was always obvious.
- **Why** the shape needs to change, with file/line references — auditable, not opinion.
- **What you'll do instead** — branch name (per [CONTRIBUTING.md → Branch Naming](./CONTRIBUTING.md#branch-naming)), scope, and confirmation that you'll credit the contributor in the replacement PR.

```markdown
Thanks for spotting this gap @contributor — and I owe you an apology: I asked you to validate the earlier shape before I'd finished the audit, and now I'm reversing course on you. That's on me, not on the work you did here.

Re-reading the codebase, size checks in this project sit at the transport boundary (`path/to/transport.ts:LL`, `path/to/other.ts:LL`) rather than per-call, and rebuilding on the per-call shape would mean rewriting most of the diff after we converge. So I'd rather close this as administrative housekeeping than ask you for another round.

I'll open `fix/<scope>-transport-limit` in the next day or two with `Co-authored-by:` crediting you — your instinct on the original gap is what makes the replacement possible, and that earns the attribution regardless of whose lines end up in the file. Reopen here anytime if it turns out we want per-call after all.
```

#### Attribution in the replacement PR

The contributor must still get credit for spotting the issue, even if no line of their code survives in the replacement.

In the replacement PR description, under `## Notes` or `## Related`:

```markdown
Builds on #NNN by @contributor, reshaped after review to <one-sentence reason>.
```

This creates two-way cross-links: the closed PR shows "Referenced in PR #MMM", and the new PR shows the original as context.

At squash-merge time, add a `Co-authored-by:` trailer to the squash commit body. This is the **only acceptable exception** to the "leave extended description empty" rule. See [`Co-authored-by` Trailer Format](#co-authored-by-trailer-format) for the strict format.

---

## Security PRs

Extra discipline applies on top of the standard lifecycle:

- **Audit adjacent code.** IDOR-style bugs, privilege-escalation patterns, and input-validation gaps usually cluster. If one site needed the fix, search the codebase for the same shape elsewhere before merging.
- **Audit frontend visibility** when restricting a backend route. The same route is typically reached from many UI surfaces — open polling, status badges, navigation entry points, deep-linked modals, auto-mounted stores — any of which will surface an unexpected authorization error to users who previously had access. Test the gated route end-to-end from the perspective of the now-restricted role (full UI walkthrough, not just the API/WS call), not just from the perspective of a role that still has access. This is a recurring regression class on any authorization change.
- **Prefer established patterns.** The codebase has settled patterns for different authorization classes — explicit allowlists for global/system mutations, per-resource access helpers for user-owned resources, default-open for benign reads. A new security PR should fit one of these existing classes; if a contributor introduces a new mechanism, ask why the established pattern doesn't cover the case before adopting the new shape.
- **Match the defense to the threat.** A textbook-correct hardening pattern can still be wrong for the specific code path it's applied to — what's being compared, what an attacker can actually steer, and what the new code costs on the hot path all matter. Ask the contributor for an explicit threat model before merging, especially when the fix replaces an indexed lookup with a scan or otherwise trades performance for hardening.
- **Surface DB-layer bypasses** in the PR comment even when fixed (e.g. implicit grants from upsert/ignore patterns, missing transaction boundaries, ORM defaults that skip validation).
- **Require a threat model** in `## Security impact`: who is the attacker, what can they reach now, what is closed by this PR.
- **Require a regression test.** Per [Audit step 3](#2-audit), security PRs without a `*.test.ts` covering the closed vector are not merge-ready.
- **Scope discipline.** If the audit finds out-of-scope issues, take the [Path C — Merge As-Is, Follow-up PR](#path-c--merge-as-is-follow-up-pr) route rather than letting the original PR balloon.
- **No public CVE-style disclosure** in the PR description until the fix has shipped to a release. Use neutral framing (*"hardens authorization checks"*) instead of attack details.

---

## Communication Norms

Cross-cutting rules that apply across all review paths.

- **Post review comments via the GitHub PR UI**, not `gh pr comment`. Markdown previews and `@mention` notifications behave differently between the two — the CLI path silently drops or mangles formatting that the UI gets right. **Exception:** when execution is delegated to an AI assistant under [Suggest by Default; Act on Confirmation](#suggest-by-default-act-on-confirmation), the assistant uses `gh pr comment <PR-NUMBER> --body-file <path>` because passing a file preserves the markdown the assistant drafted; the maintainer then verifies rendering on the PR page.
- **Match comment length to substance, but never strip the human out.** A two-line concern is a two-line comment. The opener — one or two sentences naming something specific the contributor did well (the security instinct, the test that pinned the boundary, the threat model) — is worth the space and lands far better than generic "thanks for the PR." Beyond that, restated context and "I want to merge this, but..." framing only hide the actual ask. End with the next step or deadline when one is needed.
- **Write review comments as prose, not as documents.** Section headers (`## Summary`, `## Why`, `## Changes`, `## Notes`) belong in PR *descriptions*. A PR *comment* is a conversation — numbered concerns with bolded leads make it feel like an audit verdict, even when the substance is correct. Anchor file:line references inline ("at `path/to/file.ts:LL`, X happens — is there a reason...") and weave "what would change my mind" into the sentence rather than into a separate heading.
- **Use file:line references** when describing technical issues. The diff is the source of truth; pointing to it makes the comment auditable. But anchor them inside sentences, not as the start of bolded list items.
- **Resolve conflicts locally**, not in the GitHub web UI. Web-resolved merges drop signing and bypass local checks.
- **Never use `--no-verify`** or otherwise skip pre-commit hooks. If a hook fails, fix the underlying issue.
- **Don't link MAINTAINERS.md from PR comments.** This file is internal — external contributors can't act on its conventions, and linking it leaks process they aren't expected to follow. Reference [CONTRIBUTING.md](./CONTRIBUTING.md) (contributor-facing equivalent: `## Security impact` template, `After You Submit` for auto-stale window, etc.) or inline the policy in one sentence.

### Suggest by Default; Act on Confirmation

When you're contributing review work to a PR you are **not** personally merging — AI assistants, sub-reviewers doing first-pass triage, anyone whose output the merging maintainer will adopt — the default deliverable is exactly two artifacts:

1. **A suggested commit message** following [CONTRIBUTING.md → Commit Messages](./CONTRIBUTING.md#commit-messages). If a branch name needs to be proposed, follow [CONTRIBUTING.md → Branch Naming](./CONTRIBUTING.md#branch-naming) exactly.
2. **A suggested PR comment** matching the chosen review path — start from the worked example in the relevant subsection of [Review Paths](#review-paths) and adapt to the actual diff.

The merging maintainer is the one who clicks "Squash and merge" on GitHub. Do not chain a meta-PR proposal (branch + commit + PR description) onto your own analysis output — that's the maintainer's call to make, not yours to script. If your work itself touches docs or code, leave the working tree in the right state and stop there. If the maintainer wants help drafting the commit message and PR comment for *that* change, they'll ask.

This separation keeps audit accountability with the person who has merge rights, and prevents an upstream assistant's read of the diff from being rubber-stamped through the merge step.

#### Two-stage execution (when the maintainer delegates)

If the maintainer wants the assistant to carry the suggestion through to the PR, the assistant must ask for explicit confirmation at **two** points. Each stage is a separate yes — a "yes" at stage 1 is **not** consent for stage 2.

**Stage 1 — Apply the fix.**
After presenting the audit findings, ask: *"Should I apply the fix to the working tree?"*
- If **yes**: edit files, then run `bun run check` and `bun run lint`. Stop after verification and report the working-tree state. Do not stage, commit, or push yet.
- If **no**: stop. The maintainer will apply it themselves.

**Stage 2 — Commit, push, and post the PR comment.**
After Stage 1 lands and verifications are green, ask: *"Should I commit, push, and post the PR comment to #NNN?"* Include the proposed commit message and the PR comment markdown inline in the question so the maintainer is approving the exact text.
- If **yes**: write the drafted PR comment to a temp markdown file (e.g. `/tmp/pr-NNN-comment.md`), then run the sequence below using the maintainer's existing git/gh credentials:
  ```bash
  git add <specific files, never -A unless explicitly requested>
  git commit -m "<type>(<scope>): <subject>"
  git push
  gh pr comment <PR-NUMBER> --body-file /tmp/pr-NNN-comment.md
  ```
  Then report back with the pushed commit SHA and the comment URL so the maintainer can verify rendering on the PR page and click "Squash and merge".
- If **no**: stop. The maintainer will run the steps manually.

#### Constraints on Stage 2

- **Use the maintainer's existing credentials.** Do not run `git config user.name` / `user.email`, do not pass `-c user.email=...`, do not set `GIT_AUTHOR_*` env vars. Whatever the maintainer's local git is configured to do is what gets committed.
- **Never `--no-verify` or `--no-gpg-sign`.** If a pre-commit hook fails, fix the underlying issue and create a new commit — never amend the pre-hook state away.
- **Never force-push** under this protocol. If push is rejected because the contributor's fork moved, stop and surface the conflict to the maintainer; do not `--force` or `--force-with-lease`.
- **Never run `git merge` or the GitHub squash-merge** as part of Stage 2. The final merge button is the maintainer's, always.
- **Stage files explicitly by name** — do not `git add -A` or `git add .` unless the maintainer asked for it. Adjacent uncommitted work from the maintainer's session must not be swept into the PR commit.
- **Use `--body-file`, not `--body`,** for `gh pr comment`. This is the only sanctioned use of `gh pr comment` (see the exception under [Communication Norms](#communication-norms)) and only because passing a file preserves the markdown verbatim.
- **Verify rendering.** After posting, report the comment URL so the maintainer can open it on the PR page and confirm formatting, mentions, and code blocks rendered correctly. If rendering looks wrong, the maintainer edits via the GitHub UI — the assistant does not delete and repost.

#### When NOT to ask for Stage 2

Some situations require maintainer hands on the keyboard. In these cases, deliver only the two default artifacts and stop — do **not** offer to execute, even if the maintainer typically delegates.

- The audit is incomplete (adjacent code or adjacent patterns not yet checked).
- The PR is security-sensitive and the threat model in `## Security impact` has not been reviewed end-to-end against the diff.
- Stage 2 would require a force-push to land (rebase resolution, history rewrite).
- The PR targets `main` directly rather than going through squash-merge via the UI.
- The maintainer has not explicitly opted in this session. Silence is not consent.

---

## Operational Policy

### Force-Push

- **Never** force-push to `main`.
- Force-pushing to a contributor's fork branch is permitted only when rebasing solves a real problem **and** you've coordinated with the contributor first. Default to `merge` to preserve commit hashes.

### Conflict Resolution Between Maintainers

If two maintainers disagree on a merge decision:

1. Move the discussion into the PR comments so it's recorded.
2. If unresolved within 24 hours, escalate to the project lead.
3. **Default action:** do not merge until consensus is reached.

---

## Reference

### `Co-authored-by` Trailer Format

Used in squash-commit bodies when attributing a contributor whose PR was closed and reshaped (see [Path E — Close and Replace](#path-e--close-and-replace)). Format is strict — GitHub silently drops malformed trailers.

```
Co-authored-by: Full Name <email@example.com>
```

Rules:

- Header is `Co-authored-by:` exactly (capital `C`, lowercase rest, single space after the colon).
- Email wrapped in `<>` with no spaces inside, preceded by one space after the name.
- Use the email associated with the contributor's GitHub account. Check their commits on the closed PR:
  ```bash
  git log <branch> -1 --format='%ae'
  ```
- If the squash body has other text, separate the trailer with one blank line above it.

**Verify after merge.** Open the squash commit on `main` and confirm the contributor's avatar appears next to the "Co-authored by" line. If only your avatar shows, the trailer didn't parse. Fixing this after the fact requires rewriting `main` history, so check before walking away from the merge.

### Release Process

To be documented when the release flow stabilizes.

### Questions

Internal team: use the team Slack/Discord channel.
