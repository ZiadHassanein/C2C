# Existing sound plan

P1. Inspect the approve handler and the analogous reject handler's withAssignedEditorTransaction call; add a regression that a contributor is denied.
P2. Reuse withAssignedEditorTransaction for approve, performing the approval state write inside its callback. Preserve the transaction/lock boundary shared with revocation.
P3. Verify a current assigned editor succeeds, a different-project editor fails, and revocation racing approval is serialized. Check that approval alone does not publish the article. Propose these tests; do not claim they have already run.
P4. Roll out using the existing endpoint flag after these checks pass; revert the handler flag if approval failures rise. Keep recorded approvals and audit records intact on rollback.
