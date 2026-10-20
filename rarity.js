// The five fact rarities (how niche a fact is) and how each is shown. Kept apart from the card renderer so the
// page can label and count facts before the heavier card code has loaded.
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY = {
  common: { label: 'Common', col: '#8b95a1', pips: 1 },
  uncommon: { label: 'Uncommon', col: '#22a55b', pips: 2 },
  rare: { label: 'Rare', col: '#3b82f6', pips: 3 },
  epic: { label: 'Epic', col: '#a855f7', pips: 4 },
  legendary: { label: 'Legendary', col: '#f0a81c', pips: 5 },
};
