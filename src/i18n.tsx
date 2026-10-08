import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Language = 'ar' | 'en';
type Dictionary = Record<string, string>;

const dictionaries: Record<Language, Dictionary> = {
  ar: {
    home: 'الرئيسية', collections: 'المجموعات', arrivals: 'المنتجات', about: 'من نحن', search: 'بحث', wishlist: 'المفضلة', cart: 'سلة المشتريات', addToCart: 'أضف للسلة', quickAdd: 'أضف', all: 'الكل',
    color: 'اللون', price: 'السعر', emptyWishlist: 'لم تضف أي منتج بعد', delivery: 'رسوم التوصيل حسب المنطقة', name: 'الاسم الكامل', phone: 'رقم الهاتف', address: 'الموقع / العنوان', confirm: 'تأكيد الطلب عبر واتساب', total: 'الإجمالي',
    browseWorld: 'تصفح عالمنا', browseCollection: 'تصفح المجموعة', newCollection: 'مجموعة Moon Face الجديدة', heroDescription: 'تجمع Moon Face بين البساطة العصرية والحرفية المتقنة؛ فكل قطعة صُممت لمن يمضون في حياتهم بخطوات واثقة وهادفة.',
    designStory: 'قصة التصميم', notJustClothes: 'ليست مجرد ملابس', details: 'إنها التفاصيل', curated: 'اختيرت لك بعناية', collection: 'التشكيلة', lookbook: 'شاهدوا الإطلالات', searchPlaceholder: 'ابحث باسم المنتج أو اللون...', searchAria: 'بحث', removeWishlist: 'إزالة من المفضلة', openCart: 'فتح السلة', happyCustomers: 'زبائن سعداء', uniqueDesigns: 'تصميم مميز', averageRating: 'التقييم', exploreCollection: 'تصفح التشكيلة', rights: 'جميع الحقوق محفوظة', westBank: 'الضفة', jerusalem: 'القدس', inside: 'الداخل',
    shippingPolicy: 'سياسة التوصيل', exchangePolicy: 'سياسة التبديل', returnPolicy: 'سياسة الترجيع', close: 'إغلاق', changeLanguage: 'تغيير اللغة',
    designedBy: 'تصميم ودعم', products: 'منتجات', shopByType: 'تسوق حسب النوع', noSpecificProductTypes: 'لا توجد أنواع محددة بعد', productPages: 'صفحات المنتجات', previousPage: 'الصفحة السابقة', nextPage: 'الصفحة التالية', comingSoon: 'قريبًا', typeHijabs: 'الحجابات', previousMedia: 'الوسيط السابق', nextMedia: 'الوسيط التالي', showMedia: 'اعرض الوسيط',
    customerAccount: 'حساب العميل', myAccount: 'حسابي', guestAccount: 'حساب الضيف', guestName: 'زائر', guestBrowse: 'تصفح كضيف', signInOrCreate: 'تسجيل الدخول أو إنشاء حساب', login: 'تسجيل الدخول', signUp: 'إنشاء حساب', createAccount: 'إنشاء الحساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', confirmPassword: 'تأكيد كلمة المرور', passwordHint: 'كلمة مرور قوية، 12 محرفًا على الأقل', showPassword: 'إظهار كلمة المرور', hidePassword: 'إخفاء كلمة المرور', forgotPassword: 'نسيت كلمة المرور؟', resetCodeInstructions: 'أدخل بريد حسابك لإرسال رمز استعادة كلمة المرور.', sendResetCode: 'إرسال رمز الاستعادة', resetCodeSent: 'أرسلنا رمز الاستعادة إلى بريدك الإلكتروني.', resetCode: 'رمز الاستعادة', updatePassword: 'تغيير كلمة المرور', resendResetCode: 'إرسال رمز جديد', backToLogin: 'العودة لتسجيل الدخول', passwordUpdated: 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.', continueGoogle: 'المتابعة باستخدام Google', continueGuest: 'المتابعة كضيف', authUnavailable: 'المصادقة غير مهيأة بعد. أضف إعدادات Supabase المحلية وشغّل ملف supabase.sql.', authError: 'تعذر إكمال العملية.', passwordMismatch: 'كلمتا المرور غير متطابقتين.', accountCreated: 'تم إنشاء الحساب.', confirmEmail: 'تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول.', accountLoadError: 'تعذر تحميل بيانات الحساب.', orderNotFound: 'لم نجد طلبًا بهذه البيانات.', orderLookupError: 'تعذر البحث عن الطلب.', closeAccount: 'إغلاق الحساب',
    myOrders: 'طلباتي', orderCount: 'طلب', searchOrder: 'ابحث برقم الطلب', loading: 'جارٍ التحميل...', noMatchingOrder: 'لا يوجد طلب بهذه البيانات.', noOrdersYet: 'لا توجد طلبات بعد.', myInteractions: 'تفاعلاتي', likesLabel: 'إعجابات', savesLabel: 'محفوظات', signOut: 'تسجيل الخروج', trackingOrder: 'تتبّع الطلب', orderNumber: 'رقم الطلب', orderTrackingCode: 'رمز التتبع السري', findOrder: 'بحث عن الطلب', orderStatus: 'الحالة', orderDate: 'تاريخ الطلب', statusNew: 'قيد المراجعة', statusCancelled: 'ملغي', statusPostponed: 'مؤجل', statusDelivered: 'تم التسليم', statusExchanged: 'تم التبديل', orderRecorded: 'تم تسجيل الطلب', orderTrackingHint: 'احتفظ برقم الطلب والرمز السري؛ ستحتاج إليهما لمتابعة الحالة.', loyaltyPoints: 'نقاط الولاء', loyaltyEarnHint: 'تُضاف النقاط بعد تسليم طلبك.',
    rating: 'التقييم', reviews: 'تقييم', basedOn: 'بناءً على', outOf: 'من', stars: 'نجوم', likeProduct: 'إعجاب بالمنتج', productComments: 'تعليقات المنتج', reviewProduct: 'قيّم المنتج', yourReview: 'تقييمك', starCount: 'عدد النجوم', yourNameOptional: 'اسمك (اختياري)', writeReview: 'اكتب رأيك بالمنتج...', submitReview: 'إرسال التقييم', reviewThanks: 'وصلنا تقييمك، وسيظهر بعد مراجعته.', sendComment: 'إرسال التعليق', signInToComment: 'سجّل الدخول لكتابة تعليق', noComments: 'لا توجد تعليقات بعد.', writeComment: 'اكتب تعليقًا...',
    typesKicker: 'تسوقي حسب النوع', typesTitle: 'أنواع القطع', typeSets: 'الأطقم', typeTops: 'البلايز', typeShirts: 'القمصان', typeModal: 'المودال', typeChiffon: 'الشيفون', typeCotton: 'القطن', allTypes: 'كل الأنواع',
    offersKicker: 'اختيارات Moon Face', offersTitle: 'العروض الخاصة', offersHint: 'أسعار مخفضة على قطع مختارة', discount: 'خصم', productTypeFilter: 'نوع القطعة', productNameFilter: 'اسم المنتج', noProducts: 'لا توجد منتجات مصنفة بهذا الاختيار حالياً',
    tutorialsTitle: 'الشروحات', noTutorials: 'لا توجد شروحات بعد', reelsTitle: 'الريلز', noReels: 'لا توجد ريلز بعد', addReelVideos: 'إضافة فيديوهات ريلز', reelProduct: 'المنتج المرتبط', reelCaption: 'وصف الريل', feedbackTitle: 'آراء وملاحظات وأفكار', feedbackType: 'نوع الرسالة', feedbackOpinion: 'رأي', feedbackNote: 'ملاحظة', feedbackIdea: 'فكرة', feedbackName: 'الاسم (اختياري)', feedbackReplyEmail: 'البريد الإلكتروني للرد (اختياري)', feedbackMessage: 'اكتبي رسالتك', feedbackSubmit: 'إرسال عبر البريد', feedbackEmailMissing: 'لم يتم إعداد بريد استقبال الملاحظات بعد.', feedbackEmailOpening: 'تم فتح تطبيق البريد لإرسال ملاحظتك.', feedbackSaveError: 'تعذر حفظ الملاحظة في قاعدة البيانات. لم يتم إرسالها.',
    inStock: 'متوفر', outOfStock: 'غير متوفر', selectColor: 'اختاري اللون', detailsLabel: 'تفاصيل المنتج', relatedProducts: 'منتجات مشابهة', recentlyViewed: 'شاهدتها مؤخراً', scrollToTop: 'العودة إلى الأعلى', pullToRefresh: 'اسحب للأسفل للتحديث', releaseToRefresh: 'أفلت للتحديث', refreshingPage: 'جارٍ تحديث المتجر...', seoStoreTitle: 'Moon Face | حجابات مختارة بعناية', seoStoreDescription: 'حجابات مختارة بعناية، بألوان مستوحاة من الأرض وتفاصيل ترافقك كل يوم من Moon Face.', shareProduct: 'مشاركة المنتج', shareLinkCopied: 'تم نسخ رابط المنتج.', shareLinkFailed: 'تعذرت مشاركة الرابط أو نسخه.', showMoreProducts: 'عرض باقي المنتجات', showFewerProducts: 'عرض أقل', deleteComment: 'حذف التعليق', confirmDeleteComment: 'هل تريد حذف هذا التعليق نهائياً؟',
    salesLabel: 'عرض خاص', newTag: 'جديد', bestSeller: 'الأكثر مبيعًا', limitedTag: 'كمية محدودة', popularTag: 'الأكثر طلبًا', exclusiveTag: 'حصري', featuredTag: 'مميز', shippingPolicyText: 'رسوم التوصيل حسب المنطقة: الضفة ₪20، القدس ₪30، الداخل ₪70. يُحسب التوصيل بشكل مستقل ولا يشمله خصم المنتجات.', exchangePolicyText: 'لا يتوفر تبديل للقطع.', returnPolicyText: 'لا يتوفر ترجيع للقطع.',
    emptyCart: 'السلة فارغة حاليًا', couponPlaceholder: 'كود الخصم (اختياري)', applyCoupon: 'تطبيق', couponSuccess: 'تم تطبيق الخصم على المنتجات', couponInvalid: 'كود الخصم غير صحيح', subtotal: 'مجموع المنتجات', couponDiscount: 'الخصم', deliveryFee: 'التوصيل', removeItem: 'حذف المنتج', increaseQuantity: 'زيادة الكمية', decreaseQuantity: 'تقليل الكمية', productLabel: 'المنتج', quantity: 'الكمية', lineTotal: 'المجموع', orderHeading: 'طلب جديد من Moon Face',
    redeemPoints: 'استبدال النقاط', pointsWorth: 'قيمة الخصم', cartReminderOptIn: 'تفعيل تذكير السلة بالإشعارات', notificationEnabled: 'تم تفعيل تذكيرات السلة.', notificationSetupError: 'تعذر تفعيل تذكير السلة.', openWheel: 'افتح عجلة الحظ', spinWheelTitle: 'عجلة الحظ', spinWheelHint: 'دُر العجلة واكتشف جائزتك', wheelOptions: 'خيارات العجلة', wheelError: 'تعذر تسجيل اللفة الآن. حاول مرة أخرى.', wheelPointsWon: 'نقطة ولاء', wheelDiscountWon: 'قسيمة خصم', wheelResult: 'جائزتك', wheelRewardCode: 'استخدمي هذا الكود عند الدفع', wheelCopyCode: 'نسخ كود الخصم', wheelCodeCopied: 'تم نسخ كود الخصم', wheelCopyFailed: 'تعذر نسخ الكود. حدديه وانسخيه يدويًا.', wheelSpinning: 'تدور العجلة...', spinNow: 'لف العجلة', wheelPointsClaimed: 'أضيفت نقاط الجائزة إلى حسابك', orderPreview: 'معاينة الطلب', orderContents: 'محتويات الطلب', emptyOrderItems: 'لا توجد منتجات في هذا الطلب.', size: 'المقاس',
    heroEyebrow: 'مجموعة Moon Face الجديدة', heroLine1: 'ارتدِ', heroLine2: 'جوهر', heroLine3: 'الغد', heroPrimary: 'تصفح المجموعة', heroSecondary: 'شاهدوا الإطلالات', premiumQuality: 'جودة فاخرة', organicFabrics: 'أقمشة مريحة بعناية', scrollDown: 'مرر للأسفل',
    featuredIn: 'كما ظهرت في',
    region: 'المنطقة', collectionPiece: 'قطعة مختارة من المجموعة', storyEyebrow: 'قصة التصميم', storyTitle: 'ليست مجرد ملابس', storyHighlight: 'إنها التفاصيل', storyDescription: 'شغف ممتد صُمم بعناية من خيوط عالية الجودة لتناسب خطواتك اليومية وتمنحك حضوراً مميزاً.',
    featureTitle1: 'أقمشة فاخرة مستدامة', featureDescription1: 'ننتقي خاماتنا بعناية لنضمن لك راحة تدوم ومظهراً عصرياً متقناً.', featureTitle2: 'تصميم يحمل هوية', featureDescription2: 'كل تصميم يحمل حكاية فريدة وتفاصيل تبرز حضورك المميز.', featureTitle3: 'راحة في كل يوم', featureDescription3: 'حلول عملية تلائم يومك وتجمع بين الأناقة والراحة.',
  },
  en: {
    home: 'Home', collections: 'Collections', arrivals: 'Shop', about: 'About', search: 'Search', wishlist: 'Wishlist', cart: 'Shopping bag', addToCart: 'Add to bag', quickAdd: 'Add', all: 'All',
    color: 'Color', price: 'Price', emptyWishlist: 'Your wishlist is empty', delivery: 'Delivery fee by area', name: 'Full name', phone: 'Phone number', address: 'Location / address', confirm: 'Place order via WhatsApp', total: 'Total',
    browseWorld: 'Explore our world', browseCollection: 'Explore the collection', newCollection: 'The new Moon Face collection', heroDescription: 'Moon Face pairs modern simplicity with considered craftsmanship. Every piece is made for people moving through life with confidence and purpose.',
    designStory: 'The design story', notJustClothes: 'More than clothes', details: 'It is in the details', curated: 'Curated for you', collection: 'The collection', lookbook: 'Watch the lookbook', searchPlaceholder: 'Search by style or color...', searchAria: 'Search', removeWishlist: 'Remove from wishlist', openCart: 'Open shopping bag', happyCustomers: 'Happy customers', uniqueDesigns: 'Unique designs', averageRating: 'Average rating', exploreCollection: 'Explore collection', rights: 'All rights reserved', westBank: 'West Bank', jerusalem: 'Jerusalem', inside: 'Inside',
    shippingPolicy: 'Shipping Policy', exchangePolicy: 'Exchange Policy', returnPolicy: 'Return Policy', close: 'Close', changeLanguage: 'Change language',
    designedBy: 'Designed and supported by', products: 'Products', shopByType: 'Shop by type', noSpecificProductTypes: 'No specific types yet', productPages: 'Product pages', previousPage: 'Previous page', nextPage: 'Next page', comingSoon: 'Coming soon', typeHijabs: 'Hijabs', previousMedia: 'Previous media', nextMedia: 'Next media', showMedia: 'Show media',
    customerAccount: 'Customer account', myAccount: 'My account', guestAccount: 'Guest account', guestName: 'Guest', guestBrowse: 'Browsing as a guest', signInOrCreate: 'Sign in or create an account', login: 'Sign in', signUp: 'Sign up', createAccount: 'Create account', email: 'Email address', password: 'Password', confirmPassword: 'Confirm password', passwordHint: 'Strong password, at least 12 characters', showPassword: 'Show password', hidePassword: 'Hide password', forgotPassword: 'Forgot password?', resetCodeInstructions: 'Enter your account email to receive a password reset code.', sendResetCode: 'Send reset code', resetCodeSent: 'We sent a reset code to your email.', resetCode: 'Reset code', updatePassword: 'Change password', resendResetCode: 'Send a new code', backToLogin: 'Back to sign in', passwordUpdated: 'Password changed. You can sign in now.', continueGoogle: 'Continue with Google', continueGuest: 'Continue as a guest', authUnavailable: 'Authentication is not configured. Add the local Supabase settings and run supabase.sql.', authError: 'Unable to complete the request.', passwordMismatch: 'Passwords do not match.', accountCreated: 'Account created.', confirmEmail: 'Check your email to confirm your account, then sign in.', accountLoadError: 'Unable to load account details.', orderNotFound: 'We could not find an order with those details.', orderLookupError: 'Unable to look up the order.', closeAccount: 'Close account',
    myOrders: 'My orders', orderCount: 'orders', searchOrder: 'Search by order number', loading: 'Loading...', noMatchingOrder: 'No order matches those details.', noOrdersYet: 'No orders yet.', myInteractions: 'My activity', likesLabel: 'Likes', savesLabel: 'Saved items', signOut: 'Sign out', trackingOrder: 'Track an order', orderNumber: 'Order number', orderTrackingCode: 'Private tracking code', findOrder: 'Find order', orderStatus: 'Status', orderDate: 'Order date', statusNew: 'Under review', statusCancelled: 'Cancelled', statusPostponed: 'Postponed', statusDelivered: 'Delivered', statusExchanged: 'Exchanged', orderRecorded: 'Order placed', orderTrackingHint: 'Keep both the order number and private code to track its status.', loyaltyPoints: 'Loyalty points', loyaltyEarnHint: 'Points are added after an order is delivered.',
    rating: 'Rating', reviews: 'reviews', basedOn: 'based on', outOf: 'out of', stars: 'stars', likeProduct: 'Like product', productComments: 'Product comments', reviewProduct: 'Rate product', yourReview: 'Your rating', starCount: 'Star rating', yourNameOptional: 'Your name (optional)', writeReview: 'Write your product review...', submitReview: 'Submit review', reviewThanks: 'Your review was received and will appear after moderation.', sendComment: 'Send comment', signInToComment: 'Sign in to write a comment', noComments: 'No comments yet.', writeComment: 'Write a comment...',
    typesKicker: 'Shop by category', typesTitle: 'Clothing categories', typeSets: 'Sets', typeTops: 'Tops', typeShirts: 'Shirts', typeModal: 'Modal', typeChiffon: 'Chiffon', typeCotton: 'Cotton', allTypes: 'All types',
    offersKicker: 'Moon Face picks', offersTitle: 'Special offers', offersHint: 'Reduced prices on selected pieces', discount: 'OFF', productTypeFilter: 'Product type', productNameFilter: 'Product name', noProducts: 'No products match this selection yet',
    tutorialsTitle: 'Guides', noTutorials: 'No guides yet', reelsTitle: 'Reels', noReels: 'No reels yet', addReelVideos: 'Add reel videos', reelProduct: 'Linked product', reelCaption: 'Reel caption', feedbackTitle: 'Reviews, feedback, and ideas', feedbackType: 'Message type', feedbackOpinion: 'Opinion', feedbackNote: 'Feedback', feedbackIdea: 'Idea', feedbackName: 'Name (optional)', feedbackReplyEmail: 'Email for a reply (optional)', feedbackMessage: 'Write your message', feedbackSubmit: 'Send by email', feedbackEmailMissing: 'Feedback email is not configured yet.', feedbackEmailOpening: 'Your email app is opening with your message.', feedbackSaveError: 'Could not save the feedback to the database. It was not sent.',
    inStock: 'In stock', outOfStock: 'Sold out', selectColor: 'Choose a color', detailsLabel: 'Product details', relatedProducts: 'Related products', recentlyViewed: 'Recently viewed', scrollToTop: 'Scroll to top', pullToRefresh: 'Pull down to refresh', releaseToRefresh: 'Release to refresh', refreshingPage: 'Refreshing the store...', seoStoreTitle: 'Moon Face | Thoughtfully selected hijabs', seoStoreDescription: 'Explore thoughtfully selected hijabs in earth-inspired colors, designed to accompany you every day.', shareProduct: 'Share product', shareLinkCopied: 'Product link copied.', shareLinkFailed: 'Unable to share or copy the product link.', showMoreProducts: 'Show remaining products', showFewerProducts: 'Show fewer', deleteComment: 'Delete comment', confirmDeleteComment: 'Delete this comment permanently?',
    salesLabel: 'Special offer', newTag: 'New', bestSeller: 'Best seller', limitedTag: 'Limited', popularTag: 'Popular', exclusiveTag: 'Exclusive', featuredTag: 'Featured', shippingPolicyText: 'Delivery fees: West Bank ₪20, Jerusalem ₪30, and inside ₪70. Delivery is charged separately and is not included in product discounts.', exchangePolicyText: 'Exchanges are not available.', returnPolicyText: 'Returns are not available.',
    emptyCart: 'Your shopping bag is empty', couponPlaceholder: 'Discount code (optional)', applyCoupon: 'Apply', couponSuccess: 'Discount applied to products', couponInvalid: 'Invalid discount code', subtotal: 'Products subtotal', couponDiscount: 'Discount', deliveryFee: 'Delivery', removeItem: 'Remove item', increaseQuantity: 'Increase quantity', decreaseQuantity: 'Decrease quantity', productLabel: 'Product', quantity: 'Qty', lineTotal: 'Line total', orderHeading: 'New Moon Face order', redeemPoints: 'Redeem points', pointsWorth: 'Discount value', cartReminderOptIn: 'Enable cart reminder notifications', notificationEnabled: 'Cart reminders enabled.', notificationSetupError: 'Could not enable cart reminders.', openWheel: 'Open the prize wheel', spinWheelTitle: 'Spin the wheel', spinWheelHint: 'Take a spin and discover your prize', wheelOptions: 'Wheel options', wheelError: 'The spin could not be saved. Please try again.', wheelPointsWon: 'loyalty points', wheelDiscountWon: 'discount coupon', wheelResult: 'Your prize', wheelRewardCode: 'Use this code at checkout', wheelCopyCode: 'Copy discount code', wheelCodeCopied: 'Discount code copied', wheelCopyFailed: 'Could not copy the code. Select and copy it manually.', wheelSpinning: 'Spinning...', spinNow: 'Spin now', wheelPointsClaimed: 'Prize points added to your account', orderPreview: 'Order preview', orderContents: 'Order contents', emptyOrderItems: 'There are no products in this order.', size: 'Size',
    heroEyebrow: 'The new Moon Face collection', heroLine1: 'Wear', heroLine2: 'the essence', heroLine3: 'of tomorrow', heroPrimary: 'Explore the collection', heroSecondary: 'Watch the lookbook', premiumQuality: 'Premium quality', organicFabrics: 'Thoughtful, comfortable fabrics', scrollDown: 'Scroll to explore',
    featuredIn: 'As featured in',
    region: 'Area', collectionPiece: 'A signature piece from the collection', storyEyebrow: 'Our design story', storyTitle: 'More than clothing', storyHighlight: 'Made for the details', storyDescription: 'Thoughtfully crafted from quality yarns for your everyday movement, with pieces designed to make a lasting impression.',
    featureTitle1: 'Considered fabrics', featureDescription1: 'We carefully select our materials for lasting comfort and a refined, modern feel.', featureTitle2: 'Design with identity', featureDescription2: 'Every design carries its own story and thoughtful details that set it apart.', featureTitle3: 'Comfort for every day', featureDescription3: 'Practical pieces for your busy day, balancing ease with considered style.',
  },
};

export function translateText(key: string, language: Language) {
  return dictionaries[language][key] || key;
}

const Context = createContext<{ language: Language; setLanguage: (language: Language) => void; t: (key: string) => string }>({
  language: 'ar', setLanguage: () => undefined, t: (key) => key,
});

function readSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem('moon-face-language');
    if (saved === 'en') return 'en';
    if (saved !== 'ar') localStorage.setItem('moon-face-language', 'ar');
    return 'ar';
  } catch {
    return 'ar';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readSavedLanguage);
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    document.dispatchEvent(new CustomEvent<Language>('moon-face:language-changed', { detail: next }));
    try { localStorage.setItem('moon-face-language', next); } catch { /* Storage can be unavailable. */ }
  };
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string) => dictionaries[language][key] || key }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useLanguage = () => useContext(Context);

export function normalizeProductType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[أإآ]/g, 'ا');
  const aliases: Record<string, string> = {
    'اطقم': 'sets', 'طقم': 'sets', sets: 'sets', set: 'sets',
    'بلايز': 'tops', 'بلوزة': 'tops', tops: 'tops', top: 'tops',
    'قمصان': 'shirts', 'قميص': 'shirts', shirts: 'shirts', shirt: 'shirts',
    'حجابات': 'hijabs', 'حجاب': 'hijabs', hijabs: 'hijabs', hijab: 'hijabs',
  };
  return aliases[normalized] || normalized;
}

export function translateProductType(value: string, language: Language) {
  const keyByType: Record<string, keyof typeof dictionaries.ar> = { sets: 'typeSets', tops: 'typeTops', shirts: 'typeShirts', hijabs: 'typeHijabs', مودال: 'typeModal', modal: 'typeModal', شيفون: 'typeChiffon', chiffon: 'typeChiffon', قطن: 'typeCotton', cotton: 'typeCotton' };
  const key = keyByType[normalizeProductType(value)];
  return key ? dictionaries[language][key] : value;
}

export function translateProductColor(value: string, language: Language) {
  if (language === 'ar') return value;
  const normalized = value.trim().toLowerCase().replace(/[أإآ]/g, 'ا');
  const colors: Record<string, string> = {
    'ابيض': 'White', white: 'White', 'اسود': 'Black', black: 'Black',
    'كحلي': 'Navy', navy: 'Navy', 'بني': 'Brown', brown: 'Brown',
    'بني غامق': 'Dark brown', 'بني فاتح': 'Light brown', 'بيج': 'Beige', beige: 'Beige',
    'عنابي': 'Burgundy', burgundy: 'Burgundy', 'زيتي': 'Olive', olive: 'Olive',
    'رمادي': 'Gray', gray: 'Gray', grey: 'Gray', 'احمر': 'Red', red: 'Red',
    'ازرق': 'Blue', blue: 'Blue', 'اخضر': 'Green', green: 'Green',
    'موكا': 'Mocha', mocha: 'Mocha', 'فستقي': 'Pistachio', pistachio: 'Pistachio', 'وردي': 'Pink', pink: 'Pink',
    'اصفر': 'Yellow', yellow: 'Yellow', 'برتقالي': 'Orange', orange: 'Orange',
  };
  const translation = colors[normalized];
  return language === 'en' ? translation || value : value;
}

export function translateProductBadge(value: string, language: Language) {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, keyof typeof dictionaries.ar> = {
    'جديد': 'newTag', new: 'newTag', 'الأكثر مبيعًا': 'bestSeller', 'الاكثر مبيعا': 'bestSeller', 'best seller': 'bestSeller',
    'limited': 'limitedTag', 'محدود': 'limitedTag', 'كمية محدودة': 'limitedTag', 'popular': 'popularTag', 'شائع': 'popularTag', 'الأكثر طلبًا': 'popularTag',
    'exclusive': 'exclusiveTag', 'حصري': 'exclusiveTag', 'مميز': 'featuredTag', featured: 'featuredTag', 'عرض خاص': 'salesLabel', 'special offer': 'salesLabel',
  };
  const key = aliases[normalized];
  return key ? dictionaries[language][key] : value;
}
