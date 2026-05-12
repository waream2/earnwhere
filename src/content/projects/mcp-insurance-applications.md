---
title: An MCP Server for Insurance Applications
summary: Wrapping our deterministic insurance application engine in an MCP server so an LLM agent could guide applicants through quoting, payment, and binding without fear of hallucinating the parts that have to be exact.
tldr: I wrapped our deterministic insurance application engine in an MCP server so an LLM agent could drive applicants through quoting, payment, and binding without being able to bypass the engine's rules. Most of the work was decoupling the engine from React into an embeddable library, designing a small tool surface around workflow verbs rather than engine primitives, and keeping LLM clients connected through asynchronous carrier quotes that outlast a normal tool call. The server runs in production across the company's product catalog and was the foundation of an enterprise contract that landed two months later. The pattern generalizes to any regulated domain with a strict system of record and a soft conversational layer; the engineering work is in defining the seam between them.
date: 2026-04-29
category: professional
role: Lead engineer, with our DevOps engineer on deployment
stack:
  - TypeScript
  - Node.js
  - Express
  - Model Context Protocol
  - AWS ECS Fargate
  - AWS Cognito
  - DynamoDB
  - MongoDB Atlas
  - Stripe
  - SST
  - Pulumi
status: shipped
draft: false
---

## The problem

Insurance is a legally strict domain. Policies are contracts, the questions on an application have specific regulatory weight, and a wrong answer is not a UX inconvenience but a compliance and underwriting problem. That strictness is exactly why our application flow was built on top of a deterministic engine: every field, every validation rule, every view transition, and every disqualification path was encoded in a system designed to never produce an answer the carrier had not sanctioned. The web application was a React surface sitting on top of that engine.

LLMs offered a new way to deliver that same flow. A conversational agent working alongside an applicant can fill the role a human broker traditionally fills, asking the right questions in the right order and steering toward a bindable policy. The opportunity was to scale that kind of guided experience to anyone who wanted to apply, without staffing it with humans. The risk was the obvious one. An LLM left to its own devices will happily invent fields, paraphrase legally binding questions, and confidently propose answers that no underwriter would accept.

I noticed that the deterministic engine and an LLM were a natural pairing rather than a conflict. The engine already encoded the parts that had to be exact. The LLM only needed to drive it. If the model never produced an answer that did not pass through the engine first, the strictness guarantees of the existing system carried over to the new surface, and the LLM was free to do the things it is genuinely good at, like phrasing a question naturally, summarizing progress, and answering a curious applicant's question about what a policy actually covers.

## The constraints

The most important constraint was inherited. The engine that I needed an LLM to drive was originally written as part of the React web application, with state and orchestration interleaved with React components. It could not be reached by anything that was not a React tree. Before I could expose it to an LLM, I had to decouple it from React and rewrite it as a plain TypeScript module with no rendering dependencies. That rewrite is its own story and is not the point of this post, but it is a real constraint on the timeline of this project, because nothing on the MCP side could be built until the engine was a library that could be embedded in a server process.

A second constraint was that whatever I built had to be agnostic across every insurance product the company sells. The deterministic engine itself is product-agnostic by design, but it would have been easy to bake product-specific assumptions into the MCP layer. Doing so would have produced a faster initial ship and a worse long-term system, because the value of the work was in delivering the same guided experience across the full catalog rather than for one flagship product.

The third constraint came from the runtime characteristics of MCP clients themselves. Insurance quoting is not always synchronous. Some carriers return a quote inline; others kick off an underwriting process and return the quote asynchronously, which means a tool call can sit waiting on a carrier for an uncomfortably long time. LLM clients have their own patience. If a tool call goes silent for too long, the client will time out and the agent will lose its place in the workflow. Anything I built had to keep those long-running calls alive without violating the MCP contract.

The last constraint was the one that made everything else matter. Insurance applications are legal contracts. There is no tolerance for an LLM to hallucinate a field, mistranslate a question, or paper over a disqualification. The system had to be designed so that the LLM could not, structurally, produce an outcome the engine would not have produced.

## The approach

The first version was the wrong version. I built the MCP server against a single insurance product, on the assumption that proving the pattern on one product would justify generalizing it. That was a product mistake more than a technical one. The value of the project was in the agnosticism, and a working demo wired to one product was not on a path to the system the company actually needed. I rewrote it product-agnostic, using the deterministic engine's existing product abstractions as the seam, and the rest of the design followed from that decision.

The server runs as a containerized Node and Express service on AWS ECS Fargate, fronted by an Application Load Balancer with sticky sessions. The deployment shape was a partnership with our DevOps engineer; I owned the application design and they owned the platform side, and the choices that touch both (sticky sessions, the auto-scaling profile, how a session's lifetime maps onto a task's lifetime) were made together. Each authenticated session gets its own MCP server instance and transport pair, with the deterministic engine loaded in-process and pinned to that session. The engine is not a remote service in this design. It is a library loaded into the same process as the MCP server, so a tool call can read and mutate session state without paying for a network hop and without worrying about cache coherence between the two. Sticky sessions on the ALB keep an applicant pinned to the same task, which keeps the in-process engine state authoritative for the duration of a session.

The tool surface is deliberately small and shaped around the verbs the LLM actually needs to drive an insurance application end to end, not around the primitives of the engine underneath. There is a tool for retrieval over policy documents, used when an applicant asks what a policy actually covers. There is a tool for collecting application data, where the LLM submits values for one or more fields and the engine returns the next prompt, the next view, or a disqualification. There is a tool for summarizing progress so the LLM can ground itself before continuing. There is a tool for creating a Stripe checkout session once a quote is accepted. And there is a tool for binding the policy and writing the result back to the company's core system.

Choosing this partition was the design decision I went back and forth on the most. A finer-grained surface (one tool per engine primitive: read field, write field, advance view, validate, disqualify) is closer to the engine's actual API and easier to implement, but it forces the LLM to compose every multi-step action itself, which makes traces noisier and gives the model more rope to misuse. A coarser surface, organized around the workflow phases an applicant moves through, lets the engine handle the orchestration the model does not need to think about. The engine already encodes which fields are visible, when a view should auto-advance, and when a disqualification fires. Exposing the engine through workflow-shaped tools meant the LLM could call a small number of intuitive verbs and the engine would silently do the right thing underneath.

For asynchronous quoting, the model would otherwise have to either block its tool call indefinitely or poll on its own and lose the action context between calls. Neither is correct. The server polls the carrier itself and emits keepalive heartbeats to the client at ten-second intervals, so the connection stays open and the tool call returns when the quote is actually ready. When the carrier responds, the server replays the quote-trigger action through the engine so the engine's state advances exactly as it would have if the quote had returned synchronously. From the LLM's perspective it called one tool and got one answer. From the engine's perspective the right action fired at the right time with the right inputs. The complexity of bridging the two lives in the server.

The retrieval tool is a thin layer over MongoDB Atlas vector search. Policy documents are embedded with Voyage Embed Models, indexed in Atlas, and queried with a similarity threshold so that questions outside the policy's coverage return nothing rather than a confident hallucination. The threshold is not just a relevance filter. It is the structural guarantee that the LLM cannot answer a coverage question on top of a weakly related passage, because the tool gives it nothing to answer from.

Authentication and authorization are designed so that the LLM is not a privileged actor in the system. Every endpoint on the server verifies a Cognito JWT before any tool can run, which means an MCP session inherits the same identity guarantees as the rest of the platform. The LLM cannot escalate by calling a tool; it can only act on behalf of the applicant whose token initiated the session. Payment follows the same principle. Stripe's two-phase checkout lets the binding tool hand the applicant off to a hosted page without the model ever touching card data, which keeps the LLM out of the part of the flow that has the strictest compliance surface. The point of these choices is not the AWS primitives themselves. It is that the MCP layer is the only thing the LLM can see, and everything sensitive lives on the other side of that boundary.

## Tradeoffs

The most honest tradeoff is that going product-agnostic cost us product-specific affordances. A flow built for one product can lean on every quirk and shortcut that product allows. It can pre-fill, it can collapse, it can take the shape of the underwriting story for that one carrier. The agnostic system cannot. It has to express itself in terms the engine supports across the whole catalog, and any feature that does not generalize cannot ship inside it. We lost a small number of nice-to-haves that existed in the bespoke per-product flows, and the cost of getting those back is now the cost of generalizing them through the engine rather than implementing them in one place.

The second tradeoff is that the abstraction was much harder to develop than a bespoke version would have been. Every tool had to be designed to work without knowledge of which product it was operating on, which means the engine had to expose enough generality to absorb the differences between products without leaking them out to the LLM. That work pays back over the catalog, but it is a slower path to the first shipped feature than a single-product implementation would have been.

## Outcome

The MCP server runs in production on the auto-scaling ECS Fargate fleet and serves the AI-guided application surface across the company's product catalog. It is the first LLM-native application experience the company has shipped, and the first time the deterministic engine has been exposed to a non-React caller in production.

The business outcome arrived faster than I expected. The MVP went from a sidequest into a production system, and within two months of building the MVP the company landed an enterprise contract on the strength of the AI-native offering it enabled. The deal would not have existed without the surface this server provides, because the value being sold was the ability for a carrier partner to plug into a conversational application experience that was both LLM-driven and underwriting-safe.

The technical outcome that I find most useful to point at is what does not happen anymore. The LLM cannot, by construction, advance an applicant past a disqualification, propose a value for a field that does not exist, or produce a quote the carrier has not sanctioned. Those guarantees are not in the prompt. They are in the engine the prompt is calling, and that is the entire reason the project was worth building.

## Commentary

This was my first applied AI project, and it became the project I built a job around. Years of curiosity about AI compounded into a real production system that is now a category of work the company funds. The role of Applied AI Engineer did not exist before this project. I built it as a sidequest, shipped it as a system, and then stepped into the role it created.

The lesson I keep coming back to is that the best place to put an LLM is in front of something that is already correct. Most of the failure modes people worry about with LLMs in regulated domains do not show up if the model can only act through a layer that already enforces the rules. The work was not in making the LLM smart. It was in making the seam between the LLM and the deterministic engine narrow enough that the LLM could not reach around it. That insight is portable. Any domain with a strict system of record and a soft conversational frontier wants this shape, and most of the engineering effort in any given instance will be in defining the seam precisely.

The other lesson is about initiative. The project I am proudest of at this company started as something nobody asked me to build. I had a hunch that the engine and the model belonged together, I prototyped enough to test the hunch, and the prototype turned into a category of revenue and a job title. I would not have predicted any of that on the day I started writing it.
