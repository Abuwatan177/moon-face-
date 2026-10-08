const colorHexValues: Record<string, string> = {
  'ابيض': '#f5f2ed', 'white': '#f5f2ed',
  'اسود': '#171717', 'black': '#171717',
  'كحلي': '#1d2d4b', 'navy': '#1d2d4b',
  'زيتي': '#65705a', 'olive': '#65705a',
  'بني غامق': '#4b2e24', 'بني داكن': '#4b2e24', 'dark brown': '#4b2e24', 'dark-brown': '#4b2e24', 'chocolate': '#4b2e24',
  'بني فاتح': '#a47551', 'light brown': '#a47551', 'light-brown': '#a47551', 'كاراميل': '#b9825b', 'caramel': '#b9825b',
  'بني': '#795548', 'brown': '#795548',
  'بيج': '#d6c2a5', 'beige': '#d6c2a5',
  'عنابي': '#7f1d32', 'burgundy': '#7f1d32',
  'احمر': '#b91c1c', 'red': '#b91c1c',
  'ازرق': '#2563eb', 'blue': '#2563eb',
  'اخضر': '#15803d', 'green': '#15803d',
  'رمادي': '#6b7280', 'gray': '#6b7280', 'grey': '#6b7280',
  'موف': '#8b5cf6', 'بنفسجي': '#7c3aed', 'purple': '#7c3aed',
  'وردي': '#ec4899', 'pink': '#ec4899',
  'برتقالي': '#ea5800', 'orange': '#ea5800',
  'اصفر': '#eab308', 'yellow': '#eab308',
  'ذهبي': '#c59b52', 'gold': '#c59b52',
  'فضي': '#a8a29e', 'silver': '#a8a29e',
  'موكا': '#92745f', 'mocha': '#92745f',
};

export function getProductColorHex(name: string) {
  const color = name.trim().toLocaleLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه');
  if (colorHexValues[color]) return colorHexValues[color];
  const embeddedColor = Object.keys(colorHexValues).sort((first, second) => second.length - first.length).find((label) => color.includes(label));
  if (embeddedColor) return colorHexValues[embeddedColor];
  if (color.includes('بني') || color.includes('brown')) return '#795548';
  if (color.includes('موكا') || color.includes('mocha')) return '#92745f';
  return '#a98a6a';
}

export function getProductColorStyle(name: string, customColor?: string) {
  const color = name.trim().toLocaleLowerCase();
  const override = /^#[0-9a-f]{6}$/i.test(customColor || '') ? customColor : null;
  const base = override || getProductColorHex(name);
  if (override) return { backgroundColor: override };
  if (!/نقش|منقوش|مطبع|pattern|print/.test(color)) return { backgroundColor: base };
  if (/زهور|ورود|زهري|زهرة|floral|flower/.test(color)) {
    return { backgroundColor: base, backgroundImage: 'radial-gradient(circle at 25% 28%, #f8f1dd 0 14%, transparent 16%), radial-gradient(circle at 72% 68%, #686c49 0 13%, transparent 15%), radial-gradient(circle at 78% 20%, #a56c4f 0 10%, transparent 12%)', backgroundSize: '20px 20px' };
  }
  if (/مخطط|خطوط|stripe/.test(color)) {
    return { backgroundColor: base, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.78) 0 3px, transparent 3px 7px)' };
  }
  if (/مربعات|كاروه|check|plaid/.test(color)) {
    return { backgroundColor: base, backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,.75) 0% 25%, transparent 0% 50%)', backgroundSize: '12px 12px' };
  }
  if (/منقط|نقاط|dot/.test(color)) {
    return { backgroundColor: base, backgroundImage: 'radial-gradient(rgba(255,255,255,.85) 1.5px, transparent 1.7px)', backgroundSize: '7px 7px' };
  }
  return { backgroundColor: base, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.75) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, rgba(48,59,41,.45) 0 2px, transparent 2px 6px)' };
}