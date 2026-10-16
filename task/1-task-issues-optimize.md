# Analysis: BUGS - ISSUES - OPTIMIZES

### CONSULT REFERENCES
@task/Architecture-context.md
@docs/adr -> IF OBSOLETE, DELETE AND REPLACE WITH NEW AGREEMENTS
@docs/internal/feature-backend.md
@docs/internal/frontend.md

Dead code refers to code that is never used.
ISSUES refer to code segments that overlap in terms of tasks or functions.

## BOUNDARIES
1. Zustand DOM: Overlapping tasks and variables.
2. Buffer: Overlapping asynchronous operations.

## Objectives
> 1: Build a robust and optimized system with clearly defined tasks and boundaries. optimization of state/buffer without being burdened by SLAs (Service Level Agreements) or the security demands of large-scale multi-tenancy.
> 2: Create a resilient system hierarchy that is easy to maintain and well-documented.
> 3: Ensure system robustness across all IDE workspace paths and platforms.

## THOUGHT PROCESS
1. Verification: Examine the backend API—is it serving a specific function? Is it used by the frontend? Is it relational? Can it be optimized? If the answer is no, it is classified as a BUG.
2. Validation: If it is in use, is it maintainable? Is it necessary for the long term? Does it align with the roadmap? Does it require optimization? If the answer is no, it is classified as a BUG.

## OUTPUT
0. Create a plan table at @/task named 'Table-Phase-Optimized.md'—include a relational table covering BUGS, code lines, functions, and descriptions.
1. Maintain an initialization log at @task/log-phase.md for relational tracking.

## STRATEGY
1. Delegate to a sub-agent for verification: Trace the API's execution path and define its boundaries.
2. Delegate to a validator once the verification phase is complete, following a linear regression approach. Using Backlog Thinking
3. Create a table map in @task using the file `pr-table-relational-opt.md`

## CONSTRAINTS
1. IF confidence is below 70%, ASK the user.
2. IF pragmatism is below 70%, ASK the user.