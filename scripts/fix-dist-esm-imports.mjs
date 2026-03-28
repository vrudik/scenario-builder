/**
 * После `tsc` Node ESM не резолвит относительные импорты без расширения.
 * Для каждого файла в dist: дописываем `.js` или `/index.js` (barrel-папки).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

function fixRelativeImport(filePath, spec) {
  if (!spec.startsWith('.')) {
    return spec;
  }
  if (/\.[a-zA-Z0-9]+$/.test(spec)) {
    return spec;
  }
  const base = dirname(filePath);
  const abs = join(base, spec);
  if (existsSync(`${abs}.js`)) {
    return `${spec}.js`;
  }
  if (existsSync(join(abs, 'index.js'))) {
    return `${spec}/index.js`;
  }
  return `${spec}.js`;
}

function patchFile(filePath, src) {
  let s = src;

  s = s.replace(/\bfrom\s+(['"])(\.\.?[^'"]+)\1/g, (all, q, spec) => {
    return `from ${q}${fixRelativeImport(filePath, spec)}${q}`;
  });

  s = s.replace(/\bimport\s+(['"])(\.\.?[^'"]+)\1\s*;/g, (all, q, spec) => {
    return `import ${q}${fixRelativeImport(filePath, spec)}${q};`;
  });

  s = s.replace(/\bimport\s*\(\s*(['"])(\.\.?[^'"]+)\1\s*\)/g, (all, q, spec) => {
    return `import(${q}${fixRelativeImport(filePath, spec)}${q})`;
  });

  return s;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else if (e.name.endsWith('.js')) {
      const raw = await readFile(p, 'utf8');
      const next = patchFile(p, raw);
      if (next !== raw) {
        await writeFile(p, next);
      }
    }
  }
}

await walk(distDir);
