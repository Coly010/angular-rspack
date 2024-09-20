
import * as path from 'path';
import type { LoaderContext } from '@rspack/core';
import { AngularPluginSymbol, FileEmitterCollection } from '@ngtools/webpack/src/ivy/symbol';

const JS_FILE_REGEXP = /\.[cm]?js$/;

export function angularWebpackLoader(this: LoaderContext<unknown>, content: string, map: string) {
  console.log(">>>DBG>>>", "Start Angular Webpack Loader")
  const callback = this.async();
  if (!callback) {
    throw new Error('Invalid webpack version');
  }

  const fileEmitter = (
    this as LoaderContext<unknown> & { [AngularPluginSymbol]?: FileEmitterCollection }
  )[AngularPluginSymbol];
  if (!fileEmitter || typeof fileEmitter !== 'object') {
    if (JS_FILE_REGEXP.test(this.resourcePath)) {
      // Passthrough for JS files when no plugin is used
      this.callback(undefined, content, map);

      return;
    }

    callback(new Error('The Angular Webpack loader requires the AngularWebpackPlugin.'));

    return;
  }

  fileEmitter
    .emit(this.resourcePath)
    .then((result) => {
      if (!result) {
        if (JS_FILE_REGEXP.test(this.resourcePath)) {
          // Return original content for JS files if not compiled by TypeScript ("allowJs")
          this.callback(undefined, content, map);
        } else {
          // File is not part of the compilation
          const message =
            `${this.resourcePath} is missing from the TypeScript compilation. ` +
            `Please make sure it is in your tsconfig via the 'files' or 'include' property.`;
          callback(new Error(message));
        }

        return;
      }

      result.dependencies.forEach((dependency) => this.addDependency(dependency));

      let resultContent = result.content || '';
      let resultMap;
      if (result.map) {
        resultContent = resultContent.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
        resultMap = JSON.parse(result.map) as Exclude<
          Parameters<typeof callback>[2],
          string | undefined
        >;
        resultMap.sources = resultMap.sources.map((source: string) =>
          path.join(path.dirname(this.resourcePath), source),
        );
      }

      callback(undefined, resultContent, resultMap);
    })
    .catch((err) => {
      // The below is needed to hide stacktraces from users.
      const message = err instanceof Error ? err.message : err;
      callback(new Error(message));
    });
  console.log(">>>DBG>>>", "End Angular Webpack Loader")
}

export { angularWebpackLoader as default };
