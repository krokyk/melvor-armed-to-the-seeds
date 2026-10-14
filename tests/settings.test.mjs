import assert from 'node:assert/strict';
import test from 'node:test';
import { setup } from '../setup.mjs';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; }
  append(...children) {
    for (const child of children) {
      if (child instanceof Element) child.parentElement = this;
      this.children.push(child);
    }
  }
  setAttribute() {}
  closest(tag) { return this.tagName === tag ? this : this.parentElement?.closest(tag); }
  querySelector(tag) {
    return this.children.find(child => child.tagName === tag)
      ?? this.children.find(child => child instanceof Element && child.querySelector(tag))?.querySelector(tag);
  }
}

async function fixture(saved = {}, detached = false) {
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.game = {
    equipmentSlots: { getObjectByID: id => ({ id, emptyName: id.split(':')[1] }) },
    items: { getObjectByID: () => undefined },
  };
  globalThis.mod = {
    api: { SEMI: { equipmentSnapshot() {}, equipmentSnapshotRestore() {} } },
    manager: { getLoadedModList: () => ['SEMI Auto Farming'] },
  };
  globalThis.CombatManager = class {};
  globalThis.Farming = class {};
  globalThis.EnemyState = {};
  globalThis.TICK_INTERVAL = 50;
  const entries = new Map(), loaded = [];
  let selection, report;
  const settings = {
    get: name => entries.get(name).value,
    set(name, value, restoring = false) {
      const entry = entries.get(name);
      if (entry.config.type === 'custom') entry.config.set(entry.root, value);
      else if (entry.config.type === 'switch') entry.root.querySelector('input').checked = value;
      // Native settings restore skips onChange; normal changes call it before storing the new value.
      if (!restoring) assert.equal(entry.config.onChange?.(value, entry.value), undefined);
      entry.value = value;
    },
    add(configs) {
      for (const config of Array.isArray(configs) ? configs : [configs]) {
        const root = config.type === 'custom' ? config.render() : new Element('div');
        if (config.type === 'switch') {
          const input = new Element('input'), label = new Element('label');
          input.checked = config.default === true;
          label.append(config.label);
          label.control = detached ? null : input;
          root.append(input, label);
        } else if (config.type === 'label') root.append(config.label);
        entries.set(config.name, { config, root, value: config.default });
      }
    },
  };
  await setup({
    loadModule: async () => ({
      CombatFarming: class {
        constructor(_ctx, _game, _semi, _settings, _types, callback) {
          this.status = { state: 'Ready', harvests: 0, respawnHarvests: 0, deferredTicks: 0, last: null };
          report = callback;
        }
      },
      GEAR_PRIORITY: { melvor: { 'melvorD:Weapon': [], 'melvorD:Cape': [] }, abyssal: {} },
    }),
    settings: { section: () => settings },
    onCharacterSelectionLoaded: callback => { selection = callback; },
    onCharacterLoaded: callback => loaded.push(callback),
    api() {},
  });
  selection();
  for (const [name, value] of Object.entries(saved)) settings.set(name, value, true);
  return {
    entries, settings, report,
    load: () => loaded.forEach(callback => callback()),
    save: () => Object.fromEntries([...entries].map(([name, entry]) => [name, entry.value ?? null])),
    checkSlots(disabled) {
      for (const [name, entry] of entries) {
        if (!name.startsWith('swap-')) continue;
        assert.equal(entry.root.querySelector('input').disabled, disabled);
        assert.equal(entry.root.style.opacity, disabled ? '0.5' : '');
      }
    },
  };
}

test('new installs start with one unchecked wait switch and retain greyed slot choices', async () => {
  for (const detached of [false, true]) {
    const ui = await fixture({}, detached);
    ui.load();
    assert.equal(ui.entries.get('enabled').config.type, 'custom');
    assert.equal(ui.settings.get('waitForCombatEnd'), false);
    ui.checkSlots(true);
    ui.settings.set('waitForCombatEnd', true);
    ui.checkSlots(false);
    ui.settings.set('swap-melvorD:Weapon', true);
    ui.settings.set('waitForCombatEnd', false);
    ui.checkSlots(true);
    assert.equal(ui.settings.get('swap-melvorD:Weapon'), true);
    ui.settings.set('waitForCombatEnd', true);
    ui.checkSlots(false);
    assert.equal(ui.settings.get('swap-melvorD:Weapon'), true);
  }
});

test('migration preserves explicit choices and saves from before the wait option existed', async () => {
  for (const [enabled, waiting, expected] of [
    [true, true, true], [true, false, false], [false, true, false], [false, false, false],
    [true, undefined, true], [false, undefined, false],
  ]) {
    const saved = { enabled, 'swap-melvorD:Weapon': true };
    if (waiting !== undefined) saved.waitForCombatEnd = waiting;
    const ui = await fixture(saved);
    ui.load();
    assert.equal(ui.settings.get('waitForCombatEnd'), expected);
    assert.equal(ui.settings.get('enabled'), undefined);
    ui.checkSlots(!expected);
    assert.equal(ui.settings.get('swap-melvorD:Weapon'), true);
    ui.settings.set('waitForCombatEnd', !expected);
    const reloaded = await fixture(ui.save());
    reloaded.load();
    assert.equal(reloaded.settings.get('waitForCombatEnd'), !expected);
    reloaded.checkSlots(expected);
  }
});

test('status displays both cumulative counters and simulated deferred seconds while waiting is off', async () => {
  const ui = await fixture();
  ui.load();
  ui.report({ state: 'Ready', respawnHarvests: 3, harvests: 12, deferredTicks: 122, last: null });
  const text = ui.entries.get('enabled').root.textContent;
  assert.match(text, /Harvested during respawns this session: 3/);
  assert.match(text, /All automatic harvests this session: 12/);
  assert.match(text, /Time farming was deferred this session: 6\.1 seconds/);
  ui.checkSlots(true);
});

test('automatic counter updates retain a failure message without repeating its notification', async () => {
  const ui = await fixture();
  ui.load();
  const notifications = [];
  globalThis.notifyPlayer = (...args) => notifications.push(args);
  const status = { state: 'Paused: Equipment restoration failed', respawnHarvests: 1, harvests: 1, deferredTicks: 20, last: null };
  ui.report(status);
  ui.report({ ...status, harvests: 2 });
  assert.equal(notifications.length, 1);
  assert.match(ui.entries.get('enabled').root.textContent, /Paused: Equipment restoration failed/);
  assert.match(ui.entries.get('enabled').root.textContent, /All automatic harvests this session: 2/);
});
