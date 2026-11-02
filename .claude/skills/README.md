# Skills de agente

Skills que o Claude Code carregava em `~/.claude/skills`, agora versionadas aqui.
O Claude Code lê `.claude/skills/<nome>/SKILL.md`. O Cursor lê o mesmo diretório pelo symlink `.cursor/skills` → `../.claude/skills`.

A pasta aninhada `skills/speckit-*` foi achatada para `.claude/skills/speckit-*`. A pasta `learned/` estava vazia e não entrou. O binário `impeccable` de `linux-x64` não é versionado; a nota está em [`impeccable/SKILL.md`](impeccable/SKILL.md).

A descrição é a primeira frase do campo `description` no frontmatter de cada `SKILL.md`.

## Fluxo do projeto

`the-judge` e as skills `tlc-*`. O `the-judge` sai de [`.claude/skills/the-judge/SKILL.md`](the-judge/SKILL.md).

| Skill | Descrição |
| --- | --- |
| `the-judge` | Evidence-first pull request judge that reviews a PR and posts one consolidated GitHub review with inline comments via the gh CLI. |
| `tlc-discover` | Interviews an unshaped idea into a verdict and a design document - decisions, flows, schema, contracts - that anyone can plan from without having been in the room. |
| `tlc-implement` | Implements work already planned - a plan.md from tlc-plan, or a small ticket - by freezing it into checks with proofs, building, and proving every check with a script and an independent Verifier before declaring done. |
| `tlc-plan` | Turns a request, ticket, PRD, design or thread into one plan a human approves and a builder can act on without the conversation: asks every gray area until no product decision is left to the builder, then writes the problem, EARS criteria with concrete values, the path and the data it touches (drawn in mermaid), the interface, and only the decisions that are hard to reverse. |
| `tlc-prd` | Interviews an idea into a PRD file covering situation, problem, success, boundary, and journey states, and stops before any technical design. |
| `tlc-spec-driven` | Feature planning and implementation with 4 adaptive phases (Specify, Design, Tasks, Execute). |
| `tlc-spec-lean` | Spec-driven feature work that freezes obligations instead of the plan: one human-reviewed plan with EARS criteria, path, entities, interface and one-way doors, then proof-backed checks, then build, then an independent Verifier. |

## Uso geral

| Skill | Descrição |
| --- | --- |
| `ai-memory-durable-pages` | Use this skill for any explicit durable wiki mutation in ai-memory: saving project knowledge, recording a rule or annotation, updating a permanent note, or deleting a memory page. |
| `ai-memory-handoff` | Use this skill for any request whose goal is session continuity across agents or time: finding a pending handoff, resuming previous work, saving next-session context, wrapping up, or discarding a mistaken handoff. |
| `ai-memory-learning-maintenance` | Use this skill for any ai-memory knowledge-base maintenance request: consolidating observations, reviewing session lessons, proposing durable learnings, auditing or linting the wiki, finding contradictions, pruning stale memory, or running auto-improvement. |
| `ai-memory-retrieval` | Use this skill for any request whose goal is read-only retrieval from ai-memory: project history, prior context, decisions, rules, gotchas, recent activity, full wiki pages, or status/briefing. |
| `ai-memory-routing-install` | Use this skill for any request to install, refresh, repair, inspect, or remove ai-memory's agent-facing routing: managed instruction snippets, Agent Skills, CLAUDE.md/AGENTS.md integration, or local/global skill roots. |
| `ask-matt` | Ask which skill or flow fits your situation. |
| `best-practices` | Apply modern web development best practices for security, compatibility, and code quality. |
| `code-review` | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). |
| `codebase-design` | Shared vocabulary for designing deep modules. |
| `codenavi` | Your pathfinder for navigating unknown codebases. |
| `coding-guidelines` | Behavioral guidelines to reduce common LLM coding mistakes. |
| `diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions. |
| `docs-writer` | Write, review, and edit documentation files with consistent structure, tone, and technical accuracy. |
| `domain-modeling` | Build and sharpen a project's domain model. |
| `eli5` | Explain any topic, code, concept, or error tailored to a specific audience's level of understanding. |
| `find-skills` | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. |
| `git-guardrails-claude-code` | Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. |
| `grill-me` | A relentless interview to sharpen a plan or design. |
| `grill-with-docs` | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| `grilling` | Grill the user relentlessly about a plan, decision, or idea. |
| `handoff` | Compact the current conversation into a handoff document for another agent to pick up. |
| `harness-eval` | Evaluate a repo agent harness (AGENTS.md, rules, skills, skill refs) for broken paths/commands, redundant instructions, and usefulness using a stack-agnostic dual-judge protocol with planted traps. |
| `harness-init` | Mandatory interactive wizard to connect a repo to the global harness (writes .tlc/harness/config.json + shim hooks via tlc-exec, for whichever of Cursor / Claude Code are installed). |
| `impeccable` | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. |
| `implement` | Implement a piece of work based on a spec or set of tickets. |
| `improve-codebase-architecture` | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| `loop-me` | Grill me about specs for the workflows I want to build, within this workspace. |
| `mermaid-studio` | Expert Mermaid diagram creation, validation, and rendering with dual-engine output (SVG/PNG/ASCII). |
| `prototype` | Build a throwaway prototype to answer a design question. |
| `research` | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. |
| `resolving-merge-conflicts` | Use when you need to resolve an in-progress git merge/rebase conflict. |
| `security-best-practices` | Perform language and framework specific security best-practice reviews and suggest improvements. |
| `setup-matt-pocock-skills` | Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. |
| `setup-pre-commit` | Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. |
| `speckit-analyze` | Perform a non-destructive cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md after task generation. |
| `speckit-checklist` | Generate a custom checklist for the current feature based on user requirements. |
| `speckit-clarify` | Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions and encoding answers back into the spec. |
| `speckit-constitution` | Create or update the project constitution from interactive or provided principle inputs, ensuring all dependent templates stay in sync. |
| `speckit-git-commit` | Auto-commit changes after a Spec Kit command completes |
| `speckit-git-feature` | Create a feature branch with sequential or timestamp numbering |
| `speckit-git-initialize` | Initialize a Git repository with an initial commit |
| `speckit-git-remote` | Detect Git remote URL for GitHub integration |
| `speckit-git-validate` | Validate current branch follows feature branch naming conventions |
| `speckit-implement` | Execute the implementation plan by processing and executing all tasks defined in tasks.md |
| `speckit-plan` | Execute the implementation planning workflow using the plan template to generate design artifacts. |
| `speckit-specify` | Create or update the feature specification from a natural language feature description. |
| `speckit-tasks` | Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts. |
| `speckit-taskstoissues` | Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts. |
| `supabase` | Use when doing ANY task involving Supabase. |
| `supabase-postgres-best-practices` | Postgres performance optimization and best practices from Supabase. |
| `tdd` | Test-driven development. |
| `teach` | Teach the user a new skill or concept, within this workspace. |
| `the-fool` | Use when challenging ideas, plans, decisions, or proposals. |
| `to-questionnaire` | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. |
| `to-spec` | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| `to-tickets` | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| `triage` | Move issues and external PRs through a state machine of triage roles, categorise, verify, grill if needed, and write agent-ready briefs. |
| `vercel-react-best-practices` | React and Next.js performance optimization guidelines from Vercel Engineering. |
| `wait-what` | Stop. That last message did not land: re-pitch it. |
| `wayfinder` | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear. |
| `wiki-workflows` | Guide for ingesting sources, querying, and linting your wiki |
| `wizard` | Generate an interactive bash wizard that walks a human through steps only they can perform. |
| `writing-for-agents` | Writing documents for agents. |
