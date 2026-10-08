export type SiteContent = {
  offersEnabled: boolean;
  offersEnabledConfigured: boolean;
  productTypes: string[];
  storeLogo: string;
  whatsappNumber: string;
  feedbackEmail: string;
  tutorialsConfigured: boolean;
  reelsConfigured: boolean;
  tutorials: {
    title: string;
    entries: { type: 'image' | 'video'; url: string; title: string; description: string }[];
  };
  reels: {
    title: string;
    entries: { id: string; url: string; productId: number; caption: string }[];
  };
  policies: { delivery: string; exchange: string; returns: string };
  collections: {
    title: string;
    titleAr: string;
    subtitle: string;
    image: string;
    items: string;
  }[];
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    titleLine3: string;
    description: string;
    primaryButton: string;
    image: string;
    media: { type: 'image' | 'video'; url: string }[];
  };
  story: {
    eyebrow: string;
    title: string;
    highlight: string;
    description: string;
    image: string;
    secondaryImage: string;
    features: { title: string; description: string }[];
  };
};

export const defaultSiteContent: SiteContent = {
  offersEnabled: true,
  offersEnabledConfigured: false,
  productTypes: ['مودال', 'شيفون', 'قطن'],
  storeLogo: '/media/favicon.svg',
  whatsappNumber: '',
  feedbackEmail: '',
  tutorialsConfigured: false,
  tutorials: {
    title: 'الشروحات',
    entries: [],
  },
  reelsConfigured: false,
  reels: {
    title: 'الريلز',
    entries: [],
  },
  policies: { delivery: '', exchange: '', returns: '' },
  collections: [],
  hero: {
    eyebrow: 'حكاية من الأرض',
    titleLine1: 'أناقة',
    titleLine2: 'تُحكى',
    titleLine3: 'بكل لفة',
    description: 'حجابات مختارة بعناية، بألوان مستوحاة من الأرض وتفاصيل ترافقك كل يوم.',
    primaryButton: 'اكتشفي التشكيلة',
    image: '',
    media: [],
  },
  story: {
    eyebrow: 'عن Moon Face',
    title: 'من نحن',
    highlight: 'أناقة بروح عربية',
    description: 'في Moon Face نختار حجابات تجمع بين الراحة والجمال، بخامات محببة وألوان مستوحاة من هدوء الأرض. قطع يومية بتفاصيل مدروسة لترافقك بثقة في كل وقت.',
    image: '',
    secondaryImage: '',
    features: [
      { title: 'خامات مختارة', description: 'ملمس مريح وأقمشة منتقاة لترافق يومك.' },
      { title: 'ألوان من الطبيعة', description: 'درجات هادئة يسهل تنسيقها مع إطلالتك.' },
      { title: 'تفاصيل بعناية', description: 'تصاميم بسيطة وعملية تحمل طابعاً عربياً.' },
    ],
  },
};
