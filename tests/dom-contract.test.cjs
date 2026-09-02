const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
const staticIdMatches = [...html.matchAll(/\bid="([^"]+)"/g)];
const htmlIds = new Set(staticIdMatches.map(match => match[1]));
for (const match of app.matchAll(/\bid="([^"]+)"/g)) htmlIds.add(match[1]);
const requiredIds = new Set([...app.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]));
const missing = [...requiredIds].filter(id => !htmlIds.has(id));

assert.deepEqual(missing, [], `Missing HTML elements: ${missing.join(', ')}`);
assert.equal(new Set(staticIdMatches.map(match => match[1])).size, staticIdMatches.length, 'Static HTML IDs must be unique');
console.log('DOM contract: passed');
