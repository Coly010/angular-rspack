import { Compilation, Compiler, RspackPluginInstance, } from '@rspack/core';
import {SyncHook} from '@rspack/lite-tapable';
import { JavaScriptTransformer } from '@angular/build/src/tools/esbuild/javascript-transformer';
import { FileReferenceTracker } from '@angular/build/src/tools/esbuild/angular/file-reference-tracker';
// import { ComponentStylesheetBundler } from '@angular/build/src/tools/esbuild/angular/component-stylesheets';
import { ParallelCompilation } from '@angular/build/src/tools/angular/compilation/parallel-compilation';
import { type AngularHostOptions } from '@angular/build/src/tools/angular/angular-host';
import { maxWorkers } from './utils/utils';
import { compile as sassCompile } from 'sass';
import { normalize } from 'path';
import { AngularLoader } from '@angular-rspack/tools/esbuild/plugins/utils/angular-symbol';
const {AngularSymbol} = require('./utils/dist/angular-symbol.js')

export class AngularRspackPlugin implements RspackPluginInstance {
  javascriptTransformer: JavaScriptTransformer;
  angularCompilation: ParallelCompilation;
  // stylesheetBundler: ComponentStylesheetBundler;
  referencedFileTracker: FileReferenceTracker;
  typeScriptFileCache: Map<string, string | Uint8Array>;
  tsconfig: string;

  constructor(options: { tsconfig: string }) {
    this.javascriptTransformer = new JavaScriptTransformer(
      {
        sourcemap: false,
        thirdPartySourcemaps: false,
        advancedOptimizations: false,
        jit: false,
      },
      maxWorkers
    );
    this.angularCompilation = new ParallelCompilation(false);
    this.referencedFileTracker = new FileReferenceTracker();
    this.typeScriptFileCache = new Map<string, string | Uint8Array>();
    this.tsconfig = options.tsconfig;
  }

  apply(compiler: Compiler) {
    compiler.hooks.beforeCompile.tapAsync(
      'AngularRspackPlugin',
      async (params, callback) => {
        let modifiedFiles;
        modifiedFiles = this.referencedFileTracker.update(new Set());
        // stylesheetBundler.invalidate(modifiedFiles);
        await this.angularCompilation.update(modifiedFiles);

        const hostOptions: AngularHostOptions = {
          modifiedFiles,
          async transformStylesheet(data, containingFile, stylesheetFile) {
            try {
              const result = sassCompile(stylesheetFile);
              return result.css;
            } catch (e) {
              console.error(
                `Failed to compile stylesheet ${stylesheetFile}`,
                e
              );
              return '';
            }
          },
          processWebWorker(workerFile, containingFile) {
            return workerFile;
          },
        };

        let referencedFiles;
        try {
          const initializationResult = await this.angularCompilation.initialize(
            this.tsconfig,
            hostOptions,
            (compilerOptions) => {
              compilerOptions.target = 9 /** ES2022 */;
              compilerOptions.useDefineForClassFields ??= false;
              compilerOptions.incremental = false; // Using cache - disabled for now
              return {
                ...compilerOptions,
                noEmitOnError: false,
                inlineSources: false,
                inlineSourceMap: false,
                sourceMap: undefined,
                mapRoot: undefined,
                sourceRoot: undefined,
                preserveSymlinks: false,
              };
            }
          );
          referencedFiles = initializationResult.referencedFiles;
        } catch (e) {
          console.error('Failed to initialize Angular Compilation', e);
        }

        try {
          for (const {
            filename,
            contents,
          } of await this.angularCompilation.emitAffectedFiles()) {
            this.typeScriptFileCache.set(normalize(filename), contents);
          }
        } catch (e) {
          console.log('Failed to emit files from Angular Compilation', e);
        }
        callback();
      }
    );

    compiler.hooks.compilation.tap('AngularRspackPlugin', (compilation) => {
      compilation['COLUM'] = {
        javascriptTransformer: this.javascriptTransformer,
        typescriptFileCache: this.typeScriptFileCache,
      }
    })
  }
}
