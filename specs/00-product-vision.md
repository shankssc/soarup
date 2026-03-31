# 00 — Product Vision
> **Status:** Living document · **Last updated:** 2025-03 · **Owner:** Suyash Chaudhary

---

## What is Stand-up Buddy?

Stand-up Buddy is an async-first standup platform for indie developers, small remote teams, and open-source contributors who want the awareness of a daily standup without the friction of a scheduled meeting.

Users submit a short voice note or text update once a day. Stand-up Buddy transcribes it, summarises it with AI, and delivers a clean digest to every team member — via email, Slack, or in-app — at a time that works for them.

---

## The problem

Daily standups exist to answer three questions: what did you do, what are you doing next, what's blocking you. Synchronous standups answer these questions at a cost — a fixed time slot that interrupts flow, excludes contributors across time zones, and produces no searchable record.

Existing async tools (Slack threads, Notion pages, Loom recordings) solve the scheduling problem but create a new one: updates are scattered, inconsistent, and easy to miss. Dedicated tools like Geekbot or Status Hero exist but are priced for enterprise and feel heavyweight for a team of three.

There is no well-designed, free-to-start, genuinely async standup tool built for the people who need it most: solo developers building in public, small distributed teams, and open-source project maintainers.

---

## Who is this for?

### Primary user — individual contributors
Solo developers and indie hackers who want a personal accountability log, a record of what they shipped, and a way to build in public.

### Secondary user — small teams (2–8 people)
Remote-first teams who want async awareness without a scheduled call. Startup squads, freelance collectives, open-source core teams.

### Out of scope (for now)
- Enterprise teams (50+ people)
- Formal project management (tickets, sprints, Gantt charts)
- Video standups

---

## Core value propositions

**For individuals:** A daily log that writes itself. Submit a voice note in 30 seconds, get a clean text summary you can share or reflect on later.

**For teams:** Everyone stays aware without anyone being blocked by a calendar invite. Digests arrive when you open your inbox, not when your timezone allows.

**For the open-source community:** A free tier that is actually generous, not a trial.

---

## Key principles

**Async by design.** No meeting, no required time slot, no real-time dependency. The product should work perfectly for a team spread across six time zones.

**Low friction above all else.** Submitting an update must take under 60 seconds. If it feels like a chore, users will stop. Every feature decision should be evaluated against this principle.

**AI that summarises, not generates.** The AI layer transcribes and condenses what the user actually said. It does not invent, embellish, or reframe. Users must recognise their own words in the summary.

**Team-ready from day one.** Even when used solo, the data model and infrastructure support multi-tenancy. Adding a second person to a workspace is a configuration change, not an architectural one.

**Production-grade or not at all.** Every feature ships with tests, types, and observability. No shortcuts that create debt.

---

## What Stand-up Buddy is not

- Not a project management tool. There are no tickets, sprints, or boards.
- Not a video tool. Audio-to-text is the pipeline; video is not on the roadmap.
- Not a real-time chat product. Slack and Discord exist.
- Not an enterprise compliance product. No SOC 2, no SSO on the free tier, no on-premise.

---

## Success metrics

| Metric | Target (12 months post-launch) |
|--------|-------------------------------|
| Weekly active users | 500+ |
| Avg. updates submitted per active user per week | 3+ |
| Update submission time (p95) | < 60 seconds |
| Digest open rate | > 40% |
| Free tier retention at 30 days | > 50% |

---

## Open questions (to revisit)

- What is the right free tier limit? (updates/month, team size, retention period)
- Should digests be opt-in or opt-out at the workspace level?
- Is Slack integration in scope for v1 or v2?
- Should individual users be able to make their log public (building in public feature)?
