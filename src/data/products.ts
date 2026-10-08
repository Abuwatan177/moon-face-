export type Product = {
  id: number;
  name: string;
  nameAr: string;
  category: string;
  description?: string;
  isArchived?: boolean;
  productType?: string;
  displayOrder?: number;
  colorName: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  badge: string;
  image: string;
  images: { color: string; img: string }[];
  media?: ProductMedia[];
  sizes: { name: string; available: boolean }[];
  colors: { name: string; available: boolean; image: string; customColor?: string; images?: string[]; media?: ProductMedia[]; sizeAvailability?: Record<string, boolean> }[];
};

export type ProductMedia = { type: 'image' | 'video'; url: string };

export const defaultProducts: Product[] = [];
