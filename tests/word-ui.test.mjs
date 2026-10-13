import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const main = read('src/main.js');

// This test checks UI contracts and wiring; it does NOT claim to be a browser visual test.
const openingTags = [...html.matchAll(/<([\w-]+)(\s[^>]*?)?>/g)].map(([,tag,raw='']) => ({
  tag,
  props: Object.fromEntries([...raw.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g)].map(([,k,,v]) => [k,v]))
}));
const attr = (key,value) => openingTags.filter(t => t.props[key] === value);

test('Word-style tabs are accessible and each reveals a real panel', () => {
  const tabs = attr('role','tab');
  assert.deepEqual(tabs.map(t => t.props['data-tab']), ['file','home','insert','layout','view']);
  for (const tab of tabs) {
    assert.equal(attr('id',tab.props['aria-controls']).length,1);
    assert.equal(attr('data-panel',tab.props['data-tab']).length,1);
  }
  assert.match(main,/function activateTab\(/);
  assert.match(main,/panel\.hidden\s*=\s*panel\.dataset\.panel !== tab/);
});

test('ribbon controls have unique IDs and all command buttons have implementations', () => {
  const ids = openingTags.map(t => t.props.id).filter(Boolean);
  assert.equal(ids.length,new Set(ids).size,'duplicate HTML IDs');
  const usedIds = [...main.matchAll(/el\('([^']+)'\)/g)].map(m=>m[1]);
  for (const id of usedIds) assert.ok(ids.includes(id),`missing DOM element ${id}`);
  const commands = new Set(openingTags.map(t => t.props['data-cmd']).filter(Boolean));
  const fnBlock = main.split('const commands = {')[1]?.split('  };')[0] || '';
  const implemented = new Set([...fnBlock.matchAll(/(\w+):\s*\(\)\s*=>/g)].map(m=>m[1]));
  for (const command of commands) assert.ok(implemented.has(command),`unconnected ribbon command ${command}`);
});

test('Ward Data and evaluation checklist are hidden from normal editing and remain available', () => {
  assert.equal(attr('id','source-panel')[0]?.tag,'aside');
  assert.equal(attr('id','open-data')[0]?.props['aria-expanded'],'false');
  assert.equal(attr('id','source-panel')[0]?.props['aria-hidden'],'true');
  assert.equal(attr('id','panel-scrim')[0]?.props.hidden,undefined); // Boolean attribute, not an input value.
  assert.equal(attr('id','pm-input').length,1);
  assert.equal(attr('id','night-input').length,1);
  assert.equal(attr('id','regenerate').length,1);
  assert.equal(attr('id','reset').length,1);
  assert.ok(openingTags.some(t=>t.tag === 'details' && t.props.class === 'test-checklist'));
  assert.match(main,/function setDataPanel\(/);
  assert.match(main,/setAttribute\('aria-hidden', String\(!open\)\)/);
});

test('saving, printing, recovery and source regeneration still use existing real implementation', () => {
  for (const id of ['save','reopen','download','upload','upload-file','print','editor','paper-viewport','document-status']) assert.equal(attr('id',id).length,1,id);
  assert.match(main,/snapshotDraft\(\)/);
  assert.match(main,/validateDraft\(draft\)/);
  assert.match(main,/reconcileGeneratedCells\(current, lastGenerated, nextSource\)/);
  assert.match(main,/manualContentFingerprint\(outcome\.document\)/);
  assert.match(main,/command\.executePrint\(\)/);
  assert.match(main,/event\.metaKey \|\| event\.ctrlKey/);
});
