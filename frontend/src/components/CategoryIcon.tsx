import { CATEGORY_ICONS } from '../pages/DashboardPage';

interface Props {
  name: string;
  size?: number;
  fallback?: string;
}

// 客製化圖片：某些分類用 SVG/PNG 而非 emoji
const IMAGE_OVERRIDES: Record<string, string> = {
  乳製品: '/icons/cheese.png',
  Dairy:  '/icons/cheese.png',
};

export default function CategoryIcon({ name, size = 24, fallback = '📦' }: Props) {
  const img = IMAGE_OVERRIDES[name];
  if (img) {
    return <img src={img} alt={name} style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}>{CATEGORY_ICONS[name] ?? fallback}</span>;
}
