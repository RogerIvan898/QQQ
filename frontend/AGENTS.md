# Frontend project instructions

These instructions apply to work in this repository. Read nested `AGENTS.md` files when working inside a subdirectory; more specific instructions take precedence for their scope.

## Project discovery

- Before coding, inspect the relevant package's `package.json`, lockfile, TypeScript config, scripts, and nearby implementation examples.
- This project uses React/TypeScript and Bun. Verify the actual role of Bun in this repository (package manager, runtime, test runner, or scripts) and inspect the installed dependencies before choosing tools. The project may also use Effector, FSD, or Vite; confirm each one rather than assuming it. Do not assume that every package or architecture convention applies everywhere in a monorepo.
- Preserve the existing architecture, naming, formatting, import, testing, and styling conventions unless they are demonstrably harmful or the task explicitly requests a change.
- Do not upgrade dependencies, edit lockfiles, or change compiler/build configuration unless the task requires it.

## Skills to use

Use the matching skill when the task falls within its scope:

- `$modern-react-engineer` for React components, Hooks, rendering, forms, async UI, Suspense, Actions, or React performance.
- `$typescript-engineer` for TypeScript design, generics, narrowing, React prop types, compiler errors, or type safety.
- `$frontend-architecture-review` for module boundaries, FSD (if present), Effector (if present), cross-module changes, architecture decisions, performance review, or code review.

Use only the skills relevant to the task. A small isolated change does not need all three.

## Current documentation and API selection

- Do not rely solely on model training knowledge for library-specific or version-sensitive API decisions.
- Check the installed package version first. When an API may have changed, retrieve current official documentation before implementing it. Prefer Context7 MCP when it is configured and available; otherwise use official documentation and installed type declarations.
- Verify that the chosen API exists in the installed version and is not deprecated. Do not copy examples written for a different major version without adapting them.
- Prefer current recommended APIs, not novelty. A newer API is not automatically the best solution for the task.
- Never claim that documentation, tests, lint, typecheck, or build were run unless they actually were.

## Code quality preferences

- Prefer minimal, direct, production-quality changes. Do not refactor unrelated code or introduce abstractions without a concrete benefit.
- Avoid `any`, unnecessary `as` assertions, nested ternaries, duplicated components, and overengineered abstractions.
- Do not generate unnecessary Effector boilerplate or move component-local state into a global store without a reason.
- Do not add `useMemo`, `useCallback`, or `React.memo` by habit. Check whether React Compiler is installed/enabled and whether there is a real performance or identity requirement.
- Prefer explicit, descriptive names and imports consistent with the codebase. Avoid unrelated formatting or import churn.
- Preserve existing user-facing behavior, accessibility, and responsive layout unless the task explicitly changes them.

## Verification

- Inspect `package.json` scripts and run the most relevant available tests/checks for the changed package.
- Prefer focused tests first; run typecheck, lint, or build when appropriate and feasible.
- Do not hide failures, weaken strict compiler/linter settings, or change tests merely to make the result appear green.
- In the final response, summarize the changes and state exactly which checks passed, failed, or were not run.


## Extensible Architecture & SOLID Principles

All new code must be designed with maintainability, extensibility and separation of concerns in mind.

Apply SOLID principles pragmatically, adapting them to React, TypeScript and frontend architecture.

### Single Responsibility Principle (SRP)

- Components, hooks, functions and modules should have one clear responsibility.
- Avoid large components that combine rendering, business logic, data fetching and complex state management.
- Extract independent business logic into dedicated modules.
- Separate UI concerns from domain logic when it improves maintainability.
- Avoid creating abstractions that only move code around without improving responsibility boundaries.

### Open/Closed Principle (OCP)

- Design modules so that common expected extensions do not require modifying unrelated existing code.
- Prefer composition, configuration and well-defined extension points.
- Use strategies, registries or polymorphism when there are genuinely multiple interchangeable behaviors.
- Avoid growing conditional logic when new behavior can be added through a stable extension point.
- Do not abstract hypothetical future requirements.

### Liskov Substitution Principle (LSP)

- Implementations of the same abstraction must preserve its expected behavior and contracts.
- Avoid implementations that require consumers to know about implementation-specific limitations.
- Keep component and function contracts predictable.
- Prefer explicit types that accurately represent supported behavior.

### Interface Segregation Principle (ISP)

- Keep component props, interfaces and function parameters focused.
- Avoid large interfaces that force consumers to depend on functionality they do not use.
- Prefer small, purpose-specific contracts.
- Avoid passing entire objects when only a few properties are required, unless the object represents a meaningful domain concept.

### Dependency Inversion Principle (DIP)

- High-level business logic should not depend directly on low-level implementation details.
- Isolate external APIs, browser APIs, storage and infrastructure behind clear boundaries when appropriate.
- Prefer dependency injection at meaningful architectural boundaries.
- Make business logic testable without requiring the real infrastructure.
- Do not introduce interfaces or dependency injection wrappers for trivial internal functions.

### Extensibility guidelines

- Prefer composition over inheritance.
- Keep modules loosely coupled and highly cohesive.
- Define clear public APIs for reusable modules.
- Keep implementation details private whenever possible.
- Prefer explicit dependencies over hidden coupling.
- Use TypeScript types to make invalid states difficult to represent.
- Prefer discriminated unions for complex state and behavior.
- Avoid boolean prop explosions and components with too many unrelated responsibilities.
- Make adding a new feature or behavior possible without unnecessary changes across unrelated modules.
- Preserve backward compatibility when modifying existing public APIs unless a breaking change is explicitly intended.

### Avoid overengineering

- Do not introduce abstractions without a real architectural reason.
- Do not create factories, strategies, interfaces or base classes merely to demonstrate SOLID.
- Do not generalize code based on hypothetical future requirements.
- Do not split small cohesive logic into excessive numbers of files.
- Prefer the simplest design that supports current requirements and reasonably foreseeable extensions.

### Before implementation

For non-trivial features:

1. Identify the main responsibilities and boundaries.
2. Identify which parts of the implementation are likely to change independently.
3. Determine whether composition, configuration or dependency inversion would improve extensibility.
4. Choose the simplest architecture that supports the expected extension points.
5. Ensure the design does not introduce unnecessary coupling or abstractions.

### During code review

Evaluate:

- SRP violations and oversized modules.
- Tight coupling between business logic and infrastructure.
- Components with excessive responsibilities or overly complex props.
- Duplicated behavior that should share a common abstraction.
- Conditional logic that makes adding new variants unnecessarily difficult.
- Abstractions that increase complexity without providing real flexibility.
- Changes that require modifying unrelated modules to introduce new functionality.

**### Law of Demeter (LoD) — Principle of Least Knowledge**

Minimize coupling by limiting how much one module knows about the internal structure of other modules and objects.

- Interact primarily with direct dependencies rather than navigating through multiple layers of unrelated objects.
- Avoid exposing or depending on internal implementation details of other modules.
- Prefer encapsulating domain behavior behind meaningful methods or public APIs instead of accessing deeply nested structures across module boundaries.
- Avoid long property chains that cross multiple ownership boundaries.
- Do not make components depend on the internal state or implementation details of other components.
- Prefer explicit module contracts over direct access to internal stores, events, effects, or implementation details.
- Isolate external API response structures at appropriate boundaries when their internal representation should not leak into domain logic.
- Avoid passing objects through multiple layers when those layers only need a specific value or behavior.

**### Avoid overapplying Law of Demeter**

- Do not treat every property chain as a violation.
- Accessing nested properties within a cohesive domain object is acceptable.
- Do not create wrapper methods solely to eliminate property chains.
- Do not introduce unnecessary abstractions or additional layers.
- Apply the principle when it reduces real coupling and hides implementation details.

**### During code review**

Evaluate:

- Excessive navigation across unrelated object or module boundaries.
- Components accessing internal implementation details of other components.
- Business logic depending on internal structures of unrelated modules.
- Unnecessary coupling to external API response formats.
- Direct access to internal Effector model state instead of using explicit model contracts.
- Abstractions introduced solely to hide harmless property access.

## Effector rules

- Calling `store.getState()` is prohibited in frontend code, including effect handlers, subscriptions, and React components. Imperative reads can race with store updates and read from the global store outside the active Effector Scope. In tests, use `scope.getState($store)` to assert state in the fork under test.
- Use `sample` with `source` to read stores when an event or effect triggers a flow. Use `attach` with `source` to pass store values into an effect at invocation time.
- Do not create, call, or bind Effector effects in React components. Do not access effect lifecycle units from components, including `walletModel.withdrawFx.pending` inside `useUnit`. Keep effects inside the model and use its public events and stores through `useUnit`, such as `withdrawRequested` and `$withdrawPending`.

**Prohibited imperative read**

```ts
const loadUserFx = createEffect((userId: string) => {
  const token = $token.getState();

  return api.getUser(userId, token);
});
```

**Read from the active scope with `attach`**

```ts
const loadUserFx = createEffect(
  ({ userId, token }: { userId: string; token: string }) =>
    api.getUser(userId, token)
);

const loadUserWithTokenFx = attach({
  source: $token,
  effect: loadUserFx,
  mapParams: (userId: string, token) => ({ userId, token }),
});
```

**Expose an explicit model contract**

```ts
// Wallet model
const withdrawFx = createEffect(walletApi.withdraw);

export const withdrawRequested = createEvent<WithdrawRequest>();
export const $withdrawPending = withdrawFx.pending;

sample({
  clock: withdrawRequested,
  target: withdrawFx,
});

// React component
const [requestWithdrawal, isWithdrawPending] = useUnit([
  walletModel.withdrawRequested,
  walletModel.$withdrawPending,
]);
```

[Effector best practices](https://effector.dev/en/guides/best-practices/#using-getstate) · [sample](https://effector.dev/en/api/effector/sample/) · [attach](https://effector.dev/en/api/effector/attach/)
