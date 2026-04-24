# earnwhere — "A Look Inside My Engineering Mind"

## Context

Earn wants a public blog that acts as a live feed of how he builds with AI. The posts are written by Claude agents observing his coding sessions — highlighting interesting patterns, wins, mistakes, and decisions. The blog runs on Astro, deploys to Vercel, and lives at `~/documents/earnwhere`. The existing `blog-notes` skill gets rewritten to analyze conversations, optionally interview Earn for his perspective, and open PRs with fully-written blog posts.

**Key constraints:**
- No project IP leakage — focus on process, not product details
- Tone: casual & conversational
- Every post goes through a PR for Earn to review before publishing
- GitHub user: `waream2`
- Blog name: earnwhere

---

## Part 1: Build the Astro Blog

### 1.1 Scaffold the Astro project

Location: `~/documents/earnwhere`

- `npm create astro@latest` with the blog template as a starting point
- TypeScript, strict mode
- Install dependencies: `@astrojs/vercel`, `@astrojs/mdx`

### 1.2 Content structure

```
src/content/posts/
  2026-04-08-skill-that-writes-about-itself.md
  2026-04-09-debugging-a-race-condition.md
  ...
```

Each post is a markdown file with frontmatter:
```yaml
---
title: "The Skill That Writes About Itself"
date: 2026-04-08
category: meta  # debugging | architecture | tooling | process | til | meta
hook: "I built a Claude skill that observes my coding sessions and writes blog posts about them. Here's what happened when it tried to write about itself."
draft: false
---
```

### 1.3 Design direction

- **Clean & minimal, light theme** — white space, clean typography, let the content breathe
- Feed layout — posts listed chronologically (newest first)
- Each post shows: title, date, category tag, hook/excerpt
- Individual post pages with full content
- Simple header: "earnwhere" + tagline "a look inside my engineering mind"
- Use the `frontend-design` skill for the actual implementation to get a polished, non-generic look

### 1.4 Vercel deployment

- Add `@astrojs/vercel` adapter
- Configure `astro.config.mjs` for Vercel output
- Earn connects the GitHub repo to Vercel after we push (manual step)

### 1.5 Initialize Git & push

- `git init`, initial commit
- Earn creates the repo on GitHub (`waream2/earnwhere`)
- Push to origin

---

## Part 2: Rewrite the blog-notes Skill

### 2.1 New skill identity

The skill transforms from a "note collector" into an "engineering journalist." It:

1. **Analyzes** the current conversation for interesting moments
2. **Leaves questions for Earn** in the PR for him to answer asynchronously
3. **Writes** a full blog post in markdown
4. **Opens a PR** to the earnwhere repo

### 2.2 What makes something post-worthy

Reframed for a public audience watching someone build with AI:

- **Process observations** — how Earn and Claude collaborate, delegation patterns, when AI helps vs. hinders
- **Decision moments** — architectural choices, trade-offs weighed, why one approach won
- **Debugging stories** — the journey matters more than the fix, especially surprising root causes
- **Tool & technique discoveries** — new tools, clever uses of existing ones, workflow improvements
- **Mistakes & course corrections** — things that went wrong, bad assumptions, recovery strategies
- **"The AI did something interesting"** — moments where the agent surprised, impressed, or frustrated

### 2.3 The interview mechanic (asynchronous, via PR)

The skill does NOT interrupt the conversation with questions. Instead:
- It writes the full post as-is, but embeds **placeholder questions** in the draft where Earn's perspective would add value
- These appear as clearly marked sections in the post (e.g., `<!-- QUESTION: Why did you choose X over Y? Your answer here -->`)
- The PR description also lists these questions so they're visible at a glance
- Earn edits the markdown file in the PR to fill in his answers (or deletes the placeholders if he doesn't want to answer)
- When Earn approves and merges the PR, the post goes live
- Questions should be specific to the moment, not generic (e.g., "What was going through your mind when the test failed?" not "How do you feel about AI?")

### 2.4 IP protection rules

The skill must:
- Never mention specific product names, company names, or business logic
- Abstract domain-specific code into generic equivalents (e.g., "a data pipeline" not "the user billing ETL")
- Focus on the engineering process, patterns, and decisions — not what's being built
- Never include full code snippets from the project — only small, genericized examples if needed

### 2.5 Post writing guidelines

- Casual, conversational tone — like explaining to a friend
- First person from the agent's perspective ("I noticed Earn doing X..." or "During this session, we...")
- Short paragraphs, subheadings for scannability
- 400-800 words typical length — not essays, more like feed entries
- Specific and searchable titles
- End with a takeaway or reflection

### 2.6 PR workflow

1. Navigate to the earnwhere repo at `~/documents/earnwhere`
2. Create a branch: `post/YYYY-MM-DD-slugified-title`
3. Write the markdown file to `src/content/posts/`
4. Commit with a descriptive message
5. Push the branch and open a PR using `gh pr create`
6. PR description includes a preview of the post's hook, key points, and any questions for Earn

### 2.7 Skill file location & config

- Rename skill directory from `blog-notes` to `earnwhere` (invoked as `/earnwhere`)
- New path: `/Users/earn/.claude/skills/earnwhere/SKILL.md`
- Delete old `/Users/earn/.claude/skills/blog-notes/SKILL.md`
- Update `allowed-tools` to include: `Read, Write, Edit, Glob, Bash(git *), Bash(gh *), Bash(date *), Bash(cd *)`
- Set effort to `max` since it's writing full posts

### 2.8 Duplicate detection

Before writing a new post:
- Read existing posts in `src/content/posts/`
- Check if the same topic/moment has already been captured
- Skip if duplicate — don't create filler

---

## Execution Order

1. **Scaffold the Astro blog** at `~/documents/earnwhere`
2. **Design the site** using the frontend-design skill for a polished look
3. **Initialize git**, make initial commit
4. **Rewrite the skill** — rename `blog-notes` → `earnwhere`, write new SKILL.md
5. **Test the skill** by running `/earnwhere` on this very conversation (meta!)

---

## Verification

1. Run `npm run dev` in `~/documents/earnwhere` — site loads with no posts
2. Run the rewritten `/earnwhere` skill — it should:
   - Analyze this conversation
   - Write a post about building the blog/skill itself
   - Leave questions for Earn in the PR
   - Open a PR to the repo
3. Merge the PR, verify the post appears on the site
4. Deploy to Vercel and confirm it's live

---

## Decisions Made

- Skill renamed from `blog-notes` to `earnwhere` (invoked as `/earnwhere`)
- Design: clean & minimal, light theme, white space, clean typography
- Hosting: Vercel
- Tone: casual & conversational
- Review: always PR, never auto-merge
- Questions left in PR for async answers, not asked interactively
- GitHub: `waream2/earnwhere`
- Location: `~/documents/earnwhere`
