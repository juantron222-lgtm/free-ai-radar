import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tools = JSON.parse(readFileSync(resolve(__dirname, '../src/data/tools.json'), 'utf-8'));
const MAX = 49;

tools.forEach(tool => {
  const name = tool.name;
  const sub = tool.subcategory || '';
  const cat = tool.category || '';

  const withSub = sub ? (name + ': ' + sub) : null;
  const withCat = name + ': ' + cat;

  let title;
  if (withSub && withSub.length <= MAX) {
    title = withSub;
  } else if (withCat.length <= MAX) {
    title = withCat;
  } else {
    title = name;
  }

  const full = title + ' | Free AI Radar';
  console.log(full.length + 'ch | ' + full);
});
