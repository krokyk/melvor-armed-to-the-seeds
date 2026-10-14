import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { CombatFarming } from '../combat-farming.mjs';

const loadUpstream = async (override, relativePath) => {
  const path = override || resolve(import.meta.dirname, '..', relativePath);
  return import(pathToFileURL(path).href);
};

const [{ setup: setupFarm }, { setup: setupCore }] = await Promise.all([
  loadUpstream(process.env.SEMI_AUTO_FARM_SOURCE, '.cache/semi-auto-farm-main/src/v1.3.0/main.mjs'),
  loadUpstream(process.env.SEMI_CORE_SOURCE, '.cache/semi-core-and-utils-main/src/v1.3.0/main.mjs'),
]);

const registry = (allObjects) => ({
  allObjects,
  firstObject: allObjects[0],
  getObjectByID: (id) => allObjects.find((item) => item.id === id),
  filter: (callback) => allObjects.filter(callback),
  some: (callback) => allObjects.some(callback),
  forEach: (callback) => allObjects.forEach(callback),
});

function settingsStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (name) => values.get(name),
    set: (name, value) => values.set(name, value),
    add(entries) {
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        if (!values.has(entry.name)) values.set(entry.name, entry.default);
      }
    },
  };
}

function context(initialSections = {}) {
  const sections = new Map(Object.entries(initialSections).map(([name, values]) => [name, settingsStore(values)]));
  const hooks = { selection: [], loaded: [] };
  const patches = new Map();
  return {
    hooks,
    settings: {
      section(name) {
        if (!sections.has(name)) sections.set(name, settingsStore());
        return sections.get(name);
      },
    },
    characterStorage: { getItem: () => undefined, setItem() {} },
    onCharacterSelectionLoaded: (callback) => hooks.selection.push(callback),
    onCharacterLoaded: (callback) => hooks.loaded.push(callback),
    onInterfaceReady() {},
    getResourceUrl: (path) => path,
    patch(Type, method) {
      let methods = patches.get(Type);
      if (!methods) patches.set(Type, methods = new Map());
      if (!methods.has(method)) {
        const original = Type.prototype[method];
        assert.equal(typeof original, 'function', `Fixture lacks ${Type.name}.${method}`);
        const before = [], after = [], replacements = [];
        Type.prototype[method] = function (...args) {
          for (const callback of before) args = callback.apply(this, args) || args;
          let index = replacements.length - 1;
          const next = (...nextArgs) => index >= 0
            ? replacements[index--].call(this, next, ...nextArgs)
            : original.apply(this, nextArgs);
          let result = next(...args);
          for (const callback of after) {
            const replacement = callback.call(this, result, ...args);
            if (replacement !== undefined) result = replacement;
          }
          return result;
        };
        methods.set(method, {
          before: (callback) => before.push(callback),
          after: (callback) => after.push(callback),
          replace: (callback) => replacements.push(callback),
        });
      }
      return methods.get(method);
    },
  };
}

async function fixture({ combat = true, enabled = true, accessCape = false, originalSwap = false, mixed = false, lateTicker = false, unknownTicker = false } = {}) {
  const EnemyState = { Alive: 0, Dead: 1, Spawning: 2 };
  globalThis.CombatAreaType = { None: 0, Combat: 1, Slayer: 2, Dungeon: 3, Stronghold: 4, AbyssDepth: 5 };
  globalThis.cloudManager = { hasItAEntitlementAndIsEnabled: mixed };
  const slotIDs = ['Weapon', 'Shield', 'Cape', 'Gloves', 'Ring', 'Consumable', 'Helmet'];
  const slots = slotIDs.map((name) => ({ id: `melvorD:${name}`, emptyName: name, allowQuantity: name === 'Consumable' }));
  const empty = { id: 'empty', name: 'Empty' };
  const item = (id) => ({ id, name: id, equipRequirements: [] });
  const originals = Object.fromEntries(slots.map((slot) => [slot.id, item(`combat:${slot.emptyName}`)]));
  const farmItems = [
    item('melvorD:Bobs_Rake'), item('melvorItA:Abyssal_Scythe'),
    item('melvorD:Farming_Skillcape'), item('melvorF:Bobs_Gloves'),
    item('melvorD:Ancient_Ring_Of_Skills'), item('melvorF:Seed_Pouch'), item('melvorF:Clown_Hat'),
  ];
  const seed = item('melvorD:Potato_Seed');
  const product = item('melvorD:Potato');
  const compostItems = ['melvorD:Compost', 'melvorD:Weird_Gloop', 'melvorItA:Abyssal_Compost'].map(item);
  const category = { id: 'melvorD:Allotment', name: 'Allotments' };
  const actions = [{
    id: 'melvorD:Potato', namespace: 'melvor', category, product,
    seedCost: { item: seed, quantity: 1 }, level: 1, abyssalLevel: 1, realm: { isUnlocked: true },
  }];
  if (mixed) actions.push({ ...actions[0], id: 'melvorItA:Potato', namespace: 'melvorItA', product: item('melvorItA:Potato') });
  const plots = actions.map((action, index) => ({
    id: `plot:${index}`, category, plantedRecipe: action, state: 3, level: 1, compostLevel: 100,
  }));
  const quantities = new Map([...Object.values(originals), ...farmItems, seed, product].map((entry) => [entry, entry === seed ? 100 : 10]));
  const bank = {
    maximumSlots: 100,
    get occupiedSlots() { return [...quantities.values()].filter((quantity) => quantity > 0).length; },
    getQty: (entry) => quantities.get(entry) || 0,
    hasItem: (entry) => (quantities.get(entry) || 0) > 0,
    addItem(entry, quantity) { quantities.set(entry, this.getQty(entry) + quantity); return true; },
    removeItemQuantity(entry, quantity) { quantities.set(entry, this.getQty(entry) - quantity); },
  };
  const equippedArray = slots.map((slot) => ({ slot, item: originals[slot.id], quantity: slot.allowQuantity ? 7 : 1, providesStats: true }));
  const equipment = {
    equippedArray,
    equippedItems: Object.fromEntries(equippedArray.map((entry) => [entry.slot.id, entry])),
    getSlotOfItem: (entry) => equippedArray.find((equipped) => equipped.item === entry)?.slot,
    getItemInSlot: (id) => equipment.equippedItems[id].item,
    checkForItem: (entry) => equippedArray.some((equipped) => equipped.item === entry),
  };
  const events = [];
  const spell = { id: 'combat:Spell' }, prayer = { id: 'combat:Prayer' };
  const player = {
    equipment, equipmentSets: [{ equipment }], selectedEquipmentSet: 0,
    spellSelection: { attack: spell, curse: undefined, aurora: undefined }, activePrayers: new Set([prayer]),
    stats: { maxHitpoints: 1000 }, hitpoints: 777, timerRestarts: 0,
    modifiers: { dungeonEquipmentSwapping: 0, strongholdEquipmentSwapping: 0 },
    timers: { act: { isActive: combat, ticksLeft: 3 }, summon: { isActive: combat, ticksLeft: 7 } },
    setHitpoints(value) { this.hitpoints = value; },
    selectAttackSpell(value) { this.spellSelection.attack = value; },
    toggleCurse(value) { this.spellSelection.curse = this.spellSelection.curse === value ? undefined : value; },
    toggleAurora(value) { this.spellSelection.aurora = this.spellSelection.aurora === value ? undefined : value; },
    togglePrayer(value) { this.activePrayers.has(value) ? this.activePrayers.delete(value) : this.activePrayers.add(value); },
    checkIfCantEquip() {
      return manager.areaType === CombatAreaType.Dungeon && this.modifiers.dungeonEquipmentSwapping === 0;
    },
    equipItem(entry, set, slot, quantity = 1) {
      slot ||= slots.find((candidate) => candidate.id === entry.slotID);
      if (!slot || this.checkIfCantEquip() || (accessCape && slot.id === 'melvorD:Cape' && entry !== originals[slot.id])) return false;
      if (fault === 'restore' && entry === originals['melvorD:Weapon']) return false;
      if (!bank.hasItem(entry) || this.equipment.getSlotOfItem(entry)) return false;
      const current = this.equipment.equippedItems[slot.id];
      quantity = slot.allowQuantity ? Math.min(quantity, bank.getQty(entry)) : 1;
      if (current.item !== empty) bank.addItem(current.item, current.quantity);
      bank.removeItemQuantity(entry, quantity);
      current.item = entry;
      current.quantity = quantity;
      if (manager.fightInProgress) this.timerRestarts++;
      const maxHP = equipment.getItemInSlot('melvorD:Weapon').id.startsWith('combat:') ? 1000 : 850;
      if (maxHP !== this.stats.maxHitpoints) {
        this.hitpoints = Math.round(maxHP * this.hitpoints / this.stats.maxHitpoints);
        this.stats.maxHitpoints = maxHP;
      }
      if (entry.id.includes('Rake') || entry.id.includes('Scythe')) {
        this.spellSelection.attack = undefined;
        this.activePrayers.clear();
      }
      events.push({ type: 'equip', item: entry.id });
      return true;
    },
    unequipItem(set, slot) {
      if (this.checkIfCantEquip()) return false;
      const current = equipment.equippedItems[slot.id];
      if (current.item !== empty) bank.addItem(current.item, current.quantity);
      current.item = empty;
      current.quantity = 0;
      if (manager.fightInProgress) this.timerRestarts++;
      return true;
    },
  };
  class CombatManager {
    loadNextEnemy() { this.spawnTimer.isActive = true; this.spawnTimer.ticksLeft = 12; this.enemy.state = EnemyState.Spawning; }
    endFight() {
      this.fightInProgress = false;
      this.enemy.state = EnemyState.Dead;
      player.timers.act.isActive = false;
      player.timers.summon.isActive = false;
    }
    stop() {
      this.stopCalls++;
      this.endFight();
      this.spawnTimer.isActive = false;
      this.isActive = false;
      this.areaType = CombatAreaType.None;
      this.selectedArea = undefined;
      return true;
    }
  }
  const manager = Object.assign(new CombatManager(), {
    player, isActive: combat, fightInProgress: combat, paused: false, stopCalls: 0,
    areaType: combat ? CombatAreaType.Slayer : CombatAreaType.None,
    selectedArea: combat ? {} : undefined,
    enemy: { state: combat ? EnemyState.Alive : EnemyState.Dead },
    spawnTimer: { isActive: false, ticksLeft: 0 },
  });
  player.manager = manager;
  let fault;
  const gear = () => Object.fromEntries(equippedArray.map((entry) => [entry.slot.id, entry.item.id]));
  class Farming {
    passiveTick() {}
    showPlotsInCategory() {}
    unlockPlotOnClick() {}
    growPlots() { for (const plot of plots) plot.state = 3; }
    resetPlot(plot) { plot.state = 1; }
    removeCompostFromPlot(plot) { plot.compostItem = undefined; plot.compostLevel = 0; }
    harvestPlotOnClick(plot) {
      events.push({ type: 'harvest', realm: plot.plantedRecipe.namespace, gear: gear() });
      if (fault === 'harvest') throw new Error('Injected harvest error');
      bank.addItem(plot.plantedRecipe.product, equipment.getItemInSlot('melvorD:Weapon').id.startsWith('combat:') ? 1 : 2);
      this.resetPlot(plot);
    }
    plantRecipe(action, plot) {
      events.push({ type: 'plant', gear: gear() });
      if (fault === 'plant') throw new Error('Injected plant error');
      bank.removeItemQuantity(action.seedCost.item, action.seedCost.quantity);
      plot.plantedRecipe = action;
      plot.state = 2;
    }
    getMasteryLevel() { return 99; }
    getMasteryXP() { return 100000; }
  }
  const farming = Object.assign(new Farming(), {
    categories: registry([category]), actions: registry(actions), plots: registry(plots), level: 120, abyssalLevel: 60,
  });
  const game = {
    combat: manager, farming, bank, items: registry([...Object.values(originals), ...farmItems, ...compostItems, seed, product]),
    equipmentSlots: registry(slots), emptyEquipmentItem: empty, _passiveTickers: [], isGolbinRaid: false,
    modifiers: { farmingCropsCannotDie: 0, freeCompost: 0 },
    shop: { purchases: registry([]) }, checkRequirements: () => true,
  };
  globalThis.game = game;
  globalThis.Farming = Farming;
  globalThis.CombatManager = CombatManager;
  globalThis.EnemyState = EnemyState;
  const ctx = context();
  const coreCtx = context();
  let semi;
  setupCore({ ...coreCtx, api: (value) => { semi = value; } });
  globalThis.mod = { api: { SEMI: semi } };
  setupFarm(ctx);
  for (const callback of ctx.hooks.selection) callback(ctx);
  ctx.characterStorage.getItem = () => ({ [category.id]: {
    enabled: true, priorityType: 'custom', priority: actions.map((action) => action.id), lockedPlots: {}, reservedPlots: {},
  } });
  for (const slot of slots) ctx.settings.section('Auto Swap Equipment').set(`swap-${slot.id}`, originalSwap);
  const settings = settingsStore({ enabled, ...Object.fromEntries(slots.map((slot) => [`swap-${slot.id}`, true])) });
  const reports = [];
  const companion = new CombatFarming(ctx, game, semi, settings, { CombatManager, Farming, EnemyState }, (status) => reports.push(status));
  let ticker;
  for (const [index, callback] of ctx.hooks.loaded.entries()) {
    callback(ctx);
    ticker ||= game._passiveTickers.find((entry) => entry.id === 'SEMI:AutoFarming');
    if (index === 0 && lateTicker) game._passiveTickers.splice(game._passiveTickers.indexOf(ticker), 1);
    if (index === 0 && unknownTicker) ticker.passiveTick = () => {};
  }
  assert.ok(ticker, 'Real upstream Auto Farming registered its ticker');
  return {
    game, manager, player, farming, plots, events, companion, ticker, reports, originals, spell, prayer, settings,
    setFault: (value) => { fault = value; },
    tick(count = 1) { for (let i = 0; i < count; i++) if (game._passiveTickers.includes(ticker)) ticker.passiveTick(); },
    gap() { manager.endFight(); manager.loadNextEnemy(); },
  };
}

function assertRestored(run) {
  for (const entry of run.player.equipment.equippedArray) {
    assert.equal(entry.item, run.originals[entry.slot.id]);
    assert.equal(entry.quantity, entry.slot.allowQuantity ? 7 : 1);
  }
  assert.equal(run.player.spellSelection.attack, run.spell);
  assert.deepEqual([...run.player.activePrayers], [run.prayer]);
  assert.equal(run.player.hitpoints, 777);
}

test('real upstream farming waits for a dead enemy, then harvests and replants with gear', async () => {
  const run = await fixture();
  run.tick(100);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 0);
  assert.equal(run.plots[0].state, 3);
  assert.equal(run.player.timerRestarts, 0);
  run.gap();
  const harvest = run.events.find((entry) => entry.type === 'harvest');
  assert.ok(harvest);
  assert.equal(harvest.gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(harvest.gear['melvorD:Cape'], 'melvorD:Farming_Skillcape');
  assert.equal(run.events.find((entry) => entry.type === 'plant').gear['melvorD:Consumable'], 'melvorF:Seed_Pouch');
  assert.equal(run.plots[0].state, 2);
  assert.equal(run.player.timerRestarts, 0);
  assert.deepEqual(run.player.timers, { act: { isActive: false, ticksLeft: 3 }, summon: { isActive: false, ticksLeft: 7 } });
  assert.deepEqual(run.manager.spawnTimer, { isActive: true, ticksLeft: 12 });
  assert.equal(run.companion.status.last.gearRestored, true);
  assert.equal(run.companion.status.last.timersUnchanged, true);
  assert.equal(run.companion.status.last.combatUnchanged, true);
  assertRestored(run);
});

test('required Slayer cape is retained when the native equipment API refuses its replacement', async () => {
  const run = await fixture({ accessCape: true });
  run.tick(100);
  run.gap();
  const harvest = run.events.find((entry) => entry.type === 'harvest');
  assert.equal(harvest.gear['melvorD:Cape'], 'combat:Cape');
  assert.equal(harvest.gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(run.manager.isActive, true);
  assertRestored(run);
});

test('combat slot toggles retain a disabled weapon slot', async () => {
  const run = await fixture();
  run.settings.set('swap-melvorD:Weapon', false);
  run.tick(100);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Cape'], 'melvorD:Farming_Skillcape');
  assertRestored(run);
});

test('a dungeon equipment lock still permits original farming without swapping gear', async () => {
  const run = await fixture();
  run.manager.areaType = CombatAreaType.Dungeon;
  run.tick(100);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.player.timerRestarts, 0);
  assertRestored(run);
});

test('the dungeon swapping upgrade permits farming gear between dungeon enemies', async () => {
  const run = await fixture();
  run.manager.areaType = CombatAreaType.Dungeon;
  run.player.modifiers.dungeonEquipmentSwapping = 1;
  run.tick(100);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(run.manager.stopCalls, 0);
  assertRestored(run);
});

test('the Helmet toggle equips Clown Hat in the actual helmet slot', async () => {
  const run = await fixture();
  for (const slot of run.game.equipmentSlots.allObjects) run.settings.set(`swap-${slot.id}`, false);
  run.settings.set('swap-melvorD:Helmet', true);
  run.tick(100);
  run.gap();
  const harvest = run.events.find((entry) => entry.type === 'harvest');
  assert.equal(harvest.gear['melvorD:Helmet'], 'melvorF:Clown_Hat');
  assert.equal(harvest.gear['melvorD:Weapon'], 'combat:Weapon');
  assertRestored(run);
});

test('natural upstream ticker execution in a spawning gap swaps and restores without a flush', async () => {
  const run = await fixture();
  run.manager.endFight();
  run.manager.spawnTimer.isActive = true;
  run.manager.spawnTimer.ticksLeft = 12;
  run.manager.enemy.state = EnemyState.Spawning;
  run.tick(19);
  assert.equal(run.events.length, 0);
  run.tick();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(run.manager.spawnTimer.ticksLeft, 12);
  assert.equal(run.player.timerRestarts, 0);
  assertRestored(run);
});

for (const originalSwap of [false, true]) {
  test(`outside combat the original scheduler and equipment setting ${originalSwap} remain in control`, async () => {
    const run = await fixture({ combat: false, originalSwap });
    run.tick(19);
    assert.equal(run.events.length, 0);
    run.tick();
    assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], originalSwap ? 'melvorD:Bobs_Rake' : 'combat:Weapon');
    assert.equal(run.plots[0].state, 2);
    assert.equal(run.companion.status.cycles, 0);
    for (const entry of run.player.equipment.equippedArray) assert.equal(entry.item, run.originals[entry.slot.id]);
  });
}

test('disabling the companion preserves original harvesting during live combat', async () => {
  const run = await fixture({ enabled: false });
  run.tick(20);
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.manager.fightInProgress, true);
  assert.equal(run.player.timerRestarts, 0);
  assertRestored(run);
});

for (const fault of ['harvest', 'plant']) {
  test(`combat equipment is restored when real upstream ${fault} processing throws`, async (t) => {
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args));
    const run = await fixture();
    run.setFault(fault);
    run.tick(100);
    run.gap();
    assert.equal(errors.length, 1);
    assert.match(errors[0][1].message, /Injected (harvest|plant) error/);
    assert.match(run.companion.status.state, /Paused:/);
    assert.ok(run.events.some((entry) => entry.type === 'harvest'));
    assertRestored(run);
    assert.equal(run.player.timerRestarts, 0);
  });
}

test('failed native restoration stops combat before the next enemy can spawn', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const run = await fixture();
  run.setFault('restore');
  run.tick(100);
  run.gap();
  assert.ok(run.events.some((entry) => entry.type === 'harvest'));
  assert.equal(run.player.equipment.getItemInSlot('melvorD:Weapon').id, 'melvorD:Bobs_Rake');
  assert.equal(run.companion.status.last.gearRestored, false);
  assert.equal(run.manager.stopCalls, 1);
  assert.equal(run.manager.isActive, false);
  assert.equal(run.manager.spawnTimer.isActive, false);
  assert.equal(run.player.timers.act.isActive, false);
  assert.equal(run.player.timers.summon.isActive, false);
  assert.equal(errors.length, 1);
  assert.match(run.companion.status.state, /Paused:.*Combat was stopped/);
});

test('mixed realm harvests select the matching farming weapon and restore combat gear', async () => {
  const run = await fixture({ mixed: true });
  run.tick(100);
  run.gap();
  const harvests = run.events.filter((entry) => entry.type === 'harvest');
  assert.equal(harvests.length, 2);
  assert.equal(run.events.filter((entry) => entry.type === 'plant').length, 2);
  assert.equal(run.companion.status.last.harvests, 2);
  assert.equal(harvests.find((entry) => entry.realm === 'melvor').gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(harvests.find((entry) => entry.realm === 'melvorItA').gear['melvorD:Weapon'], 'melvorItA:Abyssal_Scythe');
  assertRestored(run);
});

test('the same wrapped upstream ticker survives removal and re-registration for later crops', async () => {
  const run = await fixture();
  run.tick(100);
  run.gap();
  run.tick(20);
  assert.equal(run.game._passiveTickers.includes(run.ticker), false);
  run.manager.fightInProgress = true;
  run.manager.enemy.state = EnemyState.Alive;
  run.manager.spawnTimer.isActive = false;
  run.farming.growPlots();
  assert.equal(run.game._passiveTickers.find((entry) => entry.id === 'SEMI:AutoFarming'), run.ticker);
  run.tick(100);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
  run.gap();
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 2);
  assertRestored(run);
});

test('late loading while the original ticker is idle attaches when the next crop schedules it', async () => {
  const run = await fixture({ lateTicker: true });
  assert.equal(run.game._passiveTickers.includes(run.ticker), false);
  assert.doesNotMatch(run.companion.status.state, /Unavailable:/);
  run.farming.growPlots();
  run.farming.passiveTick();
  run.tick(100);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 0);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assertRestored(run);
});

test('an existing ticker with an unsupported callback is rejected', async () => {
  const run = await fixture({ unknownTicker: true });
  assert.match(run.companion.status.state, /Unavailable:/);
  assert.equal(run.companion.failed, true);
});
