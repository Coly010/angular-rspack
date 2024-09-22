# Nx Workspace containing an Angular application built with Rspack

Uses [@ng-rspack/build](https://www.npmjs.com/package/@ng-rspack/build).

- `myapp` contains an Angular application with 800 libraries, each with a single lib.
- Each lib is lazy-loaded via routing in the app
- To run: `cd apps/myapp` then `npx nx build-rs myapp`
