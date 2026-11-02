---
name: wiki-workflows
description: Guide for ingesting sources, querying, and linting your wiki
---

# Wiki Workflows Guide

## B. Ingest Workflow

**How sources become wiki content.**

### Trigger
You: "Ingest [source] into [topics]"

Example: "Ingest the React hooks article into frontend and concepts"

### Process

Claude Code:

1. **Read source** from `/raw/` - extract key takeaways, terminology, claims
2. **Create source summary** (optional, in `/wiki/sources/`) if source is significant
3. **Update topic pages** - add relevant info to `/wiki/topics/[topic].md`
4. **Update entity pages** - create/update `/wiki/entities/[tool].md` for tools mentioned
5. **Update concept pages** - create/update `/wiki/concepts/[concept].md` for ideas introduced
6. **Update relationships** - add backlinks to related pages
7. **Update index.md** - add entries under appropriate sections
8. **Add log entry** to `/wiki/log.md` - `## [2026-05-09] ingest | Article: "..."` 
9. **Report changes** - show you what was updated, discuss priority areas

### You Review
- Read summaries of changes
- Approve or request revisions
- Provide feedback on emphasis/priority

### Rules

- One source at a time initially (discuss + review)
- Batch ingest only when workflow is dialed in
- Always cross-reference: if source mentions React and microservices, update both pages
- Update page metadata: increment `sources` count, update `updated` date
- Never delete or significantly rewrite existing content without discussion (append and reconcile)

---

## C. Query Workflow

**How you ask questions against the wiki.**

### Trigger
You: "Find [topic] information about X" or "Compare X vs Y" or "How does X work?"

Examples:
- "Synthesize what we know about React performance optimization"
- "Compare state management libraries (Redux, Zustand, Recoil)"
- "What patterns are recommended for error handling?"

### Process

Claude Code:

1. **Search index.md** - find relevant topics, entities, concepts
2. **Read related pages** - load all pages mentioned in index, follow backlinks
3. **Synthesize answer** - compile information with citations
4. **Generate markdown** - output structured answer with:
   - Introduction (what you're answering)
   - Main sections with citations
   - Comparisons/contrasts if applicable
   - Related questions or deeper dives
5. **Optional: file result** - if answer is valuable, propose filing as new comparison/concept page

### You Decide
- Review synthesized answer
- Ask follow-ups
- Decide: keep in chat, or file into wiki as new permanent page?

### Rules

- Always cite sources (link to pages)
- Include contradictions found (which sources disagree?)
- Suggest missing information (what would be useful to know?)
- Offer filing suggestion: "This comparison could be filed as `/wiki/comparisons/state-management.md`"

---

## D. Linting Workflow

**Periodic health checks to keep wiki clean and current.**

### Trigger
You: "Health check the wiki" or "Lint for [type]"

Or periodic (weekly/monthly): Run automatically

### Process

Claude Code scans wiki for:

1. **Orphan pages** - pages with no inbound links (potential dead content)
2. **Missing backlinks** - pages mention concepts but don't link to them
3. **Contradictions** - same claim stated differently across pages, or conflicting advice
4. **Stale data** - claims that newer sources have superseded
5. **Data gaps** - important concepts mentioned but no dedicated page
6. **Metadata inconsistencies** - missing dates, source counts, tags

### Output

Report with:
- List of orphans (suggest delete or consolidate)
- Missing pages (suggest creating)
- Contradictions (suggest reconciling)
- Stale claims (suggest reviewing/updating)
- Suggestions for new investigation areas

### You Review
- Prioritize fixes
- Decide what to update, what to leave
- Request additional research/web searches for gaps

### Rules

- Run linting monthly initially
- Fix contradictions immediately (they compound as wiki grows)
- Archive very old pages (move to `/archive/` if superseded)
- Update index.md after linting

---

## F. Output Formats

All outputs are **markdown only**.

Standard output format:
1. Title + intro
2. Main sections with clear headings
3. Citations (links to source pages)
4. Related pages section
5. Metadata: date, status, source count

### Query Outputs

When answering questions, output formats:

- **Synthesis**: Compilation of info from multiple pages with citations
- **Comparison**: Table or sections comparing options
- **Explanation**: Deep dive with examples and related concepts
- **Analysis**: Decision framework or tradeoff analysis

---

## G. Tools Integration

### CLI Search Tool

When wiki grows (~200+ pages), use `wiki-search.py`:

```bash
python .claude/tools/wiki-search.py "react performance"
# Output: ranked results with page titles, summaries, paths
```

Claude Code uses this to:
- Find relevant pages when answering queries
- Discover related content
- Check for duplicates before creating new pages

### Health Check Tool

Run `wiki-health-check.py` periodically:

```bash
python .claude/tools/wiki-health-check.py
# Output: report of orphans, gaps, contradictions, stale data
```

### Obsidian IDE

Open project root in Obsidian:
1. Settings → Vault name → select this directory
2. Graph view: see topic connections
3. Web Clipper: clip articles → save to `/raw/articles/`
4. Obsidian will show:
   - `/raw/` - source documents
   - `/wiki/` - compiled knowledge
   - Live backlinks as you edit

---

## H. Workflows by Frequency

### Daily
- Find interesting source
- Add to `/raw/`
- Brief Claude Code: "Ingest this [source] into [topics]"
- Review changes in Obsidian
- Continue

### Weekly
- Ask 1-2 questions against wiki
- Review synthesized answers
- File valuable analyses back into wiki

### Monthly
- Run linting: "Health check wiki for orphans, gaps, contradictions"
- Review suggestions
- Fix high-priority issues
- Update overview.md with stats (sources, pages, topics)

---

Use this skill to reference workflow procedures. The wiki schema (structure, cross-references, frontmatter) stays in ~/.claude/CLAUDE.md for always-loaded reference.
