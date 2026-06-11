---
title: "Why the latest MCP release candidate is a big deal"
date: 2026-06-10
category: architecture
hook: "Why I think the next release candidate positions MCP for an even brighter future."
draft: false
---

There was a lot in the new MCP release candidate: a new Extensions framework, MCP Apps, Tasks, and better auth.

Those are genuinely exciting, and it's clear the team has been hard at work pushing the spec forward. But the real game changer was probably the most boring part.

**MCP core is now stateless.**

That is a much bigger deal than it sounds on the surface.

Consumers will never care about MCP, and they shouldn't have to. But the builders who want to put MCP-powered products in front of consumers absolutely care about whether they can operate it like normal infrastructure. Until now, they couldn't. The protocol wasn't designed for that kind of deployment.

If you have actually tried to run an MCP server for end consumers, one of the first production problems you hit is not a philosophical one. It's infrastructure.

Previous MCP versions assumed protocol-level session state. A client initialized a session, received an `Mcp-Session-Id`, and every subsequent request depended on that session. That's manageable when you're building a local developer tool, an internal prototype, or a controlled enterprise integration.

It gets ugly when you're building something that has to scale like a normal consumer-facing HTTP service.

I ran into this very quickly while designing and building my first MCP. Stateless behavior was not a nice-to-have. The server had to support real users hitting the system through normal cloud infrastructure: multiple instances, load balancing, retries, and unpredictable traffic patterns. Exactly what we're used to with traditional HTTP services.

But the protocol was not built that way. So the workaround stack became an entirely separate scope of work with the [infrastructure engineer on my team](https://alexstein.tech).

Our first approach was sticky sessions at the load balancer, routing each client back to the same server instance because the protocol session lived there. It worked, but it was brittle. It made deployments more fragile. It made scaling something we dreaded once the tool got past prototype. And it made failure recovery worse, because any instance-level problem became a session-level problem. At scale, that would not be tenable.

So we got rid of sticky routing by externalizing the session state instead. We moved it into DynamoDB so that any instance could serve any request. That solved the routing problem, but it came with its own tax: every time a client hit the MCP server, the application had to fetch session data, update state, write it back, and keep the whole thing coherent. The app code was no longer just handling tool calls. It was compensating for transport-level statefulness.

Admittedly, this was unfamiliar territory for me, having spent most of my career building RESTful APIs, which should always be stateless. It was clear MCP wasn't designed for this kind of application, and it felt like we were doing a lot of work just to make the protocol fit our use case.

**The new release candidate changes that.**

In the [2026-07-28 spec candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/#:~:text=The%20release%20candidate%20for%20the,and%20a%20formal%20deprecation%20policy.), the protocol-level handshake and session are gone. Requests carry the protocol version, method information, and client metadata directly, and a new `server/discover` method lets clients fetch server capabilities on demand. The old `Mcp-Session-Id` model is removed. A request can land on any server instance and still be handled correctly.

That means an MCP server can finally behave like a normal stateless HTTP service.

Put it behind a round-robin load balancer. Scale instances horizontally. Route by headers like `Mcp-Method`. Cache list responses using the new cache metadata. Trace requests through your existing observability stack.

_**Deploy and operate it using infrastructure patterns teams already understand.**_

This version of the spec would have deleted real architecture I've had to build for in the past. The session half of our DynamoDB usage goes away, along with the read-update-write choreography wrapped around every tool call, and the sticky-session phase we lived through would never have happened at all. What remains is an ordinary application datastore holding quotes keyed by explicit handles, which is exactly the kind of boring storage we already know how to operate. What's left to build is the part we actually wanted to build, which is the tools themselves.

This is the difference between MCP as a promising integration protocol and MCP as production infrastructure.

**Stateless protocol, stateful application**

Importantly, "stateless protocol" does not mean "stateless application." Applications still need state. Quotes in progress, shopping carts, workflows, long-running jobs, user-specific resources, and multi-step actions all still exist.

But that state now belongs in the application layer, where it should have been all along.

In our insurance MCP, a quoting flow would mint a `quote_id` when the user starts a quote, and the model would pass that handle back on every subsequent call: updating coverage, retrieving pricing, binding the policy. If a workflow starts a long-running job, return a task handle. The model threads the identifier through the conversation as a normal tool argument. That makes state explicit, inspectable, portable, and much easier to reason about than hidden transport session state.

This is also better for agents. When state lives as visible handles in tool results, the model can reason about it, pass it between steps, and decide which handle belongs to which action. It can compose workflows around visible state instead of relying on invisible session metadata managed somewhere below the application.

The spec itself leans into this pattern. Even the new multi round-trip request flow works by echoing an explicit `requestState` payload back and forth, so any instance can pick up a retry. The protocol is now practicing what it preaches: state in the payload, not in the transport.

**Why this matters**

I think the future of MCP servers goes beyond local utilities, internal demos, and dev tools. They will power consumer apps, vertical SaaS products, AI-native workflows, and agent-accessible services serving thousands or millions of end users.

For those builders, stateless core removes a whole category of infrastructure tax:

- No sticky-session dependency just to keep MCP working.
- No shared session store just to compensate for the protocol.
- No deep packet inspection at the gateway to understand what operation is happening.
- No long-lived connection assumption as the default way to coordinate state.

Instead, MCP sits naturally inside existing production systems: load balancers, API gateways, caches, tracing, auth, worker queues, and horizontally scaled services. And end consumers create a very different reliability bar than developer tools do. You need scale-out, retry safety, and deployability. You need boring infrastructure that we've spent years getting to scale.

Stateless MCP core is boring in exactly the right way. It takes something that previously required custom workaround architecture and moves it into the protocol design.

That is what mature infrastructure does: it makes the correct production path the default path.

**You don't have to wait for the spec**

The final spec doesn't land until July, and the v2 SDKs are still pre-alpha. But the architecture it points to is buildable today. The current v1 Streamable HTTP transport already supports running without protocol sessions, and the rest is application design: keep state out of the transport, hand the model explicit, typed handles, and back them with an ordinary datastore.

I packaged that pattern into an open-source starter, [stateless-mcp-starter](https://github.com/waream2/stateless-mcp-starter): an Express + TypeScript MCP server with no protocol session at all, explicit state handles, pluggable storage (memory, DynamoDB, or Postgres), and tenant-scoped auth context. It runs against today's clients on the production v1 SDK, and it's structured so the move to the stable v2 APIs is a transport swap, not a rewrite.

If you're starting an MCP server today that you anticipate scaling, start stateless now. The spec is about to agree with that decision.
