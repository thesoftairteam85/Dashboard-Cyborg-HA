const registry = new Map();

export function registerCard(type, definition) {
  if (registry.has(type)) throw new Error(`Card type already registered: ${type}`);
  registry.set(type, { type, ...definition });
}

export function getCard(type) {
  return registry.get(type);
}

export function getCards() {
  return [...registry.values()];
}

export function createCard(type, config = {}) {
  const definition = getCard(type);
  if (!definition) throw new Error(`Unknown card type: ${type}`);
  return {
    id: crypto.randomUUID(),
    type,
    config: structuredClone({ ...definition.defaults, ...config }),
  };
}
