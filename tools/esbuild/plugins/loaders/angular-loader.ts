import type { LoaderContext } from '@rspack/core';
import { AngularLoader, AngularSymbol } from '../utils/angular-symbol';

export function loader(
  this: LoaderContext<unknown> & {
    [AngularSymbol]?: AngularLoader;
  },
  content: string,
  map: string
) {
  const callback = this.async();
  const { typescriptFileCache, javascriptTransformer } = this[AngularSymbol];

  const request = this.resource;
  let contents = typescriptFileCache.get(request);
  if (contents === undefined) {
    callback(null);
  } else if (typeof contents === 'string') {
    javascriptTransformer
      .transformData(request, contents, true /* skipLinker */, false)
      .then((contents) => {
        // Store as the returned Uint8Array to allow caching the fully transformed code
        typescriptFileCache.set(request, contents);
        callback(null, Buffer.from(contents));
      });
  } else {
    callback(null, Buffer.from(contents));
  }
}
