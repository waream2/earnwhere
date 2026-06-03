---
title: folio
summary: Open-source portfolio template for engineers that interviews you and writes itself.
image: /projects/folio.jpg
date: 2026-05-14
category: personal
stack:
  - Astro
  - TypeScript
  - Claude Code skills
status: shipped
links:
  - label: repo
    href: https://github.com/waream2/folio
  - label: live
    href: https://folio.earnwhere.dev
draft: false
---

Built earnwhere first as a place for my own posts and project write-ups. Then friends started job hunting without portfolios, and forking mine didn't make sense; they'd have inherited my content. I wanted them to have something where the writing was the easy part, since that's where most portfolios stall out.

So I pulled the template apart and shipped it as `/folio`: an Astro scaffold paired with four Claude Code skills that interview you and draft your about page, project write-ups, and journal entries in your first-person voice. The skills are the product. The scaffold is the delivery vehicle and the thing you own afterwards.

It's a dev tool by design, not a SaaS. You get a real repo, you can read and modify every skill, and there's no service in the middle. The plumbing headache worth mentioning is that `journal-post` ships in two places (project-local and global) so it works whether you're coding inside the portfolio repo or somewhere else, and `/onboard` has to wire up both copies. Everything else was mostly prompt writing and orchestration.
