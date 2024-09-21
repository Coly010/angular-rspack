import { Configuration, DefinePlugin, HtmlRspackPlugin } from '@rspack/core';
import { resolve } from 'path';
import { workspaceRoot } from '@nx/devkit';
import { AngularRspackPlugin } from '@ng-rspack/build';

const config: Configuration = {
  context: __dirname,
  mode: 'development',
  cache: false,
  target: 'web',
  entry: {
    main: './src/main.ts',
    polyfills: ['zone.js'],
  },
  output: {
    uniqueName: 'ngrspack',
    hashFunction: 'xxhash64',
    clean: true,
    path: resolve(workspaceRoot, 'dist/apps/ngrspack'),
    filename: '[name].[contenthash:20].js',
    chunkFilename: '[name].[contenthash:20].js',
    crossOriginLoading: false,
    trustedTypes: 'angular#bundler',
    scriptType: 'module',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js'],
    modules: ['node_modules'],
    mainFields: ['es2020', 'es2015', 'browser', 'module', 'main'],
    conditionNames: ['es2020', 'es2015', '...'],
    tsConfig: resolve(__dirname, './tsconfig.app.json'),
  },
  optimization: {
    minimize: false,
  },
  module: {
    parser: {
      javascript: {
        requireContext: false,
        url: false,
      },
    },
    rules: [
      {
        test: /\.[cm]?[jt]sx?$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                },
              },
            },
          },
          {
            loader: require.resolve("@ng-rspack/build/src/lib/loaders/angular-loader.js"),
          },
        ],
      },
      {
        test: /\.[cm]?js$/,
        use: [
          {
            loader: require.resolve("@ng-rspack/build/src/lib/loaders/js-loader.js")
          },
        ],
      },
    ],
  },
  plugins: [
    new DefinePlugin({
      ngDevMode: 'false',
      ngJitMode: 'false',
    }),
    new HtmlRspackPlugin({
      minify: false,
      inject: 'body',
      scriptLoading: 'module',
      template: 'src/index.html',
    }),
    new AngularRspackPlugin({
      tsconfig: resolve(__dirname, './tsconfig.app.json'),
    }),
  ],
};

export default () => config;
