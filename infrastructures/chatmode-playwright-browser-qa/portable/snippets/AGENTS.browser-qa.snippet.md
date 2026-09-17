## Chat-mode browser QA startup rule

For any new frontend development or repair round that requires browser/UI validation:

1. restore the repository's real Git/GitHub/deployment state before changing product code;
2. if an unfrozen development round already exists and the request belongs to that same round, continue that branch;
3. otherwise create the new round from the repository's configured rolling development base, not from `main` and not directly from a frozen acceptance tag/branch;
4. require the candidate branch to inherit the Chat-mode Playwright browser QA workflow, runner, manifest/adapter contract, and branch-policy files;
5. create or update a Pull Request so GitHub Actions produces a Chat-readable browser QA run;
6. treat build, runtime, browser regression, Figma fidelity, responsive, accessibility and product-behavior evidence as separate gates;
7. read Actions run/job/log/artifact evidence after each meaningful frontend change and continue the same branch until the current round's required gates are satisfied;
8. never move, rewrite, or retarget a frozen acceptance ref to make QA pass;
9. after a formal round is frozen, advance the rolling development base only by fast-forward to the intended final round commit so the next round inherits both the newest product state and the permanent QA infrastructure.

The user should not need to remember or restate this branching/QA procedure for every round once it is installed in the target repository.
