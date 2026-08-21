export class LayoutEngine {
  static normalize(page) {
    return {
      ...page,
      sections: (page.sections || []).map((section) => ({
        id: section.id || crypto.randomUUID(),
        columns: section.columns || 12,
        gap: section.gap ?? 12,
        cards: (section.cards || []).map((card) => ({
          ...card,
          layout: { x: 0, y: 0, w: 4, h: 2, ...(card.layout || {}) },
        })),
      })),
    };
  }

  static move(page, cardId, layout) {
    const next = structuredClone(page);
    for (const section of next.sections || []) {
      const card = section.cards?.find((item) => item.id === cardId);
      if (card) Object.assign(card, { layout: { ...(card.layout || {}), ...layout } });
    }
    return this.normalize(next);
  }
}
