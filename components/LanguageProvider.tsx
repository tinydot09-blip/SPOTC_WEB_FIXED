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
  'Product Description': 'பொருள் விளக்கம்',
  'Find similar products & best prices': 'ஒத்த பொருட்கள் மற்றும் சிறந்த விலைகளைப் பாருங்கள்',
  'Share with friends & family to get opinions': 'கருத்து பெற நண்பர்கள் மற்றும் குடும்பத்தினருடன் பகிருங்கள்',
  'SpotC Price': 'SpotC விலை',
  'Adorable mustard yellow long-sleeve dress for baby girls, featuring a cute teddy bear applique on the front. Designed with a comfortable ribbed texture and a contrasting navy blue belt that ties at the waist. Perfect for everyday wear and special occasions.': 'பெண் குழந்தைகளுக்கான அழகான மஸ்டர்ட் மஞ்சள் நிற முழுக்கை உடை. முன்புறத்தில் அழகான டெடி பியர் அலங்காரம் உள்ளது. மென்மையான ரிப்ப்ட் துணி அமைப்புடன், இடுப்பில் கட்டிக்கொள்ளும் நேவி ப்ளூ பெல்ட் உள்ளது. தினசரி அணிவதற்கும் சிறப்பு நிகழ்ச்சிகளுக்கும் ஏற்றது.',
  'Soft Cotton Blend Fabric': 'மென்மையான காடன் கலவை துணி',
  'Cute Teddy Bear Applique': 'அழகான டெடி பியர் அலங்காரம்',
  'Comfortable Long Sleeves': 'வசதியான முழுக்கைகள்',
  'Stylish Navy Blue Belt Detail': 'ஸ்டைலிஷ் நேவி ப்ளூ பெல்ட் வடிவமைப்பு',
  'Ribbed Texture Design': 'ரிப்ப்ட் டெக்ஸ்சர் வடிவமைப்பு',
  'Details, brand, colour, size and availability': 'விவரங்கள், பிராண்ட், நிறம், அளவு மற்றும் கிடைப்புநிலை',
  'Highlights': 'முக்கிய அம்சங்கள்',
  'Find similar products & best prices.': 'ஒத்த பொருட்கள் மற்றும் சிறந்த விலைகளைப் பாருங்கள்.',
  'Share with friends & family to get opinions.': 'கருத்து பெற நண்பர்கள் மற்றும் குடும்பத்தினருடன் பகிருங்கள்.',
  'Delivery / Free Shipping': 'டெலிவரி / இலவச ஷிப்பிங்',
  'Fast local delivery': 'விரைவான உள்ளூர் டெலிவரி',
  'Free shipping available': 'இலவச ஷிப்பிங் கிடைக்கிறது',
  '5-minute doorstep fit check for eligible clothing': 'தகுதியான ஆடைகளுக்கு வீட்டு வாசலில் 5 நிமிட ஃபிட் சரிபார்ப்பு',
  'Be the first to review': 'முதல் மதிப்புரையை பதிவு செய்யுங்கள்',
  'Instant': 'உடனடி',
  'Morning': 'காலை',
  'Afternoon': 'மதியம்',
  'Night': 'இரவு',
  'About 15 mins · ₹20': 'சுமார் 15 நிமிடங்கள் · ₹20',
  'Order 6 AM–12 PM · Delivery 12–2 PM · FREE': 'காலை 6–12 மணிக்குள் ஆர்டர் · மதியம் 12–2 மணி டெலிவரி · இலவசம்',
  'Order 12–6 PM · Delivery 6–7 PM · FREE': 'மதியம் 12–6 மணிக்குள் ஆர்டர் · மாலை 6–7 மணி டெலிவரி · இலவசம்',
  'Order 6 PM–6 AM · Delivery 6–8 AM · FREE': 'மாலை 6–காலை 6 மணிக்குள் ஆர்டர் · காலை 6–8 மணி டெலிவரி · இலவசம்',
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
  'Featured': 'சிறப்பு',
  'Select': 'தேர்ந்தெடுக்கவும்',
  'Shopping tools': 'ஷாப்பிங் கருவிகள்',
  'Contact SPOTC for additional product details.': 'கூடுதல் பொருள் விவரங்களுக்கு SPOTC-ஐ தொடர்பு கொள்ளுங்கள்.',
  'ratings': 'மதிப்பீடுகள்',
  'rating': 'மதிப்பீடு',
  'Please enable location so SPOTC can check delivery availability.': 'டெலிவரி கிடைப்பதை SPOTC சரிபார்க்க இடத்தை இயக்கவும்.',
  'SPOTC is coming to your area shortly. You can browse all products now, but ordering is not available yet.': 'SPOTC விரைவில் உங்கள் பகுதிக்கு வருகிறது. இப்போது அனைத்து பொருட்களையும் பார்க்கலாம்; ஆனால் இன்னும் ஆர்டர் செய்ய முடியாது.',
  'Enable location to check delivery availability': 'டெலிவரி கிடைப்பதைச் சரிபார்க்க இடத்தை இயக்கவும்',
  'Ordering will be available in your area shortly': 'உங்கள் பகுதியில் விரைவில் ஆர்டர் வசதி கிடைக்கும்',
  '1 product added': '1 பொருள் கார்டில் சேர்க்கப்பட்டது',
  'Try a different search term or category.': 'வேறு தேடல் சொல் அல்லது வகையை முயற்சிக்கவும்.',
  'Sort products': 'பொருட்களை வரிசைப்படுத்தவும்',
  'Main product categories': 'முக்கிய பொருள் வகைகள்',
  'Open': 'திறக்கவும்',
  'Added': 'சேர்க்கப்பட்டது',
  'Creating circle…': 'சர்க்கிள் உருவாக்கப்படுகிறது…',
  'Select up to 3 products and ask friends.': 'அதிகபட்சம் 3 பொருட்களைத் தேர்ந்தெடுத்து நண்பர்களிடம் கேளுங்கள்.',
  'products selected': 'பொருட்கள் தேர்ந்தெடுக்கப்பட்டன',
  'product selected': 'பொருள் தேர்ந்தெடுக்கப்பட்டது',
  'products': 'பொருட்கள்',
  'product': 'பொருள்',
  'Other Toys': 'மற்ற பொம்மைகள்',
  'Fun & Fidget': 'வேடிக்கை & ஃபிட்ஜெட்',
  'Balls & Outdoor': 'பந்துகள் & வெளிப்புற விளையாட்டு',
  'Learning & Creative': 'கற்றல் & படைப்பாற்றல்',
  'Vehicles & Guns': 'வாகனங்கள் & டாய் கன்கள்',
  'Dolls & Pretend Play': 'பொம்மைகள் & நடிப்பு விளையாட்டு',
  '9-12 Years': '9-12 வயது',
  '6-8 Years': '6-8 வயது',
  '3-5 Years': '3-5 வயது',
  '2-3 Years': '2-3 வயது',
  '1-2 Years': '1-2 வயது',
  '0-1 Years': '0-1 வயது',
  'Special': 'சிறப்பு',
  'Ask friends': 'நண்பர்களிடம் கேளுங்கள்',
  '15-minute delivery': '15 நிமிட டெலிவரி',
  'Ready stock': 'தயார் ஸ்டாக்',
  'In stock': 'ஸ்டாக்கில் உள்ளது',
  'Out of stock': 'ஸ்டாக் இல்லை',
  'Add to cart': 'கார்டில் சேர்க்க',
  'Buy now': 'இப்போது வாங்க',
  'Creating Shopping Circle…': 'ஷாப்பிங் சர்க்கிள் உருவாக்கப்படுகிறது…',
  'Dress details & measurements': 'உடை விவரங்கள் மற்றும் அளவுகள்',
  'Product details': 'பொருள் விவரங்கள்',
  'PRODUCT DETAILS': 'பொருள் விவரங்கள்',
  'Colour': 'நிறம்',
  'Purchase benefits': 'வாங்கும் நன்மைகள்',
  'left': 'மட்டும் உள்ளது',
  'gift included': 'இலவச பரிசு சேர்க்கப்பட்டுள்ளது',
  'gifts included': 'இலவச பரிசுகள் சேர்க்கப்பட்டுள்ளது',};

const LanguageContext = createContext<{
  language: SpotcLanguage;
  setLanguage: (language: SpotcLanguage) => void;
  toggleLanguage: () => void;
  t: (value: string) => string;
  productTitle: (value: string) => string;
}>({
  language: 'en',
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (value) => value,
  productTitle: (value) => value,
});

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

const PRODUCT_PHRASES: Array<[RegExp, string]> = [
  [/\bbaby girls?\b/gi, 'பெண் குழந்தைகள்'],
  [/\bbaby boys?\b/gi, 'ஆண் குழந்தைகள்'],
  [/\btoddler girls?\b/gi, 'சிறுமிகள்'],
  [/\btoddler boys?\b/gi, 'சிறுவர்கள்'],
  [/\bbaby unisex\b/gi, 'குழந்தைகளுக்கான'],
  [/\bfor kids\b/gi, 'குழந்தைகளுக்கு'],
  [/\bfor girls\b/gi, 'பெண் குழந்தைகளுக்கு'],
  [/\bfor boys\b/gi, 'ஆண் குழந்தைகளுக்கு'],
  [/\bfull sleeve\b/gi, 'முழுக்கை'],
  [/\bhalf sleeve\b/gi, 'அரைக்கை'],
  [/\bsleeveless\b/gi, 'கையில்லா'],
  [/\bt[- ]?shirt\b/gi, 'டி-ஷர்ட்'],
  [/\bteddy bear\b/gi, 'டெடி பியர்'],
  [/\bsuction cup darts?\b/gi, 'சக்‌ஷன் கப் டார்ட்ஸ்'],
  [/\btoy gun set\b/gi, 'பொம்மை துப்பாக்கி செட்'],
  [/\bwater gun\b/gi, 'தண்ணீர் துப்பாக்கி'],
  [/\bplastic play balls?\b/gi, 'பிளாஸ்டிக் விளையாட்டு பந்துகள்'],
  [/\banimal figures?\b/gi, 'விலங்கு பொம்மைகள்'],
  [/\bfarm & wild\b/gi, 'பண்ணை & காட்டு'],
  [/\bmustard yellow\b/gi, 'மஸ்டர்ட் மஞ்சள்'],
  [/\bnavy blue\b/gi, 'நேவி நீலம்'],
  [/\blight blue\b/gi, 'லைட் நீலம்'],
  [/\bdark blue\b/gi, 'டார்க் நீலம்'],
  [/\bmulticolor\b/gi, 'பலநிறம்'],
  [/\bmulti-color\b/gi, 'பலநிறம்'],
  [/\bwith\b/gi, 'உடன்'],
  [/\band\b/gi, 'மற்றும்'],
  [/\bdress\b/gi, 'உடை'],
  [/\bleggings\b/gi, 'லெக்கிங்ஸ்'],
  [/\bpants?\b/gi, 'பேன்ட்'],
  [/\bshorts?\b/gi, 'ஷார்ட்ஸ்'],
  [/\bset\b/gi, 'செட்'],
  [/\bappliqu[eé]\b/gi, 'அப்ளிகே'],
  [/\bembroidered\b/gi, 'எம்பிராய்டரி'],
  [/\bstriped\b/gi, 'ஸ்ட்ரைப்'],
  [/\bribbed\b/gi, 'ரிப் வடிவ'],
  [/\bbelt\b/gi, 'பெல்ட்'],
  [/\brifle\b/gi, 'ரைஃபிள்'],
  [/\brevolver\b/gi, 'ரிவால்வர்'],
  [/\bgun\b/gi, 'துப்பாக்கி'],
  [/\bballoons?\b/gi, 'பலூன்'],
  [/\bballs?\b/gi, 'பந்து'],
  [/\bdolls?\b/gi, 'பொம்மை'],
  [/\bvehicles?\b/gi, 'வாகனங்கள்'],
  [/\bearrings?\b/gi, 'காதணிகள்'],
  [/\bbracelets?\b/gi, 'பிரேஸ்லெட்'],
  [/\bnecklaces?\b/gi, 'செயின்'],
  [/\bpink\b/gi, 'பிங்க்'],
  [/\bred\b/gi, 'சிவப்பு'],
  [/\byellow\b/gi, 'மஞ்சள்'],
  [/\bgreen\b/gi, 'பச்சை'],
  [/\bblue\b/gi, 'நீலம்'],
  [/\borange\b/gi, 'ஆரஞ்சு'],
  [/\bblack\b/gi, 'கருப்பு'],
  [/\bwhite\b/gi, 'வெள்ளை'],
  [/\bgrey\b/gi, 'சாம்பல்'],
  [/\bgray\b/gi, 'சாம்பல்'],
  [/\bbrown\b/gi, 'பழுப்பு'],
  [/\bkids?\b/gi, 'குழந்தைகள்'],
  [/\bbaby\b/gi, 'குழந்தை'],
  [/\bgirls?\b/gi, 'பெண் குழந்தைகள்'],
  [/\bboys?\b/gi, 'ஆண் குழந்தைகள்'],
];

const translateProductText = (value: string): string => {
  let translated = value;
  let changed = false;

  for (const [pattern, replacement] of PRODUCT_PHRASES) {
    const next = translated.replace(pattern, replacement);
    if (next !== translated) changed = true;
    translated = next;
  }

  if (!changed) return value;

  return translated
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;!?])/g, '$1')
    .trim();
};

const translateString = (value: string, allowProductTranslation = true): string => {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;

  const exact = TA[core];
  if (exact) return `${leading}${exact}${trailing}`;

  const freeGiftIncluded = core.match(/^(\d+)\s+FREE\s+gift(?:s)?\s+included$/i);
  if (freeGiftIncluded) {
    const count = Number(freeGiftIncluded[1]);
    return `${leading}${count} இலவச ${count === 1 ? 'பரிசு சேர்க்கப்பட்டுள்ளது' : 'பரிசுகள் சேர்க்கப்பட்டுள்ளன'}${trailing}`;
  }

  const leftMatch = core.match(/^(\d+)\s+left$/i);
  if (leftMatch) {
    return `${leading}${leftMatch[1]} மட்டும் உள்ளது${trailing}`;
  }

  const saveMoneyMatch = core.match(/^Save\s+(₹\s?[\d,.]+)$/i);
  if (saveMoneyMatch) {
    return `${leading}சேமிப்பு ${saveMoneyMatch[1]}${trailing}`;
  }

  const offMatch = core.match(/^(\d+(?:\.\d+)?)%\s*OFF$/i);
  if (offMatch) {
    return `${leading}${offMatch[1]}% தள்ளுபடி${trailing}`;
  }

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

  /*
   * Product-word replacement is used only for short/title-like product text.
   * Never run it through long descriptions, highlights, policies or other
   * paragraph content. Partial word replacement inside English sentences
   * produces unreadable mixed Tamil/English text.
   */
  if (allowProductTranslation) {
    const productTranslated = translateProductText(core);
    if (productTranslated !== core) {
      return `${leading}${productTranslated}${trailing}`;
    }
  }

  return value;
};

const allowDynamicProductTranslation = (
  element: Element | null,
  source: string,
): boolean => {
  if (!element) return false;

  if (
    element.closest(
      '.pd-accordion-copy, .pd-description-highlights, .product-description, .description, [data-product-description="true"]',
    )
  ) {
    return false;
  }

  const tag = element.tagName.toLowerCase();

  if (['h1', 'h2', 'h3', 'h4'].includes(tag)) return true;

  if (
    element.closest(
      '.product-title-link, .product-card, .spotc-search-suggestion, .pd-title, [data-product-title="true"]',
    )
  ) {
    return source.trim().length <= 180;
  }

  const wordCount = source.trim().split(/\s+/).filter(Boolean).length;
  if (source.length > 90 || wordCount > 10) return false;

  return true;
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
    const allowProductTranslation =
      allowDynamicProductTranslation(parent, source);
    const target =
      language === 'ta'
        ? translateString(source, allowProductTranslation)
        : source;
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
      const target =
        language === 'ta'
          ? translateString(source, false)
          : source;
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

  const t = useCallback(
    (value: string) =>
      language === 'ta' ? translateString(value, false) : value,
    [language],
  );

  const productTitle = useCallback(
    (value: string) =>
      language === 'ta' ? translateString(value, true) : value,
    [language],
  );

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
    () => ({ language, setLanguage, toggleLanguage, t, productTitle }),
    [language, setLanguage, toggleLanguage, t, productTitle],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useSpotcLanguage = () => useContext(LanguageContext);