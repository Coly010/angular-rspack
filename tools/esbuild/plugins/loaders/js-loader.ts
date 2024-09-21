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
  const { javascriptTransformer } = this[AngularSymbol];

  const request = this.resource;
  javascriptTransformer
    .transformFile(request, false, false)
    .then((contents) => {
      callback(null, Buffer.from(contents));
    });
}
