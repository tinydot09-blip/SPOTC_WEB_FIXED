import { NextResponse } from 'next/server';

import { getProducts } from '@/lib/data';
import type { BusinessProduct } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingMessage = { role?: unknown; content?: unknown };
type AiMessage = { role: 'user' | 'assistant'; content: string };

type ProductRecord = BusinessProduct & Record<string, unknown>;

type AiProduct = {
  id: string;
  title: string;
  price: number;
  image: string;
  category: string;
  ageGroup: string;
  color: string;
  stock: number | null;
  freeGiftCount: number;
  url: string;
};

const SITE = 'https://www.spotc.in';
const SUPPORT_PHONE = process.env.SPOTC_SUPPORT_PHONE?.trim() || '';
const SUPPORT_EMAIL = process.env.SPOTC_SUPPORT_EMAIL?.trim() || '';

const SPOTC_FACTS = `
VERIFIED SPOTC FACTS:
- Website: ${SITE}
- SPOTC is a local shopping website.
- Current launch categories include kids wear, toys, earrings, fancy items and keychains.
- Women's category is NOT available at present. It is coming soon.
- If a customer asks for saree, women's wear, ladies wear or another women's-category product that is not currently available, say naturally: "We don't have that category at the moment. Our Women's collection is coming soon! We'll let you know once it's available." Do not pretend the item exists.
- Ordering is available only inside the currently supported 5 km local delivery area. Customers outside it may browse.
- SPOTC promotes fast local delivery. Only say "15 minutes delivery" when that promise is shown/applicable on SPOTC; never invent a live ETA.
- Order status: Dashboard / My Orders.
- Shop: /shop
- Cart: /cart
- Checkout: /checkout
- Cash on Delivery should only be stated as available when shown on checkout/product details.
- Free gifts must come from the real product data/rule supplied by the server; never invent gift counts.
- Support phone: ${SUPPORT_PHONE || 'not configured in the assistant'}
- Support email: ${SUPPORT_EMAIL || 'not configured in the assistant'}
`;

const INSTRUCTIONS = `
You are SPOTC AI Assistant, the shopping and customer-support assistant for SPOTC.in.

YOUR PURPOSE:
Understand normal customer language, spelling mistakes, short messages, English, Tamil and Tanglish. Help with products, categories, price/budget, age/size/color, stock, gifts, offers, delivery, service area, cart, checkout, payment, orders, returns/exchange, login, saved products, contact/support and website navigation.

NON-NEGOTIABLE RULES:
1. Give a useful customer-facing answer, never internal/developer information.
2. Be VERY concise: normally 1-2 short sentences, preferably under 45 words.
3. Never repeat a sentence, paragraph or link.
4. Never invent a product, category availability, price, stock, gift count, discount, order status, phone number, policy or delivery promise.
5. For product shopping, ONLY recommend products in MATCHING PRODUCTS supplied below.
6. If matching products are supplied, say you found them. Do NOT print raw URLs in your prose because the UI displays clickable product cards.
7. If no matching product is supplied, do not claim it exists.
8. Women's category is coming soon. For saree/ladies/women's wear requests, politely say it is not available at present and Women's collection is coming soon. Do not ask the customer to search for it.
9. If the user asks about a current SPOTC category/product but no confident match is found, say you couldn't find a matching item right now and ask ONE useful follow-up only if it can help (age, budget, color, etc.).
10. For live order status, direct them to Dashboard / My Orders. Never make up a status.
11. For unrelated general-knowledge questions, politely say you are SPOTC's shopping assistant and state what you can help with.
12. Reply in the customer's language. For Tanglish, natural Tanglish is fine.
13. Do not ask for location unless the question is actually about delivery/serviceability.
14. If verified information is unavailable, say so briefly instead of guessing.

${SPOTC_FACTS}
`;

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const productTitle = (p: ProductRecord) => clean(p.title || p.product_name || 'SPOTC Product');
const productPrice = (p: ProductRecord) => {
  for (const v of [p.offer_price, p.selling_price, p.sale_price, p.price]) {
    const n = num(v);
    if (n > 0) return n;
  }
  return 0;
};

const productImage = (p: ProductRecord): string => {
  for (const v of [p.product_thumbnail, p.thumbnail_url, p.main_image, p.image_url, p.image]) {
    const s = clean(v);
    if (s) return s;
  }
  if (Array.isArray(p.images)) {
    for (const item of p.images) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const r = item as Record<string, unknown>;
        const s = clean(r.url || r.src || r.image_url || r.downloadURL);
        if (s) return s;
      }
    }
  }
  return '';
};

const giftCount = (price: number) => {
  if (price < 80) return 0;
  if (price < 200) return 1;
  return Math.floor(price / 100);
};

const searchText = (p: ProductRecord) =>
  [
    productTitle(p), p.brand, p.main_category, p.category, p.sub_category,
    p.child_category, p.age_group, p.age, p.size, p.sizes, p.color, p.colors,
    p.description, p.search_text, p.tags, p.search_tags, p.keywords,
  ].map((v) => Array.isArray(v) ? v.join(' ') : clean(v)).join(' ').toLowerCase();

const normalize = (s: string) => s.toLowerCase().replace(/[₹,]/g, ' ').replace(/[^a-z0-9\u0B80-\u0BFF\s-]/gi, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['i','me','my','want','need','show','find','give','please','for','a','an','the','with','product','products','looking','do','you','have','is','any','can','get','buy','wanting']);
const tokens = (q: string) => normalize(q).split(' ').filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));

const priceLimit = (q: string): number | null => {
  const s = q.toLowerCase().replace(/,/g, '');
  const m = s.match(/(?:below|under|less than|max|upto|up to|within)\s*₹?\s*(\d+)/i) || s.match(/₹\s*(\d+)\s*(?:below|under|max)/i);
  return m?.[1] ? Number(m[1]) : null;
};

const isWomenComingSoon = (q: string) => {
  const s = normalize(q);
  return /\b(saree|sari|women|womens|woman|ladies|lady|kurti|churidar|salwar|blouse)\b/i.test(s) || /சாரி|சேலை|பெண்கள்/.test(s);
};

const isProductIntent = (q: string) => {
  const s = normalize(q);
  return /\b(dress|frock|shirt|tshirt|t-shirt|pant|shorts|kids|kid|baby|boy|girl|toy|toys|earring|earrings|keychain|key chain|hairband|hair band|clip|clips|bangle|chain|fancy|gift|gun|car|doll|wear|size|colour|color|stock|price|under|below|show|find|need|want|buy)\b/i.test(s) || /பொம்மை|டிரஸ்|உடை|காது|விலை/.test(s);
};

const ageScore = (q: string, hay: string) => {
  const m = normalize(q).match(/\b(\d{1,2})\s*(?:year|years|yr|yrs|y)\b/i);
  if (!m) return 0;
  const age = Number(m[1]);
  if (hay.includes(`${age}`)) return 20;
  return 0;
};

const scoreProduct = (p: ProductRecord, q: string) => {
  const hay = searchText(p);
  const ts = tokens(q);
  let score = 0;
  for (const t of ts) if (hay.includes(t)) score += 10;

  const s = normalize(q);
  const aliases: Array<[RegExp, string[]]> = [
    [/\b(dress|frock)\b/i, ['dress','frock']],
    [/\b(toy|toys)\b/i, ['toy']],
    [/\b(earring|earrings)\b/i, ['earring']],
    [/\b(keychain|key chain)\b/i, ['keychain','key chain']],
    [/\b(hairband|hair band)\b/i, ['hairband','hair band','hair']],
    [/\b(girl|girls)\b/i, ['girl']],
    [/\b(boy|boys)\b/i, ['boy']],
  ];
  for (const [re, words] of aliases) {
    if (re.test(s) && words.some((w) => hay.includes(w))) score += 18;
  }
  score += ageScore(q, hay);

  const limit = priceLimit(q);
  const price = productPrice(p);
  if (limit != null) {
    if (price > 0 && price <= limit) score += 25;
    else if (price > limit) score -= 60;
  }
  return score;
};

async function matchingProducts(question: string): Promise<AiProduct[]> {
  if (!isProductIntent(question) || isWomenComingSoon(question)) return [];
  try {
    const all = await getProducts();
    return all
      .map((raw) => ({ p: raw as ProductRecord, score: scoreProduct(raw as ProductRecord, question) }))
      .filter((x) => x.score >= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ p }) => {
        const price = productPrice(p);
        const stockRaw = p.stock_qty ?? p.stock_quantity;
        return {
          id: String(p.id),
          title: productTitle(p),
          price,
          image: productImage(p),
          category: clean(p.main_category || p.category || p.sub_category),
          ageGroup: clean(p.age_group || p.age),
          color: clean(p.color),
          stock: stockRaw == null ? null : num(stockRaw),
          freeGiftCount: giftCount(price),
          url: `${SITE}/product/${encodeURIComponent(String(p.id))}`,
        };
      });
  } catch (e) {
    console.error('SPOTC product lookup failed:', e);
    return [];
  }
}

const extractText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join('\n').trim();
};

const dedupe = (answer: string) => {
  const seen = new Set<string>();
  return answer
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .trim();
};

async function callOpenAI(apiKey: string, model: string, messages: AiMessage[], products: AiProduct[], maxTokens: number) {
  const productContext = products.length
    ? `\nMATCHING PRODUCTS (these are real current SPOTC results; the UI will show cards):\n${products.map((p, i) => `${i + 1}. ID=${p.id}; ${p.title}; ₹${Math.round(p.price)}; category=${p.category || '-'}; age=${p.ageGroup || '-'}; color=${p.color || '-'}; stock=${p.stock ?? 'available'}; free gifts=${p.freeGiftCount}`).join('\n')}`
    : '\nMATCHING PRODUCTS: none supplied. Never invent one.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: INSTRUCTIONS + productContext,
      input: messages,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: maxTokens,
      store: false,
    }),
    cache: 'no-store',
  });
  const payload = await response.json();
  return { response, payload, answer: dedupe(extractText(payload)) };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: 'AI Assistant is temporarily unavailable. Please try again shortly.' }, { status: 503 });

    const body = (await request.json()) as { language?: unknown; messages?: IncomingMessage[] };
    const messages: AiMessage[] = Array.isArray(body.messages)
      ? body.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: clean(m.content) })).filter((m) => m.content).slice(-8)
      : [];
    if (!messages.length) return NextResponse.json({ error: 'Please ask a question.' }, { status: 400 });

    const question = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const products = await matchingProducts(question);
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini';

    let result = await callOpenAI(apiKey, model, messages, products, 350);
    if (!result.response.ok) {
      console.error('OpenAI Responses API failed:', result.payload);
      const msg = lower(result.payload?.error?.message);
      if (msg.includes('quota') || msg.includes('billing') || msg.includes('rate limit')) {
        return NextResponse.json({ error: 'AI Assistant is temporarily busy. Please try again shortly.' }, { status: 503 });
      }
      return NextResponse.json({ error: 'AI Assistant could not answer right now. Please try again.' }, { status: result.response.status });
    }

    if (!result.answer) result = await callOpenAI(apiKey, model, messages, products, 800);
    if (!result.response.ok || !result.answer) return NextResponse.json({ error: 'I could not complete that answer. Please ask again.' }, { status: 502 });

    return NextResponse.json({ answer: result.answer, products });
  } catch (error) {
    console.error('SPOTC AI route failed:', error);
    return NextResponse.json({ error: 'AI Assistant is temporarily unavailable. Please try again.' }, { status: 500 });
  }
}
