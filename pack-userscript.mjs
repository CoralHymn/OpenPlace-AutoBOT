import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Config: which bots to convert
const BOTS = [
  { file: 'extension/bots/image.js', name: '骷髅打金服 图片绘制', desc: '根据图片自动绘制像素画' },
  { file: 'extension/bots/farm.js',  name: '骷髅打金服 自动农场', desc: '自动耕种刷经验' },
  { file: 'extension/bots/guard.js', name: '骷髅打金服 区域守护', desc: '保护并自动修复像素画' },
  { file: 'extension/bots/slave.js', name: '骷髅打金服 分布式协作', desc: '分布式协作绘制' },
];

const outDir = join(__dirname, 'userscripts');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const MATCH = 'https://wp.1515810.xyz/*';
const NAMESPACE = 'https://github.com/skeleton-gold-farm/autobot';

for (const bot of BOTS) {
  const srcPath = join(__dirname, bot.file);
  if (!existsSync(srcPath)) {
    console.log(`SKIP: ${bot.file} not found`);
    continue;
  }

  let code = readFileSync(srcPath, 'utf8');

  // Strip esbuild banner comment (first line)
  code = code.replace(/^\/\* .+ \*\/\n/, '');
  // Strip eslint-env and eslint-disable comments
  code = code.replace(/^\/\* eslint-.+ \*\/\n/gm, '');

  const header = `// ==UserScript==
// @name         ${bot.name}
// @namespace    ${NAMESPACE}
// @version      2.0.0
// @description  ${bot.desc}
// @author       Skeleton Gold Farm
// @match        ${MATCH}
// @grant        none
// @run-at       document-idle
// ==/UserScript==

`;

  const outName = bot.file.replace('extension/bots/', '').replace('.js', '.user.js');
  const outPath = join(outDir, outName);
  writeFileSync(outPath, header + code, 'utf8');
  console.log(`OK: ${outName}`);
}

console.log(`\nDone! Files in ${outDir}/`);
