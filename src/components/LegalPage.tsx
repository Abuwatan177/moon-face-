import { ArrowRight } from 'lucide-react';
import Footer from './Footer';
import { defaultSiteContent } from '../data/siteContent';
import { useLanguage } from '../i18n';

type LegalPageName = 'privacy' | 'terms';

const legalContent = {
  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      intro: 'توضح هذه السياسة كيفية تعامل متجر Moon Face مع المعلومات الشخصية عند تصفح الموقع أو إتمام طلب.',
      sections: [
        ['المعلومات التي نجمعها', 'قد نجمع الاسم ورقم الهاتف وعنوان التوصيل والمنطقة وتفاصيل المنتجات المطلوبة، إضافة إلى معلومات التواصل التي يختار العميل تزويدنا بها. نستخدم هذه البيانات لمعالجة الطلب والتواصل بشأنه وتسليمه.'],
        ['استخدام البيانات ومشاركتها', 'نستخدم البيانات بالقدر اللازم لتقديم خدمات المتجر وإدارة الطلبات وخدمة العملاء. لا نبيع البيانات الشخصية ولا نشاركها مع أطراف ثالثة، باستثناء شركات التوصيل اللازمة لإيصال الطلب أو إذا ألزمنا القانون بذلك.'],
        ['حماية المعلومات والاحتفاظ بها', 'نتخذ تدابير إدارية وتقنية معقولة لحماية بيانات الطلبات من الوصول أو الاستخدام غير المصرح به، ونحتفظ بها للمدة اللازمة لمعالجة الطلبات والالتزامات المحاسبية والقانونية.'],
        ['حقوق العميل والتواصل', 'يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو الاستفسار عن استخدامها عبر قنوات التواصل الموضحة في أسفل الصفحة، مع مراعاة ما يلزم الاحتفاظ به لتنفيذ الطلب أو بموجب القانون.'],
      ],
      englishTitle: 'Privacy Policy (English summary)',
      english: 'Moon Face collects the name, phone number, delivery address, area, and order details needed to process and deliver purchases. Personal data is not sold or shared with third parties except delivery providers or where required by law. We use reasonable safeguards and retain order information only as needed for service and legal obligations. Contact us using the details in the footer to ask about or request correction of your information.',
    },
    en: {
      title: 'Privacy Policy',
      intro: 'This policy explains how Moon Face handles personal information when you browse the store or place an order.',
      sections: [
        ['Information we collect', 'We may collect your name, phone number, delivery address, area, order items, and any contact information you choose to provide. We use these details to process, communicate about, and deliver your order.'],
        ['Use and sharing', 'We use information only as needed to operate the store, manage orders, and provide customer service. We do not sell personal data or share it with third parties except delivery companies needed to fulfill an order or where disclosure is required by law.'],
        ['Security and retention', 'We use reasonable administrative and technical safeguards to protect order information from unauthorized access or use. We retain it for as long as needed to fulfill orders and meet accounting or legal obligations.'],
        ['Your choices and contact', 'You may contact us using the details in the footer to ask about, access, or request correction of your information, subject to records we must retain to fulfill an order or comply with law.'],
      ],
      englishTitle: '',
      english: '',
    },
  },
  terms: {
    ar: {
      title: 'الشروط والأحكام',
      intro: 'باستخدام موقع Moon Face أو تقديم طلب من خلاله، فإنك توافق على الشروط التالية.',
      sections: [
        ['استخدام الموقع', 'يرجى استخدام الموقع لأغراض مشروعة وتقديم معلومات صحيحة عند الطلب. يجوز لنا تعليق الوصول عند إساءة استخدام الموقع أو محاولة الإضرار به أو بحقوق الآخرين.'],
        ['المنتجات والأسعار', 'نبذل عناية معقولة لعرض الحجابات والشالات وألوانها ومواصفاتها وأسعارها بوضوح. قد تختلف درجات الألوان قليلًا بسبب إعدادات الشاشة أو الإضاءة، وقد تتغير الأسعار أو التوفر قبل تأكيد الطلب. تُعرض الأسعار بعملة الشيكل ما لم يُذكر خلاف ذلك، وتُوضح رسوم التوصيل قبل إتمام الطلب.'],
        ['تأكيد الطلب والدفع', 'يخضع قبول الطلب لتوفر المنتجات وصحة بيانات التواصل والتوصيل. يُرسل الطلب عبر واتساب ويُعد مؤكداً بعد مراجعته وتأكيده من Moon Face. يكون الدفع نقداً عند الاستلام ما لم يُتفق على خلاف ذلك.'],
        ['الملكية الفكرية', 'اسم Moon Face وشعارها والصور والنصوص والتصاميم المنشورة في الموقع مملوكة لـ Moon Face أو مستخدمة بإذن، وهي محمية بموجب حقوق الملكية الفكرية. لا يجوز نسخها أو إعادة استخدامها تجارياً دون موافقة خطية مسبقة.'],
        ['إخلاء المسؤولية', 'يُقدّم الموقع ومحتواه وفق المتاح، ونسعى إلى إبقاء المعلومات دقيقة ومحدثة دون ضمان خلوها من الأخطاء أو الانقطاع. لا يحد هذا النص من أي حقوق إلزامية يقررها القانون المعمول به.'],
        ['التعديلات والتواصل', 'قد نحدّث هذه الشروط عند الحاجة، وتسري النسخة المنشورة على الموقع من وقت نشرها. للاستفسارات، استخدم بيانات التواصل الظاهرة في أسفل الصفحة.'],
      ],
      englishTitle: 'Terms & Conditions (English summary)',
      english: 'By using Moon Face or placing an order, you agree to use the site lawfully and provide accurate order details. We take reasonable care to describe our hijabs and shawls, colors, and prices, though screen differences may affect appearance and availability or prices may change before confirmation. Orders are sent through WhatsApp and are confirmed after review and confirmation by Moon Face. Payment is due in cash on delivery unless otherwise agreed. Moon Face names, logos, images, text, and designs are protected intellectual property and may not be reused commercially without written permission. The site is provided as available; nothing here limits rights that cannot be excluded under applicable law. We may update these terms and publish the current version on this page.',
    },
    en: {
      title: 'Terms & Conditions',
      intro: 'By using Moon Face or placing an order through this website, you agree to the following terms.',
      sections: [
        ['Using the website', 'Use the website lawfully and provide accurate information when placing an order. We may restrict access in response to misuse, attempts to harm the site, or infringement of others’ rights.'],
        ['Products and prices', 'We take reasonable care to describe our hijabs and shawls, colors, specifications, and prices. Screen and lighting differences may affect how colors appear, and prices or availability may change before an order is confirmed. Prices are shown in ILS unless stated otherwise, and delivery fees are disclosed before order completion.'],
        ['Payment and order confirmation', 'Orders are subject to product availability and valid contact and delivery details. Orders are sent through WhatsApp and are confirmed after review and confirmation by Moon Face. Payment is due in cash on delivery unless otherwise agreed.'],
        ['Intellectual property', 'The Moon Face name and logo, and the images, text, and designs published on this website, are owned by Moon Face or used with permission and are protected by intellectual property laws. Commercial copying or reuse requires prior written consent.'],
        ['Disclaimer', 'The website and its content are provided as available. We work to keep information accurate and current but do not warrant that it will always be error-free or uninterrupted. Nothing in these terms limits rights that cannot be excluded under applicable law.'],
        ['Changes and contact', 'We may update these terms when needed; the version published on this page applies from its publication. Contact us using the details shown in the footer.'],
      ],
      englishTitle: '',
      english: '',
    },
  },
} as const;

export default function LegalPage({ page }: { page: LegalPageName }) {
  const { language } = useLanguage();
  const content = legalContent[page][language];
  const direction = language === 'ar' ? 'rtl' : 'ltr';

  return <div className="min-h-screen bg-[#f6f3e8] text-[#3d4432]" dir={direction}>
    <header className="border-b border-[#d9cbb8] bg-[#f6f3e8]/95 px-5 py-5 sm:px-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <a href="/" className="font-display text-2xl font-semibold text-[#3D2C22]">Moon Face</a>
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5f6548] hover:underline">
          <ArrowRight size={17} className={language === 'en' ? 'rotate-180' : ''} />
          {language === 'en' ? 'Back to store' : 'العودة إلى المتجر'}
        </a>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-10 sm:py-16">
      <p className="font-display text-sm font-semibold uppercase text-[#727653]">Moon Face · {language === 'en' ? 'Customer information' : 'معلومات العملاء'}</p>
      <h1 className="mt-3 text-3xl font-bold text-[#3D2C22] sm:text-4xl">{content.title}</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-[#535449]">{content.intro}</p>
      <div className="mt-10 divide-y divide-[#d9cbb8] border-y border-[#d9cbb8]">
        {content.sections.map(([heading, body]) => <section key={heading} className="py-6">
          <h2 className="text-xl font-bold text-[#3D2C22]">{heading}</h2>
          <p className="mt-3 leading-8 text-[#535449]">{body}</p>
        </section>)}
      </div>
      {content.english && <section className="mt-10 border-s-2 border-[#727653] ps-5" dir="ltr">
        <h2 className="text-xl font-bold text-[#3D2C22]">{content.englishTitle}</h2>
        <p className="mt-3 leading-8 text-[#535449]">{content.english}</p>
      </section>}
    </main>
    <Footer policies={defaultSiteContent.policies} />
  </div>;
}