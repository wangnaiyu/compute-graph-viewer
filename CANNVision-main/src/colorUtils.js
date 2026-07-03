export const hexToRgba = (hex, alpha) => {
  const normalizedHex = hex.replace('#', '');
  const expandedHex =
    normalizedHex.length === 3
      ? normalizedHex.split('').map((char) => char + char).join('')
      : normalizedHex;
  const intValue = Number.parseInt(expandedHex, 16);

  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getReadableTextColor = (hex) => {
  const normalizedHex = hex.replace('#', '');
  const expandedHex =
    normalizedHex.length === 3
      ? normalizedHex.split('').map((char) => char + char).join('')
      : normalizedHex;
  const intValue = Number.parseInt(expandedHex, 16);

  if (Number.isNaN(intValue)) return '#0f172a';

  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 160 ? '#0f172a' : '#f8fafc';
};
