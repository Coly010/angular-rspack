import type { CompilerHost, CompilerOptions, NgtscProgram } from '@angular/compiler-cli';
import { strict as assert } from 'assert';
import * as ts from 'typescript';
import type { Compilation, Compiler, Module, NormalModule } from '@rspack/core';
import { TypeScriptPathsPlugin } from './paths-plugin';
import { WebpackResourceLoader } from '@ngtools/webpack/src/resource_loader';
import { SourceFileCache } from '@ngtools/webpack/src/ivy/cache';
import {
  DiagnosticsReporter,
  addError,
  addWarning,
  createDiagnosticsReporter,
} from '@ngtools/webpack/src/ivy/diagnostics';
import {
  augmentHostWithCaching,
  augmentHostWithDependencyCollection,
  augmentHostWithReplacements,
  augmentHostWithResources,
  augmentHostWithSubstitutions,
  augmentProgramWithVersioning,
} from '@ngtools/webpack/src/ivy/host';
import { externalizePath, normalizePath } from '@ngtools/webpack/src/ivy/paths';
import { AngularPluginSymbol, EmitFileResult, FileEmitter, FileEmitterCollection } from '@ngtools/webpack/src/ivy/symbol';
import { InputFileSystemSync, createWebpackSystem } from '@ngtools/webpack/src/ivy/system';
import { createAotTransformers, createJitTransformers, mergeTransformers } from '@ngtools/webpack/src/ivy/transformation';

/**
 * The threshold used to determine whether Angular file diagnostics should optimize for full programs
 * or single files. If the number of affected files for a build is more than the threshold, full
 * program optimization will be used.
 */
const DIAGNOSTICS_AFFECTED_THRESHOLD = 1;

export const imageDomains = new Set<string>();

export interface AngularWebpackPluginOptions {
  tsconfig: string;
  compilerOptions?: CompilerOptions;
  fileReplacements: Record<string, string>;
  substitutions: Record<string, string>;
  directTemplateLoading: boolean;
  emitClassMetadata: boolean;
  emitNgModuleScope: boolean;
  emitSetClassDebugInfo?: boolean;
  jitMode: boolean;
  inlineStyleFileExtension?: string;
}

/**
 * The Angular compilation state that is maintained across each Webpack compilation.
 */
interface AngularCompilationState {
  resourceLoader?: WebpackResourceLoader;
  previousUnused?: Set<string>;
  pathsPlugin: TypeScriptPathsPlugin;
}

const PLUGIN_NAME = 'angular-compiler';
const compilationFileEmitters = new WeakMap<Compilation, FileEmitterCollection>();

interface FileEmitHistoryItem {
  length: number;
  hash: Uint8Array;
}

export class AngularWebpackPlugin {
  private readonly pluginOptions: AngularWebpackPluginOptions;
  private compilerCliModule?: typeof import('@angular/compiler-cli');
  private compilerCliToolingModule?: typeof import('@angular/compiler-cli/private/tooling');
  private watchMode?: boolean;
  private ngtscNextProgram?: NgtscProgram;
  private builder?: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  private sourceFileCache?: SourceFileCache;
  private webpackCache?: ReturnType<Compilation['getCache']>;
  private webpackCreateHash?: Compiler['webpack']['util']['createHash'];
  private readonly fileDependencies = new Map<string, Set<string>>();
  private readonly requiredFilesToEmit = new Set<string>();
  private readonly requiredFilesToEmitCache = new Map<string, EmitFileResult | undefined>();
  private readonly fileEmitHistory = new Map<string, FileEmitHistoryItem>();

  constructor(options: Partial<AngularWebpackPluginOptions> = {}) {
    this.pluginOptions = {
      emitClassMetadata: false,
      emitNgModuleScope: false,
      jitMode: false,
      fileReplacements: {},
      substitutions: {},
      directTemplateLoading: true,
      tsconfig: 'tsconfig.json',
      ...options,
    };
  }

  private get compilerCli(): typeof import('@angular/compiler-cli') {
    // The compilerCliModule field is guaranteed to be defined during a compilation
    // due to the `beforeCompile` hook. Usage of this property accessor prior to the
    // hook execution is an implementation error.
    assert.ok(this.compilerCliModule, `'@angular/compiler-cli' used prior to Webpack compilation.`);

    return this.compilerCliModule;
  }

  private get compilerCliTooling(): typeof import('@angular/compiler-cli/private/tooling') {
    // The compilerCliToolingModule field is guaranteed to be defined during a compilation
    // due to the `beforeCompile` hook. Usage of this property accessor prior to the
    // hook execution is an implementation error.
    assert.ok(
      this.compilerCliToolingModule,
      `'@angular/compiler-cli' used prior to Webpack compilation.`,
    );

    return this.compilerCliToolingModule;
  }

  get options(): AngularWebpackPluginOptions {
    return this.pluginOptions;
  }

  apply(compiler: Compiler): void {
    const { NormalModuleReplacementPlugin, WebpackError, util } = compiler.webpack;
    this.webpackCreateHash = util.createHash;

    // Setup file replacements with webpack
    for (const [key, value] of Object.entries(this.pluginOptions.fileReplacements)) {
      new NormalModuleReplacementPlugin(
        new RegExp('^' + key.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&') + '$'),
        value,
      ).apply(compiler);
    }

    // Set resolver options
    const pathsPlugin = new TypeScriptPathsPlugin();
    // compiler.hooks.afterResolvers.tap(PLUGIN_NAME, (compiler) => {
    //   const resolver = compiler.resolverFactory.get('normal');
    // compiler.hooks.compilation.tap('NxTsPaths', (compiler, {normalModuleFactory}) => {
    //   pathsPlugin.apply(normalModuleFactory, resolver);
    // })
    // });

    // Load the compiler-cli if not already available
    compiler.hooks.beforeCompile.tapPromise(PLUGIN_NAME, () => this.initializeCompilerCli());

    const compilationState: AngularCompilationState = { pathsPlugin };
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      console.log(">>>> DBG>>>> ", "apply Ivy thisCompilation")
      try {
        this.setupCompilation(compilation, compilationState);
      } catch (error) {
        console.log(">>> DBG >>>"," compilationhook Error");
        addError(
          compilation,
          `Failed to initialize Angular compilation - ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    });
  }

  private setupCompilation(compilation: Compilation, state: AngularCompilationState): void {
    const compiler = compilation.compiler;

    // Register plugin to ensure deterministic emit order in multi-plugin usage
    const emitRegistration = this.registerWithCompilation(compilation);
    this.watchMode = compiler.watchMode;

    // Initialize webpack cache
    if (!this.webpackCache && compilation.options.cache) {
      this.webpackCache = compilation.getCache(PLUGIN_NAME);
    }

    // Initialize the resource loader if not already setup
    console.log(">>>>DBG>>>", "BEFORE WEBPACK RESOURCE LOADER")
    if (!state.resourceLoader) {
      state.resourceLoader = new WebpackResourceLoader(this.watchMode);
    }

    // Setup and read TypeScript and Angular compiler configuration
    const { compilerOptions, rootNames, errors } = this.loadConfiguration();
    console.log(">>>>DBG>>>", "AFTER LOAD CONFIGURATION")
    // Create diagnostics reporter and report configuration file errors
    const diagnosticsReporter = createDiagnosticsReporter(compilation, (diagnostic) =>
      this.compilerCli.formatDiagnostics([diagnostic]),
    );
    diagnosticsReporter(errors);
    console.log(">>>>DBG>>>", "AFTER DIAGNOSTICS REPORTER")
    // Update TypeScript path mapping plugin with new configuration
    state.pathsPlugin.update(compilerOptions);
    console.log(">>>>DBG>>>", "UPDATE PATHS PLUGIN")
    // Create a Webpack-based TypeScript compiler host
    const system = createWebpackSystem(
      // Webpack lacks an InputFileSytem type definition with sync functions
      compiler.inputFileSystem as InputFileSystemSync,
      normalizePath(compiler.context),
    );
    console.log(">>>>DBG>>>", "AFTER CREATE SYSTEM")
    const host = ts.createIncrementalCompilerHost(compilerOptions, system);
    console.log(">>>>DBG>>>", "AFTER CREATE TS HOST")
    // Setup source file caching and reuse cache from previous compilation if present
    let cache = this.sourceFileCache;
    let changedFiles;
    if (cache) {
      changedFiles = new Set<string>();
      for (const changedFile of [
        ...(compiler.modifiedFiles ?? []),
        ...(compiler.removedFiles ?? []),
      ]) {
        const normalizedChangedFile = normalizePath(changedFile);
        // Invalidate file dependencies
        this.fileDependencies.delete(normalizedChangedFile);
        // Invalidate existing cache
        cache.invalidate(normalizedChangedFile);

        changedFiles.add(normalizedChangedFile);
      }
    } else {
      // Initialize a new cache
      cache = new SourceFileCache();
      // Only store cache if in watch mode
      if (this.watchMode) {
        this.sourceFileCache = cache;
      }
    }
    augmentHostWithCaching(host, cache);
    console.log(">>>>DBG>>>", "AFTER AUGMENT WITH CACHE");

    const moduleResolutionCache = ts.createModuleResolutionCache(
      host.getCurrentDirectory(),
      host.getCanonicalFileName.bind(host),
      compilerOptions,
    );
    console.log(">>>>DBG>>>", "AFTER TS MODULE RESOLUTION WITH CACHE");
    // Setup source file dependency collection
    augmentHostWithDependencyCollection(host, this.fileDependencies, moduleResolutionCache);

    // Setup resource loading
    state.resourceLoader.update(compilation, changedFiles);
    augmentHostWithResources(host, state.resourceLoader, {
      directTemplateLoading: this.pluginOptions.directTemplateLoading,
      inlineStyleFileExtension: this.pluginOptions.inlineStyleFileExtension,
    });
    console.log(">>>>DBG>>>", "AFTER RESOURCE LOADER UPDATE");

    // Setup source file adjustment options
    augmentHostWithReplacements(host, this.pluginOptions.fileReplacements, moduleResolutionCache);
    augmentHostWithSubstitutions(host, this.pluginOptions.substitutions);

    // Create the file emitter used by the webpack loader
    const { fileEmitter, builder, internalFiles } = this.pluginOptions.jitMode
      ? this.updateJitProgram(compilerOptions, rootNames, host, diagnosticsReporter)
      : this.updateAotProgram(
        compilerOptions,
        rootNames,
        host,
        diagnosticsReporter,
        state.resourceLoader,
      );

    console.log(">>>>DBG>>>", "AFTER GET FILE EMITTER AND BUILDER");

    // Set of files used during the unused TypeScript file analysis
    const currentUnused = new Set<string>();
    console.log(">>>>DBG>>>", "BEFORE GET SOURCE FILES");
    for (const sourceFile of builder.getSourceFiles()) {
      if (internalFiles?.has(sourceFile)) {
        continue;
      }

      // Ensure all program files are considered part of the compilation and will be watched.
      // Webpack does not normalize paths. Therefore, we need to normalize the path with FS seperators.
      compilation.fileDependencies.add(externalizePath(sourceFile.fileName));

      // Add all non-declaration files to the initial set of unused files. The set will be
      // analyzed and pruned after all Webpack modules are finished building.
      if (!sourceFile.isDeclarationFile) {
        currentUnused.add(normalizePath(sourceFile.fileName));
      }
    }
    console.log(">>>>DBG>>>", "AFTER GET SOURCE FILES");

    compilation.hooks.finishModules.tapPromise(PLUGIN_NAME, async (modules) => {
      console.log(">>>DBG>>>", "FINISH MODULES")
      // Rebuild any remaining AOT required modules
      await this.rebuildRequiredFiles(modules, compilation, fileEmitter);
      console.log(">>>DBG>>>", "FINISH MODULES 2")

      // Clear out the Webpack compilation to avoid an extra retaining reference
      state.resourceLoader?.clearParentCompilation();
      console.log(">>>DBG>>>", "FINISH MODULES 3")

      // Analyze program for unused files
      if (compilation.errors.length > 0) {
        return;
      }
      console.log(">>>DBG>>>", "FINISH MODULES 4")

      for (const webpackModule of modules) {
        const resource = (webpackModule as NormalModule).resource;
        if (resource) {
          this.markResourceUsed(normalizePath(resource), currentUnused);
        }
      }
      console.log(">>>DBG>>>", "FINISH MODULES 5a")

      for (const unused of currentUnused) {
        if (state.previousUnused?.has(unused)) {
          continue;
        }
        addWarning(
          compilation,
          `${unused} is part of the TypeScript compilation but it's unused.\n` +
          `Add only entry points to the 'files' or 'include' properties in your tsconfig.`,
        );
      }
      console.log(">>>DBG>>>", "FINISH MODULES 5b")

      state.previousUnused = currentUnused;
    });

    // Store file emitter for loader usage
    emitRegistration.update(fileEmitter);
    console.log(">>>DBG>>>", "End Setup Compilation")

  }

  private registerWithCompilation(compilation: Compilation) {
    console.log(">>>>DBG>>>", "START OF REGISTER WITH COMPILATION");
    let fileEmitters = compilationFileEmitters.get(compilation);
    if (!fileEmitters) {
      fileEmitters = new FileEmitterCollection();
      compilationFileEmitters.set(compilation, fileEmitters);
      compilation.compiler.rspack.NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (context) => {
          console.log(">>>DBG>>>", "REGISTER WITH COMPILATION", context.resourcePath)
          const loaderContext = context as typeof context & {
            [AngularPluginSymbol]?: FileEmitterCollection;
          };
          loaderContext[AngularPluginSymbol] = fileEmitters;
        },
      );
    }
    const emitRegistration = fileEmitters.register();
    console.log(">>>>DBG>>>", "END OF REGISTER WITH COMPILATION");
    return emitRegistration;
  }

  private markResourceUsed(normalizedResourcePath: string, currentUnused: Set<string>): void {
    if (!currentUnused.has(normalizedResourcePath)) {
      return;
    }

    currentUnused.delete(normalizedResourcePath);
    const dependencies = this.fileDependencies.get(normalizedResourcePath);
    if (!dependencies) {
      return;
    }
    for (const dependency of dependencies) {
      this.markResourceUsed(normalizePath(dependency), currentUnused);
    }
  }

  private async rebuildRequiredFiles(
    modules: Iterable<Module>,
    compilation: Compilation,
    fileEmitter: FileEmitter,
  ): Promise<void> {
    if (this.requiredFilesToEmit.size === 0) {

      console.log(">>>DBG>>>", "REBUILD NO FILES")
      return;
    }
    console.log(">>>DBG>>>", "REBUILD NEEDS DOING")
    const filesToRebuild = new Set<string>();
    for (const requiredFile of this.requiredFilesToEmit) {
      const history = await this.getFileEmitHistory(requiredFile);
      if (history) {
        const emitResult = await fileEmitter(requiredFile);
        if (
          emitResult?.content === undefined ||
          history.length !== emitResult.content.length ||
          emitResult.hash === undefined ||
          Buffer.compare(history.hash, emitResult.hash) !== 0
        ) {
          // New emit result is different so rebuild using new emit result
          this.requiredFilesToEmitCache.set(requiredFile, emitResult);
          filesToRebuild.add(requiredFile);
        }
      } else {
        // No emit history so rebuild
        filesToRebuild.add(requiredFile);
      }
    }

    if (filesToRebuild.size > 0) {
      const rebuild = (webpackModule: Module) =>
        new Promise<void>((resolve) => compilation.rebuildModule(webpackModule, () => resolve()));

      const modulesToRebuild = [];
      for (const webpackModule of modules) {
        const resource = (webpackModule as NormalModule).resource;
        if (resource && filesToRebuild.has(normalizePath(resource))) {
          modulesToRebuild.push(webpackModule);
        }
      }
      await Promise.all(modulesToRebuild.map((webpackModule) => rebuild(webpackModule)));
    }

    this.requiredFilesToEmit.clear();
    this.requiredFilesToEmitCache.clear();
    console.log(">>>DBG>>>", "REBUILD COMPLETE")

  }

  private loadConfiguration() {
    const {
      options: compilerOptions,
      rootNames,
      errors,
    } = this.compilerCli.readConfiguration(
      this.pluginOptions.tsconfig,
      this.pluginOptions.compilerOptions,
    );
    compilerOptions.noEmitOnError = false;
    compilerOptions.suppressOutputPathCheck = true;
    compilerOptions.outDir = undefined;
    compilerOptions.inlineSources = compilerOptions.sourceMap;
    compilerOptions.inlineSourceMap = false;
    compilerOptions.mapRoot = undefined;
    compilerOptions.sourceRoot = undefined;
    compilerOptions.allowEmptyCodegenFiles = false;
    compilerOptions.annotationsAs = 'decorators';
    compilerOptions.enableResourceInlining = false;

    return { compilerOptions, rootNames, errors };
  }

  private updateAotProgram(
    compilerOptions: CompilerOptions,
    rootNames: string[],
    host: CompilerHost,
    diagnosticsReporter: DiagnosticsReporter,
    resourceLoader: WebpackResourceLoader,
  ) {
    console.log(">>>>DBG>>>", "START OF UPDATE AOT");
    // Create the Angular specific program that contains the Angular compiler
    const angularProgram = new this.compilerCli.NgtscProgram(
      rootNames,
      compilerOptions,
      host,
      this.ngtscNextProgram,
    );
    const angularCompiler = angularProgram.compiler;

    // The `ignoreForEmit` return value can be safely ignored when emitting. Only files
    // that will be bundled (requested by Webpack) will be emitted. Combined with TypeScript's
    // eliding of type only imports, this will cause type only files to be automatically ignored.
    // Internal Angular type check files are also not resolvable by the bundler. Even if they
    // were somehow errantly imported, the bundler would error before an emit was attempted.
    // Diagnostics are still collected for all files which requires using `ignoreForDiagnostics`.
    const { ignoreForDiagnostics, ignoreForEmit } = angularCompiler;

    // SourceFile versions are required for builder programs.
    // The wrapped host inside NgtscProgram adds additional files that will not have versions.
    const typeScriptProgram = angularProgram.getTsProgram();
    augmentProgramWithVersioning(typeScriptProgram);

    let builder: ts.BuilderProgram | ts.EmitAndSemanticDiagnosticsBuilderProgram;
    if (this.watchMode) {
      builder = this.builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        typeScriptProgram,
        host,
        this.builder,
      );
      this.ngtscNextProgram = angularProgram;
    } else {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host);
    }

    // Update semantic diagnostics cache
    const affectedFiles = new Set<ts.SourceFile>();

    console.log(">>>DBG>>>", "AOT ABOUT TO CHECK BUILDER")
    // Analyze affected files when in watch mode for incremental type checking
    if ('getSemanticDiagnosticsOfNextAffectedFile' in builder) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        console.log(">>>DBG>>>", "AOT IN WHILE")
        const result = builder.getSemanticDiagnosticsOfNextAffectedFile(undefined, (sourceFile) => {
          console.log(">>>DBG>>>", "AOT Builder GET")
          // If the affected file is a TTC shim, add the shim's original source file.
          // This ensures that changes that affect TTC are typechecked even when the changes
          // are otherwise unrelated from a TS perspective and do not result in Ivy codegen changes.
          // For example, changing @Input property types of a directive used in another component's
          // template.
          if (
            ignoreForDiagnostics.has(sourceFile) &&
            sourceFile.fileName.endsWith('.ngtypecheck.ts')
          ) {
            // This file name conversion relies on internal compiler logic and should be converted
            // to an official method when available. 15 is length of `.ngtypecheck.ts`
            const originalFilename = sourceFile.fileName.slice(0, -15) + '.ts';
            const originalSourceFile = builder.getSourceFile(originalFilename);
            if (originalSourceFile) {
              affectedFiles.add(originalSourceFile);
            }
            console.log(">>>DBG>>>", "AOT PROGRAM TRUE")

            return true;
          }
          console.log(">>>DBG>>>", "AOT PROGRAM FALSE")
          return false;
        });

        if (!result) {
          console.log(">>>DBG>>>", "AOT PROGRAM BREAK")
          break;
        }
        console.log(">>>DBG>>>", "AOT PROGRAM FINISH", result)
        affectedFiles.add(result.affected as ts.SourceFile);
      }
    }
    console.log(">>>DBG>>>", "AOT AFTER BUILDER")

    // Collect program level diagnostics
    const diagnostics = [
      ...angularCompiler.getOptionDiagnostics(),
      ...builder.getOptionsDiagnostics(),
      ...builder.getGlobalDiagnostics(),
    ];
    diagnosticsReporter(diagnostics);

    // Collect source file specific diagnostics
    for (const sourceFile of builder.getSourceFiles()) {
      if (!ignoreForDiagnostics.has(sourceFile)) {
        diagnosticsReporter(builder.getSyntacticDiagnostics(sourceFile));
        diagnosticsReporter(builder.getSemanticDiagnostics(sourceFile));
      }
    }

    const transformers = createAotTransformers(builder, this.pluginOptions, imageDomains);

    const getDependencies = (sourceFile: ts.SourceFile) => {
      const dependencies = [];
      for (const resourcePath of angularCompiler.getResourceDependencies(sourceFile)) {
        dependencies.push(
          resourcePath,
          // Retrieve all dependencies of the resource (stylesheet imports, etc.)
          ...resourceLoader.getResourceDependencies(resourcePath),
        );
      }

      return dependencies;
    };

    // Required to support asynchronous resource loading
    // Must be done before creating transformers or getting template diagnostics
    const pendingAnalysis = angularCompiler
      .analyzeAsync()
      .then(() => {
        this.requiredFilesToEmit.clear();

        for (const sourceFile of builder.getSourceFiles()) {
          if (sourceFile.isDeclarationFile) {
            continue;
          }

          // Collect sources that are required to be emitted
          if (
            !ignoreForEmit.has(sourceFile) &&
            !angularCompiler.incrementalCompilation.safeToSkipEmit(sourceFile)
          ) {
            this.requiredFilesToEmit.add(normalizePath(sourceFile.fileName));

            // If required to emit, diagnostics may have also changed
            if (!ignoreForDiagnostics.has(sourceFile)) {
              affectedFiles.add(sourceFile);
            }
          } else if (
            this.sourceFileCache &&
            !affectedFiles.has(sourceFile) &&
            !ignoreForDiagnostics.has(sourceFile)
          ) {
            // Use cached Angular diagnostics for unchanged and unaffected files
            const angularDiagnostics = this.sourceFileCache.getAngularDiagnostics(sourceFile);
            if (angularDiagnostics) {
              diagnosticsReporter(angularDiagnostics);
            }
          }
        }

        // Collect new Angular diagnostics for files affected by changes
        const OptimizeFor = this.compilerCli.OptimizeFor;
        const optimizeDiagnosticsFor =
          affectedFiles.size <= DIAGNOSTICS_AFFECTED_THRESHOLD
            ? OptimizeFor.SingleFile
            : OptimizeFor.WholeProgram;
        for (const affectedFile of affectedFiles) {
          const angularDiagnostics = angularCompiler.getDiagnosticsForFile(
            affectedFile,
            optimizeDiagnosticsFor,
          );
          diagnosticsReporter(angularDiagnostics);
          this.sourceFileCache?.updateAngularDiagnostics(affectedFile, angularDiagnostics);
        }

        return {
          emitter: this.createFileEmitter(
            builder,
            mergeTransformers(angularCompiler.prepareEmit().transformers, transformers),
            getDependencies,
            (sourceFile) => {
              this.requiredFilesToEmit.delete(normalizePath(sourceFile.fileName));
              angularCompiler.incrementalCompilation.recordSuccessfulEmit(sourceFile);
            },
          ),
        };
      })
      .catch((err) => ({ errorMessage: err instanceof Error ? err.message : `${err}` }));

    const analyzingFileEmitter: FileEmitter = async (file) => {
      const analysis = await pendingAnalysis;

      if ('errorMessage' in analysis) {
        throw new Error(analysis.errorMessage);
      }

      return analysis.emitter(file);
    };
    console.log(">>>DBG>>>", "ANALYZE EMITTER")
    return {
      fileEmitter: analyzingFileEmitter,
      builder,
      internalFiles: ignoreForEmit,
    };
  }

  private updateJitProgram(
    compilerOptions: CompilerOptions,
    rootNames: readonly string[],
    host: CompilerHost,
    diagnosticsReporter: DiagnosticsReporter,
  ) {
    let builder;
    if (this.watchMode) {
      builder = this.builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        rootNames,
        compilerOptions,
        host,
        this.builder,
      );
    } else {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(rootNames, compilerOptions, host);
    }

    const diagnostics = [
      ...builder.getOptionsDiagnostics(),
      ...builder.getGlobalDiagnostics(),
      ...builder.getSyntacticDiagnostics(),
      // Gather incremental semantic diagnostics
      ...builder.getSemanticDiagnostics(),
    ];
    diagnosticsReporter(diagnostics);

    const transformers = createJitTransformers(builder, this.compilerCli, this.pluginOptions);

    return {
      fileEmitter: this.createFileEmitter(builder, transformers, () => []),
      builder,
      internalFiles: undefined,
    };
  }

  private createFileEmitter(
    program: ts.BuilderProgram,
    transformers: ts.CustomTransformers = {},
    getExtraDependencies: (sourceFile: ts.SourceFile) => Iterable<string>,
    onAfterEmit?: (sourceFile: ts.SourceFile) => void,
  ): FileEmitter {
    return async (file: string) => {
      const filePath = normalizePath(file);
      if (this.requiredFilesToEmitCache.has(filePath)) {
        return this.requiredFilesToEmitCache.get(filePath);
      }

      const sourceFile = program.getSourceFile(filePath);
      if (!sourceFile) {
        return undefined;
      }

      let content: string | undefined;
      let map: string | undefined;
      program.emit(
        sourceFile,
        (filename, data) => {
          if (filename.endsWith('.map')) {
            map = data;
          } else if (filename.endsWith('.js')) {
            content = data;
          }
        },
        undefined,
        undefined,
        transformers,
      );

      onAfterEmit?.(sourceFile);

      // Capture emit history info for Angular rebuild analysis
      const hash = content ? (await this.addFileEmitHistory(filePath, content)).hash : undefined;

      const dependencies = [
        ...(this.fileDependencies.get(filePath) || []),
        ...getExtraDependencies(sourceFile),
      ].map(externalizePath);

      return { content, map, dependencies, hash };
    };
  }

  private async initializeCompilerCli(): Promise<void> {
    // This uses a dynamic import to load `@angular/compiler-cli` which may be ESM.
    // CommonJS code can load ESM code via a dynamic import. Unfortunately, TypeScript
    // will currently, unconditionally downlevel dynamic import into a require call.
    // require calls cannot load ESM code and will result in a runtime error. To workaround
    // this, a Function constructor is used to prevent TypeScript from changing the dynamic import.
    // Once TypeScript provides support for keeping the dynamic import this workaround can
    // be dropped.
    this.compilerCliModule ??= await new Function(`return import('@angular/compiler-cli');`)();
    this.compilerCliToolingModule ??= await new Function(
      `return import('@angular/compiler-cli/private/tooling');`,
    )();
  }

  private async addFileEmitHistory(
    filePath: string,
    content: string,
  ): Promise<FileEmitHistoryItem> {
    assert.ok(this.webpackCreateHash, 'File emitter is used prior to Webpack compilation');

    const historyData: FileEmitHistoryItem = {
      length: content.length,
      hash: this.webpackCreateHash('xxhash64').update(content).digest() as Uint8Array,
    };

    if (this.webpackCache) {
      const history = await this.getFileEmitHistory(filePath);
      if (!history || Buffer.compare(history.hash, historyData.hash) !== 0) {
        // Hash doesn't match or item doesn't exist.
        await this.webpackCache.storePromise(filePath, null, historyData);
      }
    } else if (this.watchMode) {
      // The in memory file emit history is only required during watch mode.
      this.fileEmitHistory.set(filePath, historyData);
    }

    return historyData;
  }

  private async getFileEmitHistory(filePath: string): Promise<FileEmitHistoryItem | undefined> {
    return this.webpackCache
      ? this.webpackCache.getPromise<FileEmitHistoryItem | undefined>(filePath, null)
      : this.fileEmitHistory.get(filePath);
  }
}
