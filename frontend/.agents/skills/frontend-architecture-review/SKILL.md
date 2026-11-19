---
name: frontend-architecture-review
description: Design or review frontend architecture, state ownership, module boundaries, FSD structure, Effector flows (when used), performance, or code quality. Use when a task crosses components/modules or asks for an architectural review or refactor.
---

# Frontend Architecture & Review

Improve the codebase without imposing architecture for its own sake. Preserve the repository's existing conventions unless the task explicitly asks to change them.

## 1. Understand the codebase before deciding

1. Read applicable `AGENTS.md` files.
2. Inspect the package boundary, `package.json`, lockfile, TypeScript config, lint/test setup, and the files directly involved.
3. Identify the installed versions of React, TypeScript, relevant state-management libraries, and the actual build/test tools used by this package. Check `bun.lock`/`bun.lockb`, `bunfig.toml`, package scripts, and dependencies where present. Do not assume tools or libraries that are not evidenced by the repository.
4. Find the nearest examples of the same feature pattern and follow them unless they are demonstrably broken or deprecated.
5. Check current official documentation for version-sensitive APIs. Prefer Context7 if available; otherwise use official docs and the installed package types. Never claim documentation was checked if it was not.
6. State important assumptions briefly when the repository does not reveal the intended ownership or behavior.

## 2. Architecture principles

- Solve the requested problem at the narrowest correct boundary. Avoid broad refactors, new abstractions, dependencies, or architecture migrations unrelated to the task.
- Keep business logic, UI rendering, API access, and state ownership separated according to the conventions already used by the project.
- Avoid both extremes: do not duplicate substantial domain logic, but do not extract one-off code into a shared abstraction without a real reuse or ownership benefit.
- Keep state at the lowest layer that owns it. Share state only when multiple consumers or a cross-component workflow require it.
- Prefer explicit data flow and clear ownership over hidden coupling, global mutable state, event-bus shortcuts, or components that coordinate unrelated features.
- Avoid circular dependencies and deep imports that bypass the repository's public module boundaries.
- Do not add a layer, folder, service, hook, or wrapper merely to satisfy a diagram or naming convention.

## 3. Feature-Sliced Design (only when the repository uses FSD)

- First verify that the project actually follows FSD. Do not convert a non-FSD project or force every FSD layer into an existing codebase.
- Respect the standard layer direction: `app` → `pages` → `widgets` → `features` → `entities` → `shared` in terms of allowed imports flowing from higher layers to lower layers. A lower layer must not import from a higher layer.
- Slices on the same layer must not depend on each other. Move genuinely shared, lower-level behavior to an appropriate lower layer only when it is truly reusable and domain-appropriate.
- `app` and `shared` are not divided into business-domain slices in the standard model; other layers commonly are.
- Do not use the deprecated `processes` layer in new code.
- Use segments such as `ui`, `model`, `api`, and `lib` to express purpose. Avoid inventing segments that merely rename file types.
- Do not create `entities`, `features`, or `widgets` for speculative future reuse. Extract a slice when it represents a coherent domain concept or user-value interaction.
- Keep slice public APIs intentional and follow the repository's existing barrel/export convention. Do not create sprawling index files or introduce circular re-exports.
- Check the project's FSD/layer-boundary lint rules when available; do not assume visual folder placement proves the import graph is valid.

## 4. Effector (when installed and used by the project)

### Core principles

- Follow the installed Effector and `effector-react` versions and the local model conventions.
- Prefer declarative data flow. Use `sample` as the primary tool for connecting events, stores, and effects instead of imperative subscriptions and manual orchestration.
- Use stores to represent state, events to represent occurrences or commands, and effects to perform side effects such as network requests, browser API calls, and storage operations.
- Keep business logic in models rather than React components. Components should primarily render state and trigger model events/effects through `useUnit`.
- Keep models focused on a single domain responsibility and expose intentional public APIs. Avoid accessing another model's internal units directly.
- Initialize stores, events, effects, and their connections at module level. Do not create application model units dynamically during component rendering.

### Data flow and state

- Use `sample` to connect clocks, sources, filters, transformations, and targets. Prefer explicit data flow over imperative calls.
- Use `combine` for derived state instead of duplicating values across stores.
- Keep store state minimal and cohesive. Do not store values that can be derived from existing stores unless there is a concrete reason.
- Keep reducers, `sample` transformations, and other data-processing callbacks pure. Do not mutate store state or introduce side effects into them.
- Use `attach` when an effect needs to be configured with data from stores or when creating a reusable effect with a specific parameter contract.
- Avoid unnecessary intermediate events, stores, effects, and deeply nested `sample` chains. Keep the data flow readable.
- Avoid imperative state access through `$store.getState()` in business logic. Prefer `sample.source` to provide the required state to a clock-driven operation. Direct reads may be appropriate for debugging or narrowly justified integration code, but should not replace declarative data flow.
- Avoid using `watch` to implement business logic or connect application workflows. Use `sample` instead. Reserve `watch` for debugging, logging, observability, and narrowly justified integration points.
- Do not use `watch` as a substitute for store reducers, effect handlers, or explicit event connections.

### Effects and side effects

- Keep external operations inside effects: API requests, browser APIs, local storage, and other impure operations.
- Keep effect handlers focused on performing the operation. Move independent business transformations into pure functions or model logic when that improves clarity and testability.
- Handle effect lifecycle through its built-in units such as `.pending`, `.done`, `.fail`, `.doneData`, and `.failData` where appropriate.
- Prefer declarative effect connections through `sample` over manually invoking effects from subscriptions.
- Avoid configuring effect handlers through `.use()` in ordinary application code when the documented constructor/handler pattern is available.
- Do not introduce effects for synchronous pure computations that do not perform side effects.
- Avoid duplicating loading and error state when the effect's lifecycle units already provide the required information.

### React integration

- Prefer `useUnit` for binding stores, events, and effects to React components when supported by the installed version.
- Subscribe only to the state required by the component. Avoid subscribing to large combined stores when only a small part of the state is needed.
- Keep component-local UI state local when it does not belong to a shared domain model.
- Do not move every interaction or boolean flag into Effector. Use model units when state or behavior has meaningful shared ownership, lifecycle, or business significance.
- Avoid triggering business workflows through `watch` inside React components or using effects as a replacement for declarative model connections.

### Scope and testing

- Use `fork` and `allSettled` when tests require isolated state or controlled effect execution.
- Follow the project's existing testing conventions and installed Effector APIs.
- Keep tests independent. Avoid leaking global store state or relying on execution order.
- Do not introduce Scope-related complexity into ordinary application code without a concrete need.
- SSR is not used in this project; do not introduce SSR-specific architecture or dependencies.

### Architecture and maintainability

- Keep model boundaries explicit. Communicate through public events, stores, and effects rather than depending on another model's internal implementation.
- Avoid circular model dependencies and hidden coupling between unrelated features.
- Prefer a small number of cohesive models over one large global model or many tiny models with no independent responsibility.
- Do not create wrapper events, effects, or stores that add no meaningful abstraction or behavior.
- Follow the project's existing naming conventions for units (`$store`, `event`, `effectFx`, or the established alternative). Do not rename unrelated units.

## 5. Bun and quality gates

- Inspect `package.json` scripts, `bunfig.toml`, lockfile, and installed dependencies before running commands. Confirm whether Bun is used as the package manager, runtime, test runner, or for more than one role.
- If the project uses Bun's test runner, follow the installed Bun version and the project's existing `bun:test` patterns. Run focused tests with the repository's established script or command; do not substitute a different runner.
- If the project uses a different test runner despite using Bun as its package manager/runtime, follow the configured runner instead. Never infer the test runner from the presence of Bun alone.
- Check current official Bun documentation when relying on version-sensitive Bun APIs or test-runner behavior.
- Inspect Vite or other build tooling only if it is actually present in the package. Do not assume Bun replaces the bundler.
- Do not change build/test configuration to make a single test pass unless the configuration is genuinely the cause.
- Avoid flaky tests, arbitrary timeouts, shared mutable test state, and assertions that only mirror implementation details.
- Do not add dependencies for functionality already available in the stack.

## 6. Review workflow

When the task is a review:

1. Inspect the actual diff and relevant surrounding code. If no diff is available, clearly define the review scope before reading broadly.
2. Look for correctness regressions, broken state transitions, stale closures, race conditions, cleanup bugs, accessibility regressions, API/version mismatches, unsafe types, dependency-direction violations, and missing tests.
3. Check performance only where there is a credible issue; do not flag theoretical micro-optimizations as defects.
4. Report actionable findings only, sorted from highest to lowest severity. Each finding should include file/line, impact, and a concise reason.
5. Do not report formatting preferences, speculative risks, or issues that cannot be tied to the changed code. Do not silently edit files during a review-only task.

When the task is implementation, do not turn it into a full repository audit. Make the requested change, verify it, and mention only relevant follow-up risks.

## 7. Engineering preferences

- Prefer straightforward code and small, focused changes over clever abstractions or broad rewrites.
- Avoid `any`, unnecessary type assertions, nested ternaries, duplicated components, and chains of transformations that make data flow harder to read.
- Do not add `useMemo`/`useCallback` automatically. Check React Compiler configuration and actual identity/performance requirements first.
- Avoid unnecessary Effector boilerplate and unnecessary global state.
- Keep existing component layout and responsive behavior unless the task requests a UI redesign.
- Use descriptive names and preserve established module/export conventions.

## 8. Completion report

Summarize the implementation or review findings. List the exact tests/checks run and their outcomes. Separate verified problems from assumptions, and disclose checks that could not be run.