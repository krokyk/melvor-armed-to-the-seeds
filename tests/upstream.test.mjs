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

async function fixture({ combat = true, waitForCombatEnd = true, missingWait = false, prayerMaxHP = false, accessCape = false, originalSwap = false, mixed = false, lateTicker = false, unknownTicker = false } = {}) {
  const EnemyState = { Alive: 0, Dead: 1, Spawning: 2 };
  globalThis.TICK_INTERVAL = 50;
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
    addItem(entry, quantity) {
      if (fault === 'bank' && actions.some((action) => action.product === entry)) return false;
      quantities.set(entry, this.getQty(entry) + quantity);
      return true;
    },
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
    togglePrayer(value) {
      this.activePrayers.has(value) ? this.activePrayers.delete(value) : this.activePrayers.add(value);
      if (prayerMaxHP) {
        this.stats.maxHitpoints = this.activePrayers.has(prayer) ? 1000 : 850;
        if (this.hitpoints >= this.stats.maxHitpoints) this.setHitpoints(this.stats.maxHitpoints);
      }
    },
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
  const farmingListeners = new Map();
  const emitHarvest = (event) => { for (const listener of farmingListeners.get('harvest') || []) listener(event); };
  class Farming {
    on(type, listener) {
      if (!farmingListeners.has(type)) farmingListeners.set(type, new Set());
      farmingListeners.get(type).add(listener);
    }
    off(type, listener) { farmingListeners.get(type)?.delete(listener); }
    passiveTick() {}
    showPlotsInCategory() {}
    unlockPlotOnClick() {}
    growPlots() { for (const plot of plots) plot.state = 3; }
    resetPlot(plot) { plot.state = 1; }
    removeCompostFromPlot(plot) { plot.compostItem = undefined; plot.compostLevel = 0; }
    harvestPlotOnClick(plot) {
      if (![3, 4].includes(plot.state) || !plot.plantedRecipe) return;
      events.push({ type: 'harvest', realm: plot.plantedRecipe.namespace, gear: gear() });
      if (fault === 'harvest') throw new Error('Injected harvest error');
      const action = plot.plantedRecipe;
      if (plot.state === 4) {
        this.resetPlot(plot);
        emitHarvest({ skill: this, action, successful: false });
        return;
      }
      if (!bank.addItem(action.product, equipment.getItemInSlot('melvorD:Weapon').id.startsWith('combat:') ? 1 : 2)) return;
      this.resetPlot(plot);
      emitHarvest({ skill: this, action, successful: true });
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
  const settings = settingsStore({ ...(missingWait ? {} : { waitForCombatEnd }),
    ...Object.fromEntries(slots.map((slot) => [`swap-${slot.id}`, true])) });
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

function assertRestored(run, hitpoints = 777) {
  for (const entry of run.player.equipment.equippedArray) {
    assert.equal(entry.item, run.originals[entry.slot.id]);
    assert.equal(entry.quantity, entry.slot.allowQuantity ? 7 : 1);
  }
  assert.equal(run.player.spellSelection.attack, run.spell);
  assert.deepEqual([...run.player.activePrayers], [run.prayer]);
  assert.equal(run.player.hitpoints, hitpoints);
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
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 1);
  assert.equal(run.companion.status.deferredTicks, 100);
  assertRestored(run);
});

test('explicit waiting retains gap swapping with original SEMI equipment switches enabled', async () => {
  const run = await fixture({ waitForCombatEnd: true, originalSwap: true });
  run.tick(100);
  assert.equal(run.events.length, 0);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(run.player.timerRestarts, 0);
  assert.deepEqual(run.manager.spawnTimer, { isActive: true, ticksLeft: 12 });
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 1);
  assert.equal(run.companion.status.deferredTicks, 100);
  assertRestored(run);
});

test('without waiting, real SEMI harvests repeated batches during a long fight without swapping gear', async () => {
  const run = await fixture({ waitForCombatEnd: false, originalSwap: true, mixed: true });
  const timers = structuredClone({ player: run.player.timers, spawn: run.manager.spawnTimer });
  const area = run.manager.selectedArea;
  run.tick(19);
  assert.equal(run.events.length, 0);
  run.tick();
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 2);
  assert.equal(run.events.filter((entry) => entry.type === 'plant').length, 2);
  run.farming.growPlots();
  run.tick(100);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 4);
  assert.equal(run.events.filter((entry) => entry.type === 'plant').length, 4);
  assert.equal(run.events.filter((entry) => entry.type === 'equip').length, 0);
  for (const event of run.events) {
    if (event.type !== 'harvest' && event.type !== 'plant') continue;
    for (const [slotID, item] of Object.entries(run.originals)) assert.equal(event.gear[slotID], item.id);
  }
  assert.equal(run.manager.isActive, true);
  assert.equal(run.manager.fightInProgress, true);
  assert.equal(run.manager.enemy.state, EnemyState.Alive);
  assert.equal(run.manager.selectedArea, area);
  assert.equal(run.manager.stopCalls, 0);
  assert.equal(run.player.timerRestarts, 0);
  assert.deepEqual({ player: run.player.timers, spawn: run.manager.spawnTimer }, timers);
  assert.equal(run.companion.status.harvests, 4);
  assert.equal(run.companion.status.respawnHarvests, 0);
  assert.equal(run.companion.status.deferredTicks, 0);
  assertRestored(run);
});

test('without waiting, unnecessary Core prayer restoration cannot lower current hitpoints', async () => {
  const run = await fixture({ waitForCombatEnd: false, originalSwap: true, prayerMaxHP: true });
  run.player.hitpoints = 987;
  run.tick(20);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
  assert.equal(run.manager.fightInProgress, true);
  assert.equal(run.player.stats.maxHitpoints, 1000);
  assertRestored(run, 987);
});

test('turning waiting off releases queued crops on the original scheduler during the current fight', async () => {
  const run = await fixture({ waitForCombatEnd: true, originalSwap: true });
  run.tick(100);
  assert.equal(run.events.length, 0);
  run.settings.set('waitForCombatEnd', false);
  run.tick(19);
  assert.equal(run.events.length, 0);
  run.tick();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.plots[0].state, 2);
  assert.equal(run.manager.fightInProgress, true);
  assert.equal(run.player.timerRestarts, 0);
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 0);
  assert.equal(run.companion.status.deferredTicks, 100);
  assertRestored(run);
});

test('turning waiting on between batches defers the next crop and swaps gear in its spawning gap', async () => {
  const run = await fixture({ waitForCombatEnd: false, originalSwap: true });
  run.tick(20);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
  run.settings.set('waitForCombatEnd', true);
  run.farming.growPlots();
  run.tick(100);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
  run.gap();
  const harvests = run.events.filter((entry) => entry.type === 'harvest');
  assert.equal(harvests.length, 2);
  assert.equal(harvests[0].gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(harvests[1].gear['melvorD:Weapon'], 'melvorD:Bobs_Rake');
  assert.equal(run.player.timerRestarts, 0);
  assert.equal(run.companion.status.harvests, 2);
  assert.equal(run.companion.status.respawnHarvests, 1);
  assert.equal(run.companion.status.deferredTicks, 100);
  assertRestored(run);
});

test('without waiting, a spawning gap does not force the original farming debounce to finish', async () => {
  const run = await fixture({ waitForCombatEnd: false, originalSwap: true });
  run.tick(19);
  assert.equal(run.events.length, 0);
  run.gap();
  assert.equal(run.events.length, 0);
  run.tick();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.player.timerRestarts, 0);
  assert.deepEqual(run.manager.spawnTimer, { isActive: true, ticksLeft: 12 });
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 0);
  assert.equal(run.companion.status.deferredTicks, 0);
  assertRestored(run);
});

test('manual harvests are excluded while later successful SEMI harvests are counted', async () => {
  const run = await fixture({ waitForCombatEnd: false });
  run.farming.harvestPlotOnClick(run.plots[0]);
  run.tick(20);
  assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
  assert.equal(run.companion.status.harvests, 0);
  assert.equal(run.companion.status.respawnHarvests, 0);
  run.farming.growPlots();
  run.tick(20);
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 0);
});

for (const unsuccessful of ['dead', 'bank']) {
  test(`automatic ${unsuccessful === 'dead' ? 'dead-plot cleanup' : 'rejected bank deposits'} do not count as successful harvests`, async () => {
    const run = await fixture({ waitForCombatEnd: false });
    if (unsuccessful === 'dead') run.plots[0].state = 4;
    else run.setFault('bank');
    run.tick(20);
    assert.equal(run.events.filter((entry) => entry.type === 'harvest').length, 1);
    assert.equal(run.companion.status.harvests, 0);
    assert.equal(run.companion.status.respawnHarvests, 0);
    assert.equal(run.companion.failed, false);
    assert.equal(run.plots[0].state, unsuccessful === 'dead' ? 2 : 3);
    run.setFault(undefined);
    run.farming.growPlots();
    run.tick(20);
    assert.equal(run.companion.status.harvests, 1);
    assert.equal(run.companion.status.respawnHarvests, 0);
  });
}

test('harvest and deferral history accumulates once across plots and mode changes', async () => {
  const run = await fixture();
  for (let index = 1; index < 10; index++) run.plots.push({ ...run.plots[0], id: `plot:${index}` });
  run.tick(123);
  assert.equal(run.companion.status.harvests, 0);
  assert.equal(run.companion.status.deferredTicks, 123);
  run.gap();
  assert.equal(run.companion.status.harvests, 10);
  assert.equal(run.companion.status.respawnHarvests, 10);
  assert.equal(run.companion.status.deferredTicks, 123);
  run.manager.fightInProgress = true;
  run.manager.enemy.state = EnemyState.Alive;
  run.manager.spawnTimer.isActive = false;
  run.farming.growPlots();
  run.tick(77);
  assert.equal(run.companion.status.deferredTicks, 200);
  run.settings.set('waitForCombatEnd', false);
  run.tick(20);
  assert.equal(run.companion.status.harvests, 20);
  assert.equal(run.companion.status.respawnHarvests, 10);
  assert.equal(run.companion.status.deferredTicks, 200);
  run.manager.stop();
  run.farming.growPlots();
  run.tick(20);
  assert.equal(run.companion.status.harvests, 30);
  assert.equal(run.companion.status.respawnHarvests, 10);
  assert.equal(run.companion.status.deferredTicks, 200);
});

test('accelerated offline-style ticking measures deferred game time without elapsed wall time', async (t) => {
  const run = await fixture();
  t.mock.method(Date, 'now', () => 12345);
  run.tick(72000);
  assert.equal(run.companion.status.deferredTicks, 72000);
  assert.equal(run.companion.status.deferredTicks * TICK_INTERVAL / 1000, 3600);
  run.gap();
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 1);
  assert.equal(run.companion.status.deferredTicks, 72000);
});

test('combat with no queued SEMI ticker adds no deferred time', async () => {
  const run = await fixture();
  run.gap();
  run.tick(20);
  assert.equal(run.game._passiveTickers.includes(run.ticker), false);
  run.manager.fightInProgress = true;
  run.manager.enemy.state = EnemyState.Alive;
  run.manager.spawnTimer.isActive = false;
  run.tick(100);
  assert.equal(run.companion.status.deferredTicks, 0);
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

test('an already worn superior farming cape is reported when cape swapping is disabled', async () => {
  const run = await fixture();
  const cape = { id: 'melvorTotH:Superior_Farming_Skillcape', name: 'Superior Farming Skillcape', equipRequirements: [] };
  run.game.items.allObjects.push(cape);
  run.player.equipment.equippedItems['melvorD:Cape'].item = cape;
  run.originals['melvorD:Cape'] = cape;
  run.settings.set('swap-melvorD:Cape', false);
  run.tick(100);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Cape'], cape.id);
  assert.ok(run.companion.status.last.used.includes(cape.name));
  assert.deepEqual(run.companion.status.last.alreadyEquipped, [cape.name]);
  assert.equal(run.companion.status.last.swapped.includes(cape.name), false);
  assert.equal(run.events.some((entry) => entry.type === 'equip' && entry.item === cape.id), false);
  assertRestored(run);
});

test('farming gear used across repeated plots is reported once while retaining the swap list', async () => {
  const run = await fixture();
  run.plots.push({ ...run.plots[0], id: 'plot:second' });
  run.tick(100);
  run.gap();
  assert.equal(run.companion.status.last.harvests, 2);
  assert.equal(run.companion.status.last.used.filter((name) => name === 'melvorD:Bobs_Rake').length, 1);
  assert.equal(run.companion.status.last.used.filter((name) => name === 'melvorF:Bobs_Gloves').length, 1);
  assert.deepEqual([...run.companion.status.last.used].sort(), [...run.companion.status.last.swapped].sort());
  assert.deepEqual(run.companion.status.last.alreadyEquipped, []);
  assertRestored(run);
});

test('a disabled ring swap reports the worn farming ring rather than a better bank item', async () => {
  const run = await fixture();
  const worn = run.game.items.getObjectByID('melvorD:Ancient_Ring_Of_Skills');
  const banked = { id: 'melvorD:Aorpheats_Signet_Ring', name: "Aorpheat's Signet Ring", equipRequirements: [] };
  run.game.items.allObjects.push(banked);
  run.game.bank.addItem(banked, 1);
  run.player.equipment.equippedItems['melvorD:Ring'].item = worn;
  run.originals['melvorD:Ring'] = worn;
  run.settings.set('swap-melvorD:Ring', false);
  run.tick(100);
  run.gap();
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Ring'], worn.id);
  assert.ok(run.companion.status.last.used.includes(worn.name));
  assert.equal(run.companion.status.last.used.includes(banked.name), false);
  assert.deepEqual(run.companion.status.last.alreadyEquipped, [worn.name]);
  assert.equal(run.companion.status.last.swapped.includes(worn.name), false);
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
    assert.equal(run.companion.status.harvests, 1);
    assert.equal(run.companion.status.respawnHarvests, 0);
    assert.equal(run.companion.status.deferredTicks, 0);
    for (const entry of run.player.equipment.equippedArray) assert.equal(entry.item, run.originals[entry.slot.id]);
  });
}

test('a missing wait setting defaults to immediate harvesting during live combat', async () => {
  const run = await fixture({ missingWait: true });
  run.tick(20);
  assert.equal(run.events.find((entry) => entry.type === 'harvest').gear['melvorD:Weapon'], 'combat:Weapon');
  assert.equal(run.manager.fightInProgress, true);
  assert.equal(run.player.timerRestarts, 0);
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 0);
  assert.equal(run.companion.status.deferredTicks, 0);
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
    assert.equal(run.companion.status.harvests, fault === 'plant' ? 1 : 0);
    assert.equal(run.companion.status.respawnHarvests, fault === 'plant' ? 1 : 0);
    assertRestored(run);
    assert.equal(run.player.timerRestarts, 0);
    run.setFault(undefined);
    run.farming.growPlots();
    run.farming.harvestPlotOnClick(run.plots[0]);
    assert.equal(run.companion.status.harvests, fault === 'plant' ? 1 : 0);
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
  assert.equal(run.companion.status.harvests, 1);
  assert.equal(run.companion.status.respawnHarvests, 1);
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
