## Post-Implementation Workflow

After completing implementation:

1. Collect the exact list of files modified by the current task.
2. Delegate code quality verification and cleanup to `haiku-implementer`.
3. Pass the exact list of modified files to the subagent.
4. Let Haiku run ESLint, TypeScript checks, fix relevant issues and run tests.
5. Ask Haiku to create a separate Git commit after successful verification.
6. Review Haiku's report before finishing the task.

Do not skip this workflow after implementation unless explicitly instructed.
Do not invoke the agent while still in Plan Mode.
