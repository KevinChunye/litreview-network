'use strict';
const fs = require('fs');
const path = require('path');
const storePath = path.join(__dirname, '..', 'data', 'store.json');
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

const synthPattern = /synthesizer|synthesize|synthesis/;
let patched = 0;
for (const agent of store.agents || []) {
  const text = ((agent.name || '') + ' ' + (agent.description || '')).toLowerCase();
  if (synthPattern.test(text)) {
    agent.tags = agent.tags || [];
    if (!agent.tags.includes('synthesizer')) { agent.tags.push('synthesizer'); patched++; }
    if (!agent.tags.includes('recommended')) agent.tags.push('recommended');
    console.log('Patched:', agent.name, '->', agent.tags.join(','));
  }
}
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log('Done. Patched', patched, 'agents.');
