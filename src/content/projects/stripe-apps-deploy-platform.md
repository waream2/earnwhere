---
title: Stripe Apps Deploy Platform
summary: Deployment platform that turned a manual, multi-account Stripe Apps release process into a one-click operation.
date: 2026-04-29
category: professional
role: Architect and sole engineer
stack:
  - TypeScript
  - React
  - Express
  - Vite
  - Stripe UI Extension SDK
status: shipped
draft: false
---

## The problem

Stripe's developer tooling for Stripe Apps is built around a model where one engineer ships one app to one Stripe account. That model did not fit our business. We sell embedded products through Stripe Apps, and our model requires a separate Stripe App per tenant, each living in its own Stripe account, each branded for the tenant, but all sharing the same underlying configuration-driven onboarding and checkout codebase. The Stripe CLI does not provide a path for managing this fan-out cleanly. There is no concept of an app fleet, no notion of shared templates across accounts, and no built-in record of which version is deployed where.

The practical consequence was that every release became a manual ritual. To push an update to a single tenant, an engineer had to pull the latest product configuration, switch their local Stripe CLI to the tenant's account profile, run a sequence of update scripts, manually verify the build, and then run the deploy script. Performing that sequence for one tenant on one day was tolerable. Performing it across a growing roster of tenants, on demand, with no shared source of truth for what was deployed where, was not a workflow that would survive any meaningful scaling of the business.

I co-developed the underlying library that produces these apps, so the deployment problem landed on our two-person team by default. The work described in this post is the deploy platform I built to replace the manual ritual.

## The constraints

Three constraints shaped almost every design decision in the platform, and they pulled in different directions.

The first constraint is that Stripe's CLI must run on a developer's machine. The Stripe Apps upload command is not designed to be invoked from CI; it expects a local profile-aware CLI session with the right project profile selected for the target account. There is no documented path for orchestrating Stripe Apps deploys from a centralized server while still respecting per-tenant authentication. Whatever I built had to live on a laptop and treat the Stripe CLI as the deployment primitive rather than route around it.

The second constraint is that the team could never drift out of sync about the state of any deployed app. With multiple tenants and two environments per tenant, the question of which version is currently deployed to which tenant in which environment has to have a single authoritative answer at all times. If two engineers deploy concurrently, or if any engineer's local picture of the current version diverges from what is actually live, the platform fails at its first job. The system therefore needed a shared, durable source of truth that survived across machines and across sessions.

The third constraint is that the eventual operator of the system would not be an engineer. The platform exists today on a two-engineer team, but the broader goal is to move release control to operations and account management staff. That meant the user-facing surface had to abstract away CLI profiles, version files, and Stripe-internal vocabulary entirely. A non-technical operator should be able to look at a list of apps, pick an environment, and deploy without ever encountering an artifact that requires an engineering background to interpret.

## The approach

The first iteration of the platform was a set of CLI scripts that I ran from my own machine. They automated the mechanical steps of fetching configuration, hydrating the build directory, and invoking the Stripe CLI in the right order. They worked well enough for me, but they did not address either of the two harder constraints. They could not be operated by a non-technical user, and they offered no shared visibility into the state of the system. After spending enough time with the scripts to understand the real shape of the problem, I rebuilt them as a service with a UI on top.

The platform is structured as a monorepo with five top-level workspaces. The `template/` workspace contains the shared Stripe App codebase that every tenant app builds from. The `server/` workspace is the Express and TypeScript deploy service that orchestrates a release. The `client/` workspace is the React deploy manager UI. The `demo/` workspace is a runtime harness that renders any tenant configuration at runtime for development and review. The `data/` workspace is the persistent state of the system, including the registry of apps, snapshots of past builds, and cached configuration payloads.

A deploy is initiated from the React client and handled end-to-end by the Express server. On request, the server fetches the latest tenant product configuration from an internal API, hydrates a clean build workspace from the shared template, generates the tenant-specific artifacts (`config.js`, `stripe-app.json`, and `package.json`), invokes `stripe apps upload` with the correct `--project-name` profile for the target tenant, snapshots the resulting build into `data/builds/`, and commits and pushes the deploy record back to git. The React UI exposes one button per release. The operator picks an app, picks an environment (testing or production), and clicks deploy.

Several decisions in that pipeline were not the obvious default and warrant some explanation.

Versioning is automatic and asymmetric across environments. A testing deploy bumps the patch version; a production deploy bumps the minor version. Both bumps are computed from the highest known version across both environments rather than from the current environment alone. The effect is that the testing version always leads the production version by construction, which prevents a class of bug where an engineer ships a production version that is numerically behind a tested version. The alternative we considered was tracking versions per environment independently, which is simpler to implement but allows the two histories to drift in ways that are confusing to read after the fact.

The template's components are written to be agnostic about where their configuration comes from. The top-level page components all accept a `getConfig` function as a dependency rather than reaching into a fixed source. This abstraction is what allows the same component tree to power both the bundled tenant apps (where `getConfig` returns the configuration baked in at build time) and the runtime demo harness (where `getConfig` fetches an arbitrary tenant configuration by ID over the network). Without it, the demo harness would have required a parallel implementation of the onboarding surface, and the two implementations would have drifted within weeks.

The app registry lives in version-controlled JSON files at `data/apps/{configId}.json`, not in a database. Each file tracks the version history of the app, snapshots of past deploys, the cached configuration payload, and the per-tenant Stripe CLI project name. The decision to keep state in git rather than in a database came directly from the synchronization constraint. The same artifact that records what was deployed can be reviewed, diffed, and shared across machines via the same mechanism the engineering organization already uses for code. A database would have required a separate hosting and access-control story for a body of state that is small, infrequently written, and naturally fits a commit-history model.

Routing each deploy to the correct Stripe account is handled through the Stripe CLI's `--project-name` profile mechanism. The deploy server derives the correct profile from the tenant prefix embedded in the configuration ID, so the operator never selects an account directly. From the UI, the tenant is implicit in the app being deployed; from the CLI's perspective, the correct profile is always selected before upload.

## Tradeoffs

The most consequential tradeoff in the platform is its tight coupling to an internal component library that provides the building blocks the templates compose. Because the platform and the component library evolve together, the published npm version of the library is almost always behind what is in the sibling repository during active iteration. To make local development tolerable, the developer setup yarn-links the local component library checkout into both `demo/` and `template/`'s `node_modules`, and the deploy flow safely unlinks and restores the npm version before invoking the Stripe CLI. The alternative would have been to require a publish, bump, and redeploy cycle for every component-library change during template development, which would have made iteration prohibitively slow.

The cost of this design is a setup step that is easy to forget and easy to leave in a partial state. A developer who skips the link ends up debugging stale behavior in the template; a developer who skips the unlink-on-deploy can publish a build that depends on uncommitted local code. I mitigated the risk by writing agentic setup and deploy instructions into the project's tooling so that a developer's coding agent will not miss the link and unlink steps even if the human does. It remains a sharp edge in the design, and I chose to keep it because every alternative I evaluated produced a worse iteration loop.

The second tradeoff was more a constraint I accepted than a choice I made. The platform must run on a developer's laptop because the Stripe Apps CLI does not provide a clean path to running deploys from a server or a CI environment. As a result, there is no centralized audit log of who deployed what; the git history of `data/` is informative but not designed as a compliance artifact. For the platform's current phase this is acceptable, but it is the area of the design I would revisit first if Stripe ever opens a server-friendly path for Stripe Apps releases.

## Outcome

The platform delivered on its core promise. Before it existed, deploying an update to a single tenant required pulling the latest product configuration, authenticating into the tenant's Stripe account, running update scripts, manually verifying the build, and finally running the deploy script. After the platform shipped, the same operation is initiated from the deploy manager UI by selecting the app, selecting the environment, and clicking deploy. The full pipeline of fetching, hydrating, generating, uploading, snapshotting, and committing executes end-to-end without further human input.

The operational impact is that a release is no longer an engineering ritual. The cognitive overhead of remembering the right CLI profile, the right version file, and the right script invocation is gone, and the platform's git-backed registry gives the team a shared, browseable history of what is deployed where. The platform is the foundation that lets the company offer Stripe Apps as a product line at the pace of the business rather than at the pace of two engineers running scripts in sequence.

## Commentary

Building this platform sharpened my appreciation for DevOps as a discipline, and specifically for the work of building technical processes that non-technical operators can run safely. In retrospect, the hardest parts of the project were not the Express service or the version-bump logic. They were the design decisions that translated a domain expressed in CLI profiles, JSON manifests, and build directories into one navigable through a list of apps and a single button. The engineering challenge was making the system's surface area legible to someone who will never need to know what a `stripe-app.json` is, while keeping its internals honest enough that engineers could still reason about what the platform was doing under the hood.

The other lasting lesson is how much leverage comes from choosing the right unit of state. Keeping the app registry in version-controlled JSON files rather than in a database is the kind of decision that looks unserious from a distance and load-bearing up close. It eliminated an entire category of infrastructure work, gave the team a free audit trail, and aligned the platform's deploy artifacts with the conventions the engineering organization already used for code. A surprising fraction of the platform's reliability properties trace back to that single choice.
