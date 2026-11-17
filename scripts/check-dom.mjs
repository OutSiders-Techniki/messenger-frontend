// Проверка безопасного вывода (MSG-49): в коде клиента нет способов
// вставить строку как HTML. Текст сообщений и ID попадают в страницу
// только текстовыми узлами через h() из src/ui/dom.js.
//
//   npm run check:dom

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /insertAdjacentHTML\s*\(/,
  /document\.write(ln)?\s*\(/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /createContextualFragment\s*\(/,
];

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.endsWith('.js')) yield path;
  }
}

let problems = 0;
for await (const file of files(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//')) return;
    for (const pattern of FORBIDDEN) {
      if (pattern.test(line)) {
        console.error(`${file}:${i + 1}: ${line.trim()}`);
        problems += 1;
      }
    }
  });
}

if (problems) {
  console.error(`\nНайдено опасных вставок HTML: ${problems}`);
  process.exit(1);
}
console.log('OK: вставки HTML не найдены');
