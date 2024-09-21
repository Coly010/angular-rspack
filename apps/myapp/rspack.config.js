import { composePlugins, withNx, withWeb } from '@nx/rspack';
import {
  HtmlRspackPlugin,
  CopyRspackPlugin, CssExtractRspackPlugin
} from '@rspack/core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lightningcss = require('lightningcss');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const browserslist = require('browserslist');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const terserPlugin =  require('terser-webpack-plugin');
import { AngularWebpackPlugin } from '@angular-rspack/tools/webpack/ivy';
import { DedupeModuleResolvePlugin } from '@angular-devkit/build-angular/src/tools/webpack/plugins/dedupe-module-resolve-plugin';
import { NamedChunksPlugin } from '@angular-devkit/build-angular/src/tools/webpack/plugins/named-chunks-plugin';
import { OccurrencesPlugin } from '@angular-devkit/build-angular/src/tools/webpack/plugins/occurrences-plugin';
import { ProgressPlugin } from '@rspack/core';
import {
  getSupportedBrowsers,
} from '@angular/build/private';
import {
  JavaScriptOptimizerPlugin,
} from '@angular-devkit/build-angular/src/tools/webpack/plugins/javascript-optimizer-plugin';
import {
  TransferSizePlugin,
} from '@angular-devkit/build-angular/src/tools/webpack/plugins/transfer-size-plugin';
import {
  CssOptimizerPlugin,
} from '@angular-devkit/build-angular/src/tools/webpack/plugins/css-optimizer-plugin';
import {resolve, join} from 'path';
import { workspaceRoot } from '@nx/devkit';

/**
 * Angular CLI Webpack references:
 *
 * - https://github.com/angular/angular-cli/blob/main/packages/angular_devkit/build_angular/src/tools/webpack/configs/common.ts
 * - https://github.com/angular/angular-cli/blob/main/packages/angular_devkit/build_angular/src/tools/webpack/configs/styles.ts
 */

const supportedBrowsers = getSupportedBrowsers();

process.env.RSPACK_PROFILE="TRACE=layer=logger";

module.exports = composePlugins(withNx(), withWeb(), (baseConfig, ctx) => {
  /**
   * @type {import('@rspack/cli').Configuration}
   */
  const config = {
    ...baseConfig,
    context: join(workspaceRoot, "apps/myapp"),

    mode: 'production',
    devtool: false,
    target: ['web', 'es2015'],
    entry: {
      polyfills: ['zone.js'],
      main: ['./src/main.ts'],
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js'],
      modules: ['node_modules'],
      mainFields: ['es2020', 'es2015', 'browser', 'module', 'main'],
      conditionNames: ['es2020', 'es2015', '...'],
      tsConfig: resolve(__dirname, './tsconfig.app.json'),
    },
    devServer: {
      client: {
        overlay: {
          errors: true,
          warnings: false,
          runtimeErrors: true,
        },
      },
    },
    node: false,
    output: {
      uniqueName: 'host',
      hashFunction: 'xxhash64',
      clean: true,
      path: resolve(workspaceRoot, ctx.options.outputPath),
      filename: '[name].[contenthash:20].js',
      chunkFilename: '[name].[contenthash:20].js',
      crossOriginLoading: false,
      trustedTypes: 'angular#bundler',
      scriptType: 'module',
    },
    watch: false,
    performance: { hints: false },
    experiments: {
      asyncWebAssembly: true,
      topLevelAwait: false,
      css: true,
    },
    module: {
      parser: {
        javascript: {
          requireContext: false,
          url: false,
        },
      },
      rules: [
        // Global assets
        // {
        //   test: /\.?(sa|sc|c)ss$/,
        //   resourceQuery: /\?ngGlobalStyle/,
        //   use: [
        //     {
        //       loader: 'sass-loader',
        //     },
        //   ],
        //   type: 'css',
        // },

        // Component templates
        {
          test: /\.?(svg|html)$/,
          resourceQuery: /\?ngResource/,
          type: 'asset/source',
        },
        // Component styles
        {
          test: /\.?(scss)$/,
          resourceQuery: /\?ngResource/,
          use: [
            {
              loader: require.resolve('raw-loader'),
            },
            {
              loader: 'sass-loader',
              // options: {
              //   api: 'modern-compiler',
              //   implementation: require.resolve('sass-embedded'),
              // },
            },
          ],
        },
        {
          test: /\.?(css)$/,
          resourceQuery: /\?ngResource/,
          use: [
            {
              loader: require.resolve('raw-loader'),
            },
            {
              loader: 'sass-loader',
              // options: {
              //   api: 'modern-compiler',
              //   implementation: require.resolve('sass-embedded'),
              // },
            },
          ],
        },
        {
          // Mark files inside `rxjs/add` as containing side effects.
          // If this is fixed upstream and the fixed version becomes the minimum
          // supported version, this can be removed.
          test: /[/\\]rxjs[/\\]add[/\\].+\.js$/,
          sideEffects: true,
        },
        {
          test: /\.[cm]?[tj]sx?$/,
          // The below is needed due to a bug in `@babel/runtime`. See: https://github.com/babel/babel/issues/12824
          resolve: { fullySpecified: false },
          exclude: [
            /[\\/]node_modules[/\\](?:core-js|@babel|tslib|web-animations-js|web-streams-polyfill|whatwg-url)[/\\]/,
          ],
          use: [
            {
              // loader: join(workspaceRoot, "tools/babel/rspack-loader.ts"),
              loader: require.resolve(
                '@angular-devkit/build-angular/src/tools/babel/webpack-loader.js'
              ),
              options: {
                cacheDirectory: false,
                aot: true,
                optimize: true,
                supportedBrowsers,
              },
            },
          ],
        },
        {
          test: /\.[cm]?tsx?$/,
          use: [
            // { loader: join(workspaceRoot, "tools/webpack/loader.ts") },
            {loader: require.resolve('@ngtools/webpack/src/ivy/index.js')}
          ],
          exclude: [
            /[\\/]node_modules[/\\](?:css-loader|mini-css-extract-plugin|webpack-dev-server|webpack)[/\\]/,
          ],
        },
      ],
    },
    optimization: {
      minimize: true,
      minimizer: [
        new JavaScriptOptimizerPlugin({
          advanced: true,
          define: {
            ngDevMode: false,
            ngI18nClosureMode: false,
            ngJitMode: false,
          },
          keepIdentifierNames: false,
          removeLicenses: true,
          sourcemap: false,
        }),
        new TransferSizePlugin(),
        new CssOptimizerPlugin(),
      ],
    },
    plugins: [
      new DedupeModuleResolvePlugin(),
      new NamedChunksPlugin(),
      new OccurrencesPlugin({
        aot: true,
        scriptsOptimization: false
      }),
      new StylesWebpackPlugin({
        root: __dirname,
        entryPoints: {
          styles: ['src/styles.css'],
        },
        preserveSymlinks: false,
      }),
      new CopyRspackPlugin({
        patterns: [
          {
            from: 'public',
            to: '.',
            globOptions: {
              dot: false,
            },
            noErrorOnMissing: true,
          },
        ],
      }),
      new ProgressPlugin({
        profile: false
        // profile: true
      }),
      new CssExtractRspackPlugin(),
      new HtmlRspackPlugin({
        minify: false,
        inject: 'body',
        scriptLoading: 'module',
        template: 'src/index.html',
      }),
      new AngularWebpackPlugin({
        tsconfig: resolve(__dirname, 'tsconfig.app.json'),
        emitClassMetadata: false,
        emitNgModuleScope: false,
        jitMode: false,
        fileReplacements: {},
        substitutions: {},
        directTemplateLoading: true,
        compilerOptions: {
          sourceMap: false,
          declaration: false,
          declarationMap: false,
          preserveSymlinks: false,
        },
        inlineStyleFileExtension: 'css',
      }),
    ],
  };

  return config;
});

/**
 * Ported from Angular CLI Webpack plugin.
 * https://github.com/angular/angular-cli/blob/main/packages/angular_devkit/build_angular/src/tools/webpack/plugins/styles-webpack-plugin.ts
 */
class StylesWebpackPlugin {
  options;
  compilation;
  constructor(options) {
    this.options = options;
  }
  apply(compiler) {
    const { entryPoints, preserveSymlinks, root } = this.options;
    const resolver = compiler.resolverFactory.get('loader', {
      conditionNames: ['sass', 'less', 'style'],
      mainFields: ['sass', 'less', 'style', 'main', '...'],
      extensions: ['.scss', '.sass', '.less', '.css'],
      // restrictions: [/\.((le|sa|sc|c)ss)$/i],
      preferRelative: true,
      useSyncFileSystemCalls: true,
      symlinks: !preserveSymlinks,
      fileSystem: compiler.inputFileSystem,
    });
    const webpackOptions = compiler.options;
    compiler.hooks.environment.tap('styles-webpack-plugin', () => {
      const entrypoints = webpackOptions.entry;
      for (const [bundleName, paths] of Object.entries(entryPoints)) {
        entrypoints[bundleName] ??= {};
        const entryImport = (entrypoints[bundleName].import ??= []);
        for (const path of paths) {
          try {
            const resolvedPath = resolver.resolveSync({}, root, path);
            if (resolvedPath) {
              entryImport.push(`${resolvedPath}?ngGlobalStyle`);
            } else {
              console.error('Compilation cannot be undefined.');
              throw new Error(`Cannot resolve '${path}'.`);
            }
          } catch (error) {
            console.error('Compilation cannot be undefined.');
            throw error;
          }
        }
      }
      return entrypoints;
    });
    compiler.hooks.thisCompilation.tap(
      'styles-webpack-plugin',
      (compilation) => {
        this.compilation = compilation;
      }
    );
  }
}
