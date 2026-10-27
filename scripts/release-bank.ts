// Записывает отпечатки текущей версии банка в src/questions/released.json (прежние версии не трогает).
// Запуск после того, как подняли version и добавили манифест: npx vite-node scripts/release-bank.ts
import fs from 'node:fs';
import { BANK_VERSION, FIRM, MANIFEST, QUESTIONS } from '../src/questions';
import { bankPrint, manifestPrint } from '../src/questions/fingerprint';

const P = 'src/questions/released.json';
const r = fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, 'utf8')) : { manifests: {}, bank: {} };
for (const v of Object.keys(MANIFEST).map(Number)) {
  const print = manifestPrint(MANIFEST, FIRM, v);
  if (r.manifests[v] && r.manifests[v] !== print) throw new Error(`v${v} уже выпущена с другим манифестом — заведите новую версию`);
  r.manifests[v] = print;
}
if (r.bank[BANK_VERSION]) throw new Error(`v${BANK_VERSION} уже выпущена — поднимите version в bank.json`);
r.bank[BANK_VERSION] = bankPrint(QUESTIONS);
fs.writeFileSync(P, JSON.stringify(r, null, 1) + '\n');
console.log(`записано: v${BANK_VERSION}, манифестов ${Object.keys(r.manifests).length}`);
