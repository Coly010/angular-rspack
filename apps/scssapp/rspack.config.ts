import {
  Compiler,
  Configuration,
  CopyRspackPlugin, CssExtractRspackPlugin,
  DefinePlugin,
  HtmlRspackPlugin,
  ProvidePlugin,
  SwcJsMinimizerRspackPlugin
} from '@rspack/core';
import { join, resolve } from 'path';
import { workspaceRoot } from '@nx/devkit';
import { createConfig } from '@ng-rspack/build';

// export class RxJsEsmResolutionPlugin {
//   apply(compiler: Compiler) {
//     compiler.hooks.thisCompilation.tap('PlUGIN', (compilation) => {
//       console.log(">>>DBG>>>", compilation.options.entry)
//     })
//   }
// }

// const config: Configuration = {
//   context: __dirname,
//   mode: 'production',
//   target: 'web',
//   cache: true,
//   entry: {
//     main: './src/main.ts',
//     polyfills: ['zone.js'],
//     styles: './src/styles.scss'
//   },
//   output: {
//     uniqueName: 'scssapp',
//     hashFunction: 'xxhash64',
//     publicPath: 'auto',
//     clean: true,
//     path: resolve(workspaceRoot, 'dist/apps/scssapp'),
//     cssFilename: '[name].[contenthash].css',
//     filename: '[name].[contenthash].js',
//     chunkFilename: '[name].[contenthash].js',
//     crossOriginLoading: false,
//     trustedTypes: 'angular#bundler',
//     scriptType: 'module',
//     module: true
//   },
//   resolve: {
//     extensions: ['.ts', '.tsx', '.mjs', '.js'],
//     modules: ['node_modules'],
//     mainFields: ['es2020', 'es2015', 'browser', 'module', 'main'],
//     conditionNames: ['es2020', 'es2015', '...'],
//     tsConfig: resolve(__dirname, './tsconfig.app.json'),
//   },
//   optimization: {
//     minimize: true,
//     runtimeChunk: 'single',
//     splitChunks: {
//       chunks: 'all',
//       minChunks: 1,
//       minSize: 20000,
//       maxAsyncRequests: 30,
//       maxInitialRequests: 30,
//       cacheGroups: {
//         defaultVendors: {
//           test: /[\\/]node_modules[\\/]/,
//           priority: -10,
//           reuseExistingChunk: true,
//         },
//         default: {
//           minChunks: 2,
//           priority: -20,
//           reuseExistingChunk: true,
//         },
//       },
//     },
//     minimizer: [new SwcJsMinimizerRspackPlugin()]
//   },
//   experiments: {
//     css: true
//   },
//   module: {
//     parser: {
//       javascript: {
//         requireContext: false,
//         url: false,
//       },
//       'css/auto': {
//         esModule: true
//       }
//     },
//     rules: [
//       {
//         test: /\.?(sa|sc|c)ss$/,
//         use: [
//           {
//             loader: 'sass-loader',
//             options: {
//               api: 'modern-compiler',
//               implementation: require.resolve('sass-embedded'),
//             },
//           },
//         ],
//         type: 'css/auto'
//       },
//       { test: /[/\\]rxjs[/\\]add[/\\].+\.js$/, sideEffects: true },
//       {
//         test: /\.[cm]?[jt]sx?$/,
//         use: [
//           {
//             loader: 'builtin:swc-loader',
//             options: {
//               jsc: {
//                 parser: {
//                   syntax: 'typescript',
//                 },
//               },
//             },
//           },
//           {
//             loader: require.resolve("@ng-rspack/build/src/lib/loaders/angular-loader.js"),
//           },
//         ],
//       },
//       {
//         test: /\.[cm]?js$/,
//         use: [
//           {
//             loader: require.resolve("@ng-rspack/build/src/lib/loaders/js-loader.js"),
//           },
//         ],
//       },
//     ],
//   },
//   plugins: [
//     new DefinePlugin({
//       ngDevMode: 'false',
//       ngJitMode: 'false',
//     }),
//     new CopyRspackPlugin({
//       patterns: [
//         {
//           from: 'public',
//           to: '.',
//           globOptions: {
//             dot: false,
//           },
//           noErrorOnMissing: true,
//         },
//       ],
//     }),
//     new HtmlRspackPlugin({
//       minify: false,
//       inject: 'body',
//       scriptLoading: 'module',
//       template: 'src/index.html',
//     }),
//     new RxJsEsmResolutionPlugin(),
//     new AngularRspackPlugin({
//       tsconfig: resolve(__dirname, './tsconfig.app.json'),
//     }),
//   ],
// };

export default () => createConfig({
  root: __dirname,
  name: 'scssapp',
  main: './src/main.ts',
  index: './src/index.html',
  tsConfig: './tsconfig.app.json',
  outputPath: '../../dist/apps/scssapp',
  styles: ['./src/styles.scss'],
  assets: ['./public'],
  polyfills: ['zone.js']
});
