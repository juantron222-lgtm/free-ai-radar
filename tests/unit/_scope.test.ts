import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { superficiesDe } from '@lib/domain/evidencia';

const t = getAllTools();
it('scope', () => {
  const foco = ['gemini-3-flash','deepseek-v4-flash','f5-tts','whisper','kokoro','llama-4','gemma-4','qwen3-27b','phi-4','ministral','kimi-k2','mistral-small','deepseek-v4-pro','glm-5','claude-haiku-4-5','ideogram','elevenlabs','lovable','github-copilot','v0-by-vercel','clipdrop','pika-labs'];
  const l = foco.map((s) => {
    const x = t.find((i) => i.slug === s)!;
    const sup = [...superficiesDe(x)].sort().join('+') || '(ninguna)';
    return `${s.padEnd(20)} sup=[${sup.padEnd(22)}] chat=${x.access.chat} api=${x.access.api} weights=${x.access.weights} host=${x.hosting} com=${x.freePlan.commercialUse}`;
  });
  // Y todas las que tienen pesos Y otra puerta.
  const mixtas = t.filter((x) => {
    const s = superficiesDe(x);
    return s.has('weights') && (s.has('api') || s.has('web') || s.has('cloud'));
  });
  l.push('', 'CON PESOS Y ADEMÁS OTRA PUERTA:');
  for (const x of mixtas) l.push(`  ${x.slug.padEnd(20)} [${[...superficiesDe(x)].sort().join('+')}] com=${x.freePlan.commercialUse} oss=${x.openSource}`);
  writeFileSync('C:/Users/juanl/AppData/Local/Temp/claude/C--Users-juanl--openclaw-autoclaw-workspace-free-ai-radar/f873eee8-5cb2-47c2-adfe-3275dc029a0e/scratchpad/scope.txt', l.join('\n'), 'utf8');
});
