export const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_CONFIG = {
  schema_version: CURRENT_SCHEMA_VERSION,
  pages: [
    {
      id: "home",
      title: "Home",
      sections: [],
    },
  ],
};

function clone(value) {
  return structuredClone(value);
}

export class DashboardStore {
  constructor(initial = DEFAULT_CONFIG) {
    this._config = clone(initial);
    this._history = [];
    this._listeners = new Set();
  }

  get config() {
    return clone(this._config);
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  transaction(mutator) {
    const previous = clone(this._config);
    const next = clone(this._config);
    mutator(next);
    next.schema_version ??= CURRENT_SCHEMA_VERSION;
    this._history.push(previous);
    this._config = next;
    this._notify();
  }

  undo() {
    const previous = this._history.pop();
    if (!previous) return false;
    this._config = previous;
    this._notify();
    return true;
  }

  addCard(pageId, card) {
    this.transaction((config) => {
      const page = config.pages.find((item) => item.id === pageId);
      if (!page) throw new Error(`Unknown page: ${pageId}`);
      page.sections ??= [];
      page.sections.push({
        id: crypto.randomUUID(),
        cards: [card],
      });
    });
  }

  updateCard(pageId, cardId, patch) {
    this.transaction((config) => {
      const page = config.pages.find((item) => item.id === pageId);
      const card = page?.sections.flatMap((s) => s.cards).find((c) => c.id === cardId);
      if (!card) throw new Error(`Unknown card: ${cardId}`);
      Object.assign(card, patch);
    });
  }

  removeCard(pageId, cardId) {
    this.transaction((config) => {
      const page = config.pages.find((item) => item.id === pageId);
      for (const section of page?.sections ?? []) {
        section.cards = section.cards.filter((card) => card.id !== cardId);
      }
    });
  }

  _notify() {
    const snapshot = this.config;
    for (const listener of this._listeners) listener(snapshot);
  }
}

export { DEFAULT_CONFIG };
