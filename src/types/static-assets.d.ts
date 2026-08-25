// Next generates `next-env.d.ts` at the repo root on `next dev` / `next build`,
// and that file is gitignored — so on a fresh CI checkout the static-image
// module declarations (`*.svg`, `*.png`, ...) do not exist and `pnpm typecheck`
// fails before anything has run a build.
//
// Re-declare the reference here, in a tracked file, so typechecking stands on
// its own. Deliberately omits the generated `.next/dev/types/*` imports that
// the root file also carries; those only exist after a dev/build run.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
