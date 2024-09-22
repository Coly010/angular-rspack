import { createConfig } from '@ng-rspack/build';

export default () => createConfig({
  root: __dirname,
  name: 'myapp',
  main: './src/main.ts',
  index: './src/index.html',
  tsConfig: './tsconfig.app.json',
  outputPath: '../../dist/apps/myapp',
  styles: ['./src/styles.scss'],
  assets: ['./public'],
  polyfills: ['zone.js']
});
