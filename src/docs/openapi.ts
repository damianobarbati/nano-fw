import fs from 'node:fs';
import * as path from 'node:path';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import * as yaml from 'yaml';
import getPackage from '#framework/getPackage.ts';

const { pkg_name, pkg_version } = getPackage();

export const openapiRegistry = new OpenAPIRegistry();

export const writeOpenapiDoc = (openapiRegistry: OpenAPIRegistry, folderPath: string) => {
  const openapiSpec = generateOpenapiDoc(openapiRegistry, folderPath);
  const content = yaml.stringify(openapiSpec);
  fs.writeFileSync(`${folderPath}/openapi.yml`, content, { mode: 0o777, encoding: 'utf-8' });
};

export const generateOpenapiDoc = (openapiRegistry: OpenAPIRegistry, folderPath: string) => {
  const generator = new OpenApiGeneratorV3(openapiRegistry.definitions);

  // description will have the $include(path) directive for each .md file in folderPath, sorted
  const description = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => path.join(folderPath, file))
    .map((file) => `$include(${file})`)
    .join('\n');

  const openapi_doc = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: pkg_version,
      title: `${pkg_name} API reference`,
      description,
    },
  });

  // process $include(path) directive replacing the path with the content
  openapi_doc.info.description = openapi_doc.info.description?.trim().replaceAll(/ *?\$include\((.+)\)( +)?/g, (_match, path) => fs.readFileSync(path, 'utf8').trim());
  return openapi_doc;
};
