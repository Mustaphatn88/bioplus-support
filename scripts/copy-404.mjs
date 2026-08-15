import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

copyFileSync(join(root, 'dist', 'index.html'), join(root, 'dist', '404.html'));
console.log('404.html généré (fallback SPA GitHub Pages)');