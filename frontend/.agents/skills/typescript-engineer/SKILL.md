---
name: typescript-engineer
description: Design, implement, refactor, or review TypeScript types and APIs in frontend code. Use for typing React props/hooks, domain models, async state, generics, type narrowing, compiler errors, or TypeScript safety.
---

# Senior TypeScript Engineer

Produce precise, maintainable types that model runtime behavior without making the code harder to use. Use the TypeScript version and compiler settings installed in the repository.

## Workflow

1. Read applicable `AGENTS.md` files and inspect nearby types and call sites.
2. Check the installed TypeScript version, `tsconfig` files, relevant package declarations, and lint rules. In a monorepo, identify the correct package and TypeScript project.
3. For version-sensitive language features or changed utility/library APIs, consult the current TypeScript handbook/release notes and confirm support in the installed compiler.
4. Model the actual runtime states and data boundaries before choosing a type.
5. Implement the narrowest type/API change that fixes the problem without spreading casts or weakening strictness.
6. Run the relevant typecheck and tests.

## Type design principles

- Prefer inference when the type is obvious and adding an annotation would only repeat information. Add explicit types at meaningful API boundaries and where they improve readability or prevent accidental widening.
- Prefer `unknown` over `any` for values whose shape is not yet trusted. Narrow or validate the value before using it.
- Avoid `any`, `as` assertions, non-null assertions, and double assertions as shortcuts. Use them only at a genuine boundary where the compiler cannot express a verified invariant; keep the escape hatch local and explain it.
- Prefer control-flow narrowing, discriminated unions, user-defined type guards, and runtime schema validation over assertions.
- Model mutually exclusive states with discriminated unions rather than several loosely related booleans or optional properties that allow impossible combinations.
- Use generics when they preserve a real relationship between input and output types. Avoid generic parameters that do not affect the public contract or merely make a simple function look sophisticated.
- Use generic constraints and defaults to express the minimum required contract. Do not over-constrain callers.
- Use `satisfies` when validating an object's shape while preserving its narrower inferred type, provided the installed TypeScript version supports it.
- Use utility types (`Pick`, `Omit`, `Partial`, `Record`, `ReturnType`, etc.) when they make the intent clearer. Avoid long nested utility-type expressions that are harder to understand than a named domain type.
- Keep domain types close to the domain/module that owns them. Do not create a global `types.ts` dumping ground.
- Prefer `type` or `interface` consistently with the project's conventions and the needs of the declaration; do not turn this into a style-only refactor.

## React and UI typing

- Type component props from the actual public contract. Extend the appropriate native element or library props when consumers should receive those capabilities; do not expose every underlying prop automatically.
- Prefer `PropsWithChildren` when a component intentionally accepts children and it matches the project's conventions. Do not add `children` when the component does not render them.
- Type event handlers from React/library types or infer them from the component API instead of manually recreating event structures.
- Preserve discriminated unions through callbacks and state transitions. Avoid widening literal values unnecessarily.
- For refs, use the ref types and patterns supported by the installed React version and the component contract.
- Avoid `React.FC` or other component typing conventions if the project has an established alternative; do not rewrite consistent existing code solely for preference.

## External data and runtime safety

- Types do not validate JSON, network responses, local storage, URL parameters, or user input at runtime.
- Treat external data as `unknown` until it is validated or safely parsed.
- Reuse the project's existing validation library and API response conventions. Do not add a runtime schema dependency for a single trivial check without a clear benefit.
- Represent expected failure states explicitly when they are part of the API contract; do not hide them with broad catches or unsafe casts.

## Compiler configuration

- Inspect the active `tsconfig` and build/test typechecking path before changing compiler options.
- Do not weaken `strict`, `noImplicitAny`, `strictNullChecks`, or other safety options to make a task compile.
- Do not enable new compiler flags across a large project as an unrelated cleanup. Explain the migration scope and fix resulting errors deliberately when asked.
- Use language features only when supported by the installed TypeScript version and all relevant tooling (transpiler, test runner, declarations, and consumers).

## Verification and response

- Run the correct package-level typecheck or `tsc --noEmit` command if that is how the repository validates types. Respect project references and monorepo scripts.
- Add tests for runtime type guards/parsers and state transitions when relevant; compile-time types alone are not runtime tests.
- Report remaining type escapes and why they are necessary. Do not claim type safety merely because a typecheck passed if external inputs remain unvalidated.
