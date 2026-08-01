// locationCard.js – renders a location result into the script results panel
export function createLocationCard(loc) {
  const card = document.createElement('div');
  card.className = 'location-card';
  const name = document.createElement('div');
  name.className = 'loc-name';
  name.textContent = loc.name || loc.type || 'Unnamed';
  card.appendChild(name);
  if (loc.type) {
    const type = document.createElement('div');
    type.className = 'loc-type';
    type.textContent = `Type: ${loc.type}`;
    card.appendChild(type);
  }
  if (loc.budget) {
    const budget = document.createElement('div');
    budget.className = 'loc-budget';
    budget.textContent = `Budget: $${loc.budget}`;
    card.appendChild(budget);
  }
  return card;
}
