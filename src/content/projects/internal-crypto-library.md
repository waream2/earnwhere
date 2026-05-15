---
title: An in-house cryptography library for partner integrations
summary: Building a TypeScript abstraction over Node's crypto module so any engineer on the team could ship encryption work for new partner integrations without having to learn the fragile details of authenticated encryption.
date: 2026-05-13
category: professional
role: Solo
stack:
  - TypeScript
  - Node.js
status: shipped
draft: false
---

## The problem

The original ticket was narrow. A partner needed to send us encrypted ACH payment data, and we needed to be able to decrypt it on receipt. That looked like a one-day task with Node's `crypto` module, and I started by prototyping the decryption path against the partner's expected configuration. As I worked through it, the shape of the larger problem became obvious. ACH was a new payment rail for the platform, and more partner integrations were already on the roadmap. Each partner that followed this one would almost certainly bring their own choices: a different cipher mode, a different IV length, their own approach to key derivation, their own preferred encoding for the ciphertext on the wire. None of those choices were known yet, but the probability that they would all match the first partner was effectively zero.

The team's familiarity with cryptography was thin. Only a few had done production crypto work before this, and Node's `crypto` API does not protect a caller from getting it subtly wrong. Forgetting to attach the auth tag in GCM, mishandling the IV across encrypt and decrypt calls, picking an encoding that silently corrupts the ciphertext on a round trip. Each of these is a footgun that produces code that works for one case and fails for another. The first partner would have been fine, because I would have learned the details and gotten it right once. The second, third, and fourth would have meant that each engineer picking up a partner integration also had to learn those details, find the right per-customer configuration buried somewhere in the codebase, and call the standard library correctly. The expected outcome of that path was a slow accumulation of slightly wrong crypto code spread across the application.

## The constraints

The ticket scope was decryption of one partner's ACH messages, on a deadline tied to a broader payments launch. The wider context, that more partners would arrive and that none of their crypto requirements were yet pinned down, was an inference rather than a stated requirement. I had to decide whether to invest engineering time in flexibility that I could not yet point to a second ticket for. Nobody pushed back when I made the call to build the library, but the time came out of the same sprint as the original ticket, and the bet was on my judgment.

The other constraint that mattered was the team's familiarity with cryptography. Whatever I built had to be usable by a teammate who did not want to learn what an initialization vector was, did not want to think about authenticated encryption, and just wanted to take a piece of ciphertext from a partner and turn it into a value the application could use. The API needed to make the simple case trivial and the wrong case hard to express, because a library that required its callers to already know cryptography would not have solved the actual problem.

## The approach

I built a TypeScript library that sits between application code and Node's `crypto` module. The public surface is four operations: encrypt a value to a string, decrypt a string back to a value, encrypt a JSON object to a file, and decrypt a file. A caller specifies the algorithm and the key, plus whatever the partner has dictated about parameters like auth tag length or IV length. Everything else, including IV generation, auth tag handling for AEAD modes, and the encoding scheme used to serialize ciphertext into a single string, the library handles internally and consistently across every algorithm it supports.

Underneath, the library is organized around an algorithm registry. Each supported cipher lives in its own module that knows how to encrypt and decrypt with that algorithm, and the registry maps algorithm names to those modules. The initial set covered six AES variants: 128-, 192-, and 256-bit keys in both GCM and CBC modes. Both AEAD and non-AEAD modes had to be supported because partner cryptography conventions vary, and the two paths have meaningfully different handling underneath. GCM requires generating and bundling an auth tag with the ciphertext; CBC has its own padding considerations and does not authenticate the ciphertext at all. The registry pattern meant that adding a new cipher meant writing one module and registering it, with no changes to the public API and no churn at the call sites. Optional password-and-salt key derivation was built in for partners who exchanged keys that way rather than as raw bytes.

The design decision I spent the most time on was which parameters to make configurable on the public surface and which to lock down inside the library. The algorithm, the key, and partner-mandated parameters like auth tag length and IV length are exposed, because any of those might be dictated by the other side of an integration. Output encoding is configurable so callers can produce hex or base64 ciphertext depending on what the partner expects. Key derivation from a password and salt is opt-in. Everything else, including how the IV is generated for a fresh encryption, how the auth tag is bundled into the output string, and the boundary between the header and the ciphertext, is fixed by the library and not exposed at all. The principle I settled on was that anything a partner could plausibly dictate had to be configurable, and anything that was an internal serialization concern had to be opaque. The reasoning was straightforward: the configurable surface is also the misconfigurable surface, and the smaller it is, the fewer ways a teammate can get it wrong.

The result was that the shape of a new partner integration changed. An engineer onboarding a new partner needed to know the partner's algorithm, key, and any partner-specified parameters, and could ignore the rest. They called one of the four operations, and the library either returned a value or failed loudly. The details that had been a footgun in Node's `crypto` API became internal implementation in the library, and the failure modes that came with mishandling those details disappeared from the application surface.

## Tradeoffs

The honest tradeoff was time. If I had implemented decryption against the first partner's exact configuration, I could have shipped the original ticket in roughly a day. Building the library took longer, and that time came out of a sprint where I had other work to deliver. I could not point to a second partner ticket to justify the investment at the time I made it. The bet was that the next partner integration would arrive before any of the speculative flexibility had become irrelevant, and that the time saved on that integration, plus the avoided risk of subtly wrong crypto code, would repay the up-front cost.

The other tradeoff, less visible at the time, was that the algorithm registry committed the team to maintaining a small internal cryptography library. That carries an ongoing cost. If Node's `crypto` API changes, if a supported algorithm is deprecated, if a new mode is added, those are changes I or someone after me has to make in our code rather than getting from a third-party dependency. I judged that an acceptable cost because the surface area is genuinely small and the alternative was a larger, less visible surface area scattered across the codebase. That judgment still feels right, but it is the kind of decision that quietly accumulates maintenance over years.

## Outcome

The library shipped with the first partner integration and was used unchanged for the ones that followed. Subsequent ACH integrations did not require new code in the library itself; they required only that the integrating engineer supply the partner's algorithm and key to the existing operations. The pluggable registry was there if a partner ever mandated a cipher outside the initial set, and that flexibility cost nothing to maintain while it was unused.

The outcome that I find most useful to point at is what changed for the team. Before the library, an encryption ticket on a partner integration would have flowed to whoever happened to have learned the most about Node's `crypto` module on a previous task, and the rest of the team would have approached the work cautiously. After the library, any engineer on the team could pick up a partner integration ticket and implement the crypto portion with the same confidence they would bring to any other piece of integration work. They did not need to learn cryptography to ship cryptography correctly. That was the explicit goal, and it is the part of the project I still consider the durable result.

## Commentary

When I started, I framed the work as a scaling investment. More partners, more cipher requirements, a library that could absorb whatever came next. That framing is true, but it is not the part that mattered most in practice. What actually changed was that cryptography stopped being a specialist concern on the team. The flexibility paid off, but it paid off in a way that was almost invisible: the team kept moving on partner integrations without slowing down to learn the parts of Node's `crypto` API that were easy to misuse, and that compounded faster than the original framing predicted.

The lesson I keep coming back to is about where to put the abstraction. The instinct on a narrow ticket is to solve the narrow problem and let the next ticket worry about itself. That instinct is usually right. It is wrong in domains where each subsequent caller is going to want a slightly different configuration and the cost of getting any one configuration wrong is high. Cryptography is one of those domains, and partner integrations are the canonical case. The work that looks like over-engineering on day one is the same work that, six months in, has turned a fragile and specialist task into a routine one.
