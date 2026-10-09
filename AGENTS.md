# Working on this repository

Read `PROJECT_NOTES.md` before changing this project. It records the design, verified results, incomplete live test, and next-work options. Confirm relevant facts against current source and Git/run state; historical notes do not establish current authentication or successful review.

Update the notes when implementation decisions, validation results, or known limitations materially change. Preserve the distinction between real peer calls, fixture tests, and a completed council. Keep private run context and credentials out of this public repository.

For runtime or installer changes, run `npm test`. For documentation-only work, validate affected skill metadata and references without making unnecessary live model calls.

Published tags are immutable. Changes to packaged content require a new version; never retag a release with different files. Run `node .github/check-release.mjs` with tags available before publishing. Validate the candidate first, publish its exact commit/tag, then update installations from that release and verify the installed receipt. Development source copies are not proof that a public version exists.
