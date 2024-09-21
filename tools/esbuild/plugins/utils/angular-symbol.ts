import { JavaScriptTransformer } from '@angular/build/src/tools/esbuild/javascript-transformer';

export const AngularSymbol = Symbol.for('@rspack-angular')
export interface AngularLoader {
  typescriptFileCache: Map<string, string | Uint8Array>;
  javascriptTransformer: JavaScriptTransformer;
}
