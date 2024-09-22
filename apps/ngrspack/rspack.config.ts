import { createConfig } from '@ng-rspack/build';

export default () => createConfig({
  root: __dirname,
  name: 'ngrspack',
  main: './src/main.ts',
  index: './src/index.html',
  tsConfig: './tsconfig.app.json',
  outputPath: '../../dist/apps/ngrspack',
  styles: ['./src/styles.scss'],
  assets: ['./public'],
  polyfills: ['zone.js']
});
