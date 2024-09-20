import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from 'nx/src/utils/logger';
import { workspaceRoot } from '@nx/devkit';

const STARTING_LIB_INDEX = 0;
const NUMBER_OF_LIBS = 1000;
const APP_TO_ATTACH_LIBS = 'myapp';
const PATH_TO_PARENT_ROUTES = `apps/${APP_TO_ATTACH_LIBS}/src/app/app.routes.ts`;
const PATH_TO_APP_COMPONENT_TEMPLATE = `apps/${APP_TO_ATTACH_LIBS}/src/app/app.component.html`;
const OPTIONS_SELECTOR = `<!-- OPTIONS -->`;

function main() {
  const options: { name: string; route: string }[] = [];

  logger.info(`NX Generating Libraries...`);
  for (let i = STARTING_LIB_INDEX; i < NUMBER_OF_LIBS; i++) {
    const libName = `lib${i + 1}`;
    const command = `nx g @nx/angular:library ${libName} --directory=libs/${libName} --routing=true --parent=${PATH_TO_PARENT_ROUTES} --lazy --standalone --flat --projectNameAndRootFormat=as-provided --no-interactive`;
    execSync(`npx ${command}`, { stdio: 'ignore' });
    options.push({
      name: libName,
      route: libName,
    });
  }
  logger.info(`NX Successfully generated libraries`);
  logger.info(`NX Creating Route Selector...`);
  const appComponentContents = readFileSync(
    join(workspaceRoot, PATH_TO_APP_COMPONENT_TEMPLATE),
    'utf8'
  );
  const optionsStartingIndex =
    appComponentContents.indexOf(OPTIONS_SELECTOR) + OPTIONS_SELECTOR.length;
  const newAppComponentContents = `${appComponentContents.slice(
    0,
    optionsStartingIndex
  )}${options.reduce(
    (acc, o) => `${acc}<option value="${o.route}">${o.name}</option>\n`,
    ''
  )}${appComponentContents.slice(optionsStartingIndex)}`;
  writeFileSync(
    join(workspaceRoot, PATH_TO_APP_COMPONENT_TEMPLATE),
    newAppComponentContents
  );
  logger.info(`NX Successfully created route selector`);
}

main();
