// Собирает тест в один HTML-файл для публикации как claude.ai Artifact.
// Запуск: VITE_PUBLIC_URL=<адрес артефакта> npm run build:artifact
// Без VITE_PUBLIC_URL ссылки-приглашения будут вести на внутренний адрес страницы.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'dist-artifact';
execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, { stdio: 'inherit', env: process.env });

const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`не найден ресурс ${re} в ${outDir}/index.html`);
  return fs.readFileSync(path.join(outDir, m[1].replace(/^\.\//, '')), 'utf8');
};
const js = asset(/<script[^>]+src="([^"]+\.js)"/).replace(/<\/script/gi, '<\\/script');
const css = asset(/<link[^>]+href="([^"]+\.css)"/);

const page = `<title>Тест совместимости</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
fs.writeFileSync(path.join(outDir, 'compatibility-test.html'), page);
console.log(`готово: ${outDir}/compatibility-test.html (${(page.length / 1024).toFixed(1)} КБ)`);
