# Nx Workspace containing an Angular application built with Rspack

Pre-requisite: Need to update `@angular/build`'s `package.json` to add the following to the exports:
"./src/tools/esbuild/javascript-transformer": "./src/tools/esbuild/javascript-transformer.js",
"./src/tools/esbuild/angular/file-reference-tracker": "./src/tools/esbuild/angular/file-reference-tracker.js",
"./src/tools/angular/compilation/parallel-compilation": "./src/tools/angular/compilation/parallel-compilation.js",
