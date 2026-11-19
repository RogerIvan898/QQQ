---
name: modern-react-engineer
description: Implement, refactor, debug, or explain React components, hooks, forms, async UI, rendering, and state. Use when a task involves React behavior or React APIs and the project needs version-aware, documentation-first implementation.
---

# Modern React Engineer

Write production React code for the version installed in this repository. Prefer current, officially recommended APIs, but never choose an API merely because it is newer.

## Workflow

1. Read the applicable `AGENTS.md` files and inspect nearby components/hooks before changing code.
2. Inspect `package.json` and the lockfile. Determine the installed `react`, `react-dom`, TypeScript, router, state, and UI-library versions relevant to the task. Do not infer versions from memory or from the latest online docs.
3. Identify the exact React feature or API needed. When API behavior, availability, or recommendation may have changed, look it up in the official React documentation. Prefer Context7 when its MCP tools are available; otherwise use the official documentation or the installed package's type declarations as a fallback.
4. Confirm that the API exists in the installed version. Check whether it is stable, experimental, deprecated, or restricted to a particular environment/build setup.
5. Implement the smallest complete solution consistent with the surrounding codebase.
6. Run the narrowest relevant tests and checks available in the repository.

If documentation lookup is unavailable, do not pretend it was performed. State the uncertainty and use the installed types and existing project patterns to avoid guessing.

## React API selection

- Follow the official Rules of React and Rules of Hooks. Call Hooks unconditionally at the top level of components or custom Hooks.
- Prefer deriving values during render over storing redundant state and synchronizing it with an Effect.
- Use `useEffect` to synchronize with external systems (for example, subscriptions, browser APIs, imperative widgets, or network connections), not as a general-purpose data-flow mechanism.
- Put user-triggered work in event handlers or the project's established action/model layer rather than triggering it indirectly through Effects.
- Use the state primitive that matches the problem: local component state for local UI state; the existing application state solution for shared/domain state. Do not introduce a second state-management approach without a concrete reason.
- Consider `useReducer` when local state transitions are related and complex; do not force it for trivial state.
- Consider React 19 APIs such as Actions, `useActionState`, `useOptimistic`, `use`, and `ref` as a prop only after verifying the installed React version and that the API fits the use case. Do not assume React 19 is installed.
- Use `forwardRef` or the newer `ref`-as-prop approach according to the installed React version and the component/library contract. Do not migrate unrelated components just to modernize syntax.
- Use `Suspense`, `useTransition`, and `useDeferredValue` when they solve a real loading, responsiveness, or rendering problem and the surrounding data/rendering setup supports them.
- Do not add a framework-specific pattern (Server Components, server actions, framework routing, etc.) to a plain client-side Vite app unless the project actually uses that framework.

## Rendering and performance

- First make rendering correct and easy to understand. Do not optimize by intuition alone.
- Check whether React Compiler is installed and enabled in the actual build. If it is enabled, do not add `useMemo`, `useCallback`, or `memo` mechanically; use manual memoization only when the compiler cannot cover the case or a documented identity contract requires it.
- If React Compiler is not enabled, still avoid blanket memoization. Use memoization when there is a measured/credible performance need or when stable identity is required by a specific API.
- Avoid effect-driven derived state, unnecessary state duplication, unstable keys, accidental remounts, and expensive work repeated on every render.
- For performance claims, inspect the component tree and relevant code; recommend profiling when measurements are needed. Do not claim a performance improvement without evidence.

## Component and Hook design

- Keep components focused on one coherent UI responsibility. Extract a component or custom Hook when it clarifies ownership, reuse, or testing—not merely to reduce line count.
- Keep component state close to where it is used unless multiple consumers genuinely need it.
- Keep custom Hooks focused on reusable stateful behavior. Do not create a Hook that only renames one built-in Hook without adding meaningful abstraction.
- Keep business rules out of presentational components when the repository has an established model/domain layer.
- Preserve accessibility: semantic HTML, labels, keyboard interaction, focus behavior, and accessible status/error announcements where relevant.
- Preserve existing styling conventions and component APIs. Do not introduce a new styling or form library for a small task.

## Effects, async work, and cleanup

- Define clear loading, success, empty, and error behavior when the UI needs those states.
- Handle stale requests, cancellation, subscriptions, timers, and event listeners when the lifecycle requires it.
- Do not suppress exhaustive-deps warnings merely to silence lint. Fix dependencies or restructure the logic; use a narrowly justified suppression only when the reason is documented.
- Do not make an Effect async directly. Use an inner async function or the project's established async abstraction when an Effect is genuinely required.

## Verification and response

- Run the relevant test file(s), typecheck, and lint commands when available. Inspect `package.json` scripts rather than inventing commands.
- If you changed behavior, add or update focused tests where the project has a test pattern.
- Report what changed and which checks actually ran. Clearly distinguish checks that passed, failed, or were not run.
