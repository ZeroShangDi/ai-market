#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadConfig, uploadAsset, queryAssets, exportManifest, exportRoutingMap, migrateAssets } from './core.mjs';

const args = process.argv.slice(2);
const command = args.shift();
const options = {};
const positional = [];
while (args.length) {
  const argument = args.shift();
  if (argument.startsWith('--')) {
    const key = argument.slice(2);
    if (!args.length || args[0].startsWith('--')) throw new Error(`${argument} 需要一个值`);
    if (options[key]) throw new Error(`选项重复: ${argument}`);
    options[key] = args.shift();
  } else positional.push(argument);
}
const help = `资源库（Node >= 22.13）
  node tools/assets/cli.mjs upload <image> --name mobile.cover --config tools/assets/asset-config.json
  node tools/assets/cli.mjs upload <image> --name mobile.cover --webp-width 720 --derived '{"thumb":"./thumb.png"}' --config <config>
  node tools/assets/cli.mjs import <batch.json> --config <config>
  node tools/assets/cli.mjs query [name] --config <config>
  node tools/assets/cli.mjs export --out <manifest.json> --config <config>
  node tools/assets/cli.mjs export-mapping --out <routing-map.json> --config <config>
  node tools/assets/cli.mjs migrate [name] --config <new-provider-config>
原图和版本清单统一保存在 library；自动生成 WebP 需安装可选 sharp。`;
try {
  if (!command || command === 'help') console.log(help);
  else {
    const allowed = {
      upload: ['config', 'name', 'category', 'webp-width', 'derived'],
      query: ['config'], import: ['config'], export: ['config', 'out'], 'export-mapping': ['config', 'out'], migrate: ['config']
    }[command];
    if (!allowed) throw new Error(`未知命令: ${command}`);
    for (const option of Object.keys(options)) {
      if (!allowed.includes(option)) throw new Error(`未知选项: --${option}`);
    }
    if (positional.length > (['export', 'export-mapping'].includes(command) ? 0 : 1)) throw new Error('位置参数过多');
    if (!options.config) throw new Error('需要 --config 配置，未配置时不会上传或生成假链接');
    const config = await loadConfig(options.config);
    let result;
    if (command === 'upload') {
      if (!positional[0] || !options.name) throw new Error('upload 需要文件和 --name');
      result = await uploadAsset(config, { file: positional[0], name: options.name, category: options.category, webpWidth: options['webp-width'], derived: options.derived ? JSON.parse(options.derived) : {} });
    } else if (command === 'query') result = await queryAssets(config, positional[0]);
    else if (command === 'import') {
      if (!positional[0]) throw new Error('import 需要批量清单 JSON 文件');
      const batchPath = resolve(positional[0]);
      const entries = JSON.parse(await readFile(batchPath, 'utf8'));
      if (!Array.isArray(entries)) throw new Error('批量清单必须为数组');
      result = [];
      for (const entry of entries) result.push(await uploadAsset(config, { ...entry, file: resolve(dirname(batchPath), entry.file), derived: Object.fromEntries(Object.entries(entry.derived || {}).map(([name, file]) => [name, resolve(dirname(batchPath), file)])) }));
    } else if (command === 'export' || command === 'export-mapping') {
      if (!options.out) throw new Error('export 需要 --out 输出文件');
      result = command === 'export' ? await exportManifest(config) : await exportRoutingMap(config);
      await writeFile(resolve(options.out), JSON.stringify(result, null, 2) + '\n');
    } else if (command === 'migrate') result = await migrateAssets(config, positional[0]);
    else throw new Error(`未知命令: ${command}`);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`资源操作失败: ${error.message}`);
  process.exitCode = 1;
}
