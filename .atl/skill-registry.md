# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

Generated: 2026-05-01 | Project: nextjs-fastapi-store-system

---

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | /Users/ivan/.copilot/skills/branch-pr/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | /Users/ivan/.copilot/skills/go-testing/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | /Users/ivan/.copilot/skills/issue-creation/SKILL.md |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | /Users/ivan/.copilot/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | /Users/ivan/.copilot/skills/skill-creator/SKILL.md |

> Note: `~/.gemini/skills/` contains identical skills — deduplicated in favor of `~/.copilot/skills/`.
> No project-level skills found (`.claude/`, `.gemini/`, `.agent/`, `skills/` dirs absent).

---

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| copilot-instructions.md | .github/copilot-instructions.md | Caveman mode, code change rules, security, session management |

---

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue (`Closes #N` / `Fixes #N` / `Resolves #N`) — no exceptions
- Linked issue MUST have `status:approved` label before PR can open
- Exactly one `type:*` label per PR: `type:bug`, `type:feature`, `type:docs`, `type:refactor`, `type:chore`, `type:breaking-change`
- Branch naming: `type/description` — lowercase, `a-z0-9._-` only — regex: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- PR body MUST include: linked issue, type checkbox, summary (1-3 bullets), changes table, test plan, contributor checklist
- Run `shellcheck scripts/*.sh` on any modified shell scripts before opening PR
- Blank PRs without issue linkage are blocked by CI

### go-testing
- Use table-driven tests: `tests := []struct{ name, input, expected string; wantErr bool }{...}` + `t.Run(tt.name, func(t *testing.T){...})`
- Test Bubbletea Model state transitions directly via `newModel, _ := m.Update(tea.KeyMsg{...})` then cast `.(Model)`
- For TUI integration tests: `tm := teatest.NewTestModel(t, m)` → `tm.Send(...)` → `tm.FinalModel(t).(Model)`
- Golden file testing: read from `testdata/*.golden`, write with `os.WriteFile` when `-update` flag set
- No `t.Parallel()` in Bubbletea tests — model is NOT goroutine-safe
- Pure fn → table-driven. Has side effects → mock deps. TUI state → direct Update(). Visual output → golden files.

### issue-creation
- Blank issues disabled — MUST use template: `bug_report.yml` or `feature_request.yml`
- Every new issue auto-gets `status:needs-review`; needs `status:approved` before any PR
- Always search for existing duplicates before creating
- Questions/discussions → GitHub Discussions, NOT issues
- Bug report requires: pre-flight checkboxes, bug description, steps to reproduce, expected/actual behavior, OS, agent/client, shell
- Feature request requires: pre-flight checkboxes, problem description, proposed solution, affected area

### judgment-day
- Launch TWO independent blind judge sub-agents in PARALLEL via `delegate` — never sequential, never self-review
- Each judge gets same target, identical criteria, but zero knowledge of the other
- Classify every WARNING: `WARNING (real)` = normal user can trigger → fix required; `WARNING (theoretical)` = needs contrived/impossible scenario → INFO only, no fix, no re-judge
- Confirmed (both found) → fix immediately. Suspect (one found) → triage. Contradiction (disagree) → escalate to user
- Round 1: present verdict, ask user to confirm fixes. Round 2+: re-judge only for confirmed CRITICALs
- Convergence: 0 confirmed CRITICALs + 0 real WARNINGs = APPROVED. After 2 iterations without convergence → ask user to continue or escalate
- Always inject project compact rules into BOTH judge prompts AND fix agent prompt

### skill-creator
- Skill lives at `~/.copilot/skills/{skill-name}/SKILL.md` (user-level) or `{project}/.agent/skills/{skill-name}/SKILL.md` (project-level)
- Required frontmatter: `name`, `description` (must include `Trigger:` line), `license: Apache-2.0`, `metadata.author`, `metadata.version`
- Sections (in order): When to Use → Critical Patterns → Code Examples → Commands → Resources
- Compact rules MUST be actionable only (do/never/prefer), 5-15 lines max, no motivation/when-to-use text
- Naming: `{technology}` | `{project}-{component}` | `{action}-{target}`
- `references/` → local file paths only, not web URLs
- After creating, add to `AGENTS.md` and run `skill-registry` to update `.atl/skill-registry.md`
