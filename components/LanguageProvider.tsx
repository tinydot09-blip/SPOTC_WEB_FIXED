'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type SpotcLanguage = 'en' | 'ta';

const STORAGE_KEY = 'spotc-language';

const TA: Record<string, string> = {
  'Offers': 'ஆஃபர்கள்',
  'Shop': 'ஷாப்பிங்',
  'Spots': 'ஸ்பாட்ஸ்',
  'Search': 'தேடுங்கள்',
  'Search products': 'பொருட்களைத் தேடுங்கள்',
  'Search products...': 'பொருட்களைத் தேடுங்கள்...',
  'Search offers': 'ஆஃபர்களைத் தேடுங்கள்',
  'Search offers...': 'ஆஃபர்களைத் தேடுங்கள்...',
  'Search spots': 'ஸ்பாட்ஸைத் தேடுங்கள்',
  'Search spots...': 'ஸ்பாட்ஸைத் தேடுங்கள்...',
  'Search suggestions': 'தேடல் பரிந்துரைகள்',
  'Clear search': 'தேடலை அழிக்கவும்',
  'Sign in': 'உள்நுழைக',
  'Sign In': 'உள்நுழைக',
  'Login': 'உள்நுழைக',
  'Logout': 'வெளியேறு',
  'Profile': 'சுயவிவரம்',
  'Dashboard': 'டாஷ்போர்டு',
  'My Orders': 'என் ஆர்டர்கள்',
  'Orders': 'ஆர்டர்கள்',
  'Shopping Circles': 'ஷாப்பிங் சர்க்கிள்ஸ்',
  'Become Business Partner': 'வணிக கூட்டாளராகுங்கள்',
  'Become Creator': 'கிரியேட்டராகுங்கள்',
  'Open profile menu': 'சுயவிவர மெனுவைத் திறக்கவும்',
  'Close': 'மூடு',
  'Continue': 'தொடரவும்',
  'Cancel': 'ரத்து செய்',
  'Back': 'பின்செல்',
  'Next': 'அடுத்து',
  'Save': 'சேமிக்கவும்',
  'Edit': 'திருத்து',
  'Delete': 'நீக்கு',
  'Remove': 'அகற்று',
  'Confirm': 'உறுதிப்படுத்து',
  'Apply': 'பயன்படுத்து',
  'View': 'பார்க்க',
  'View Shop': 'கடையைப் பார்க்க',
  'View Product': 'பொருளைப் பார்க்க',
  'View Details': 'விவரங்களைப் பார்க்க',
  'Share': 'பகிர்',
  'Like': 'விருப்பம்',
  'Report': 'புகார்',
  'WhatsApp': 'வாட்ஸ்அப்',
  'All': 'அனைத்தும்',
  'Newest': 'புதியவை',
  'Biggest Discount': 'அதிக தள்ளுபடி',
  'Price: Low to High': 'விலை: குறைவிலிருந்து அதிகம்',
  'Price: High to Low': 'விலை: அதிகத்திலிருந்து குறைவு',
  'Girl Dress': 'பெண் குழந்தைகள் உடை',
  'Earrings': 'காதணிகள்',
  'Toys': 'பொம்மைகள்',
  'Add': 'சேர்',
  'Add to Cart': 'கார்டில் சேர்க்க',
  'Buy Now': 'இப்போது வாங்க',
  'Browse': 'பார்க்க',
  'Cart': 'கார்ட்',
  'Shopping Cart': 'ஷாப்பிங் கார்ட்',
  'Your cart': 'உங்கள் கார்ட்',
  'Your Cart': 'உங்கள் கார்ட்',
  'Cart is empty': 'உங்கள் கார்ட் காலியாக உள்ளது',
  'Your cart is empty': 'உங்கள் கார்ட் காலியாக உள்ளது',
  'Continue Shopping': 'ஷாப்பிங்கைத் தொடரவும்',
  'Proceed to Checkout': 'செக்அவுட் செல்லவும்',
  'Checkout': 'செக்அவுட்',
  'Place Order': 'ஆர்டர் செய்யவும்',
  'Order Now': 'இப்போது ஆர்டர் செய்யவும்',
  'Order Summary': 'ஆர்டர் சுருக்கம்',
  'Order Details': 'ஆர்டர் விவரங்கள்',
  'Order Total': 'மொத்த ஆர்டர் தொகை',
  'Subtotal': 'பொருட்களின் மொத்தம்',
  'Total': 'மொத்தம்',
  'Delivery': 'டெலிவரி',
  'Delivery Charge': 'டெலிவரி கட்டணம்',
  'Delivery charge': 'டெலிவரி கட்டணம்',
  'FREE Delivery': 'இலவச டெலிவரி',
  'Free Delivery': 'இலவச டெலிவரி',
  'FREE': 'இலவசம்',
  'Free': 'இலவசம்',
  'FREE Gift': 'இலவச பரிசு',
  'Free Gift': 'இலவச பரிசு',
  'FREE Gifts': 'இலவச பரிசுகள்',
  'Free Gifts': 'இலவச பரிசுகள்',
  'Choose your FREE Gift': 'உங்கள் இலவச பரிசைத் தேர்ந்தெடுக்கவும்',
  'Select Free Gift': 'இலவச பரிசைத் தேர்ந்தெடுக்கவும்',
  'Confirm Free Gift': 'இலவச பரிசை உறுதிப்படுத்தவும்',
  'Select any 1 item below': 'கீழே உள்ளவற்றில் ஏதேனும் 1 பொருளைத் தேர்ந்தெடுக்கவும்',
  'Quantity': 'அளவு',
  'Size': 'அளவு',
  'Color': 'நிறம்',
  'Age': 'வயது',
  'Measurements': 'அளவுகள்',
  'Product Details': 'பொருள் விவரங்கள்',
  'Description': 'விளக்கம்',
  'Delivery & Return': 'டெலிவரி & ரிட்டர்ன்',
  'Delivery & Returns': 'டெலிவரி & ரிட்டர்ன்',
  'Return & Exchange': 'ரிட்டர்ன் & மாற்றம்',
  'Reviews': 'மதிப்புரைகள்',
  'In Stock': 'ஸ்டாக்கில் உள்ளது',
  'Out of Stock': 'ஸ்டாக் இல்லை',
  'Offer': 'ஆஃபர்',
  'Offer Price': 'ஆஃபர் விலை',
  'Compare Online': 'ஆன்லைனில் ஒப்பிடு',
  'Compare': 'ஒப்பிடு',
  'Ask Friends': 'நண்பர்களிடம் கேளுங்கள்',
  'Ask Friends & Family': 'நண்பர்கள் & குடும்பத்தினரிடம் கேளுங்கள்',
  'Should I buy this?': 'நான் இதை வாங்கலாமா?',
  'Which one should I buy?': 'நான் எதை வாங்க வேண்டும்?',
  'Buy it': 'வாங்கலாம்',
  'Looks good': 'நன்றாக உள்ளது',
  'Not sure': 'தெரியவில்லை',
  "Don't buy": 'வாங்க வேண்டாம்',
  'Discussion': 'கலந்துரையாடல்',
  'Participants': 'பங்கேற்பாளர்கள்',
  'Send': 'அனுப்பு',
  'Type a message': 'செய்தியை தட்டச்சு செய்யவும்',
  'Type a message...': 'செய்தியை தட்டச்சு செய்யவும்...',
  'Share Circle': 'சர்க்கிளை பகிரவும்',
  'Copy Link': 'லிங்கை நகலெடுக்கவும்',
  'Address': 'முகவரி',
  'Delivery Address': 'டெலிவரி முகவரி',
  'Add Address': 'முகவரி சேர்க்க',
  'Add New Address': 'புதிய முகவரி சேர்க்க',
  'Save Address': 'முகவரியை சேமிக்கவும்',
  'Change Address': 'முகவரியை மாற்றவும்',
  'Home': 'வீடு',
  'Work': 'வேலை',
  'Other': 'மற்றவை',
  'Name': 'பெயர்',
  'Phone': 'தொலைபேசி',
  'Phone Number': 'தொலைபேசி எண்',
  'House / Flat No.': 'வீடு / பிளாட் எண்',
  'Street': 'தெரு',
  'Area': 'பகுதி',
  'City': 'நகரம்',
  'Pincode': 'அஞ்சல் குறியீடு',
  'Payment': 'கட்டணம்',
  'Payment Method': 'கட்டண முறை',
  'Cash on Delivery': 'டெலிவரியின் போது பணம்',
  'Order Placed': 'ஆர்டர் செய்யப்பட்டது',
  'Order Confirmed': 'ஆர்டர் உறுதிசெய்யப்பட்டது',
  'Order Successful': 'ஆர்டர் வெற்றிகரமாக செய்யப்பட்டது',
  'Thank you for your order!': 'உங்கள் ஆர்டருக்கு நன்றி!',
  'Track Order': 'ஆர்டரை கண்காணிக்கவும்',
  'Delivery not available here yet': 'இங்கு இன்னும் டெலிவரி கிடைக்கவில்லை',
  'You can browse products. Ordering is available within 5 km only.': 'நீங்கள் பொருட்களை பார்க்கலாம். 5 கி.மீ. சுற்றளவில் மட்டும் ஆர்டர் செய்யலாம்.',
  'Continue Browsing': 'பார்ப்பதைத் தொடரவும்',
  'Enable location': 'இருப்பிடத்தை இயக்கவும்',
  'Enable Location': 'இருப்பிடத்தை இயக்கவும்',
  'Location': 'இருப்பிடம்',
  '15 mins': '15 நிமிடங்கள்',
  '15 mins delivery': '15 நிமிட டெலிவரி',
  'Loading...': 'ஏற்றுகிறது...',
  'Loading': 'ஏற்றுகிறது',
  'Try again': 'மீண்டும் முயற்சிக்கவும்',
  'Something went wrong': 'ஏதோ தவறு ஏற்பட்டது',
  'No products found': 'பொருட்கள் எதுவும் கிடைக்கவில்லை',
  'No results found': 'முடிவுகள் எதுவும் கிடைக்கவில்லை',
  'No reliable online match found': 'நம்பகமான ஆன்லைன் பொருத்தம் கிடைக்கவில்லை',
  'Search online': 'ஆன்லைனில் தேடுங்கள்',
  'Online Price': 'ஆன்லைன் விலை',
  'Our Price': 'எங்கள் விலை',
  'You Save': 'நீங்கள் சேமிப்பது',
  'Details': 'விவரங்கள்',
  'About': 'பற்றி',
  'Contact': 'தொடர்பு',
  'Privacy': 'தனியுரிமை',
  'Terms': 'விதிமுறைகள்',
};

const LanguageContext = createContext<{
  language: SpotcLanguage;
  setLanguage: (language: SpotcLanguage) => void;
  toggleLanguage: () => void;
}>({
  language: 'en',
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
});

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

const translateString = (value: string): string => {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;

  const exact = TA[core];
  if (exact) return `${leading}${exact}${trailing}`;

  const searchMatch = core.match(/^Search results for [“\"](.+?)[”\"](?:\s*[·•]\s*(\d+)\s*(product|products))?$/i);
  if (searchMatch) {
    const countPart = searchMatch[2]
      ? ` · ${searchMatch[2]} ${searchMatch[3] === 'product' ? 'பொருள்' : 'பொருட்கள்'}`
      : '';
    return `${leading}“${searchMatch[1]}” தேடல் முடிவுகள்${countPart}${trailing}`;
  }

  const itemsMatch = core.match(/^(\d+) items?$/i);
  if (itemsMatch) return `${leading}${itemsMatch[1]} பொருட்கள்${trailing}`;

  const kmMatch = core.match(/^([\d.]+)\s*km$/i);
  if (kmMatch) return `${leading}${kmMatch[1]} கி.மீ.${trailing}`;

  return value;
};

const shouldSkip = (element: Element | null): boolean => {
  if (!element) return true;
  if (element.closest('[data-no-translate="true"]')) return true;
  if (element.closest('script, style, code, pre, textarea')) return true;
  return false;
};

const translateTree = (root: ParentNode, language: SpotcLanguage) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (shouldSkip(parent)) continue;

    if (!originalText.has(node)) originalText.set(node, node.nodeValue ?? '');
    const source = originalText.get(node) ?? '';
    const target = language === 'ta' ? translateString(source) : source;
    if (node.nodeValue !== target) node.nodeValue = target;
  }

  const elements: Element[] = [];
  if (root instanceof Element) elements.push(root);
  elements.push(...Array.from(root.querySelectorAll('*')));

  for (const element of elements) {
    if (shouldSkip(element)) continue;
    let saved = originalAttributes.get(element);
    if (!saved) {
      saved = new Map<string, string>();
      originalAttributes.set(element, saved);
    }

    for (const attr of TRANSLATABLE_ATTRIBUTES) {
      const currentValue = element.getAttribute(attr);
      if (currentValue == null) continue;
      if (!saved.has(attr)) saved.set(attr, currentValue);
      const source = saved.get(attr) ?? currentValue;
      const target = language === 'ta' ? translateString(source) : source;
      if (currentValue !== target) element.setAttribute(attr, target);
    }
  }
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SpotcLanguage>('en');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'ta' || saved === 'en') setLanguageState(saved);
  }, []);

  const setLanguage = useCallback((next: SpotcLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'ta' : 'en');
  }, [language, setLanguage]);

  useEffect(() => {
    document.documentElement.lang = language === 'ta' ? 'ta' : 'en';
    document.documentElement.dataset.spotcLanguage = language;

    if (window.location.pathname.startsWith('/admin')) return;

    let scheduled = false;
    const apply = () => {
      scheduled = false;
      translateTree(document.body, language);
    };

    apply();

    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(apply);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });

    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage }),
    [language, setLanguage, toggleLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useSpotcLanguage = () => useContext(LanguageContext);