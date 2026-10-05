// Seed vocabulary. Colours, materials, lengths, styles and occasions come from the buyer-built
// "All Categories" sheet, extended with obvious gaps. Brand-specific additions belong in brand settings.

export const COLOURS = ["beige","black","blue","blush","brown","burgundy","cream","gold","green","grey","gray","khaki","lavender","mustard","navy","neon","neutral","nude","orange","pastel","pink","purple","rainbow","red","rosegold","sage","silver","tan","taupe","white","yellow","lilac","olive","teal","maroon","coral","ivory","charcoal","multi"];
export const MATERIALS = ["beaded","canvas","chiffon","cotton","cowhide","crochet","denim","fur","glitter","knit","lace","leather","linen","mesh","nylon","quilted","rattan","satin","sequin","silk","snakeskin","straw","suede","tulle","velvet","woven","corduroy","macrame","pearl","wool","jersey","polyester","viscose","ribbed","faux","organza","taffeta","tweed","fleece"];
export const LENGTHS = ["mini","midi","maxi","short","long","cropped","longline","knee","ankle","full"];
export const STYLES = ["backless","bodycon","boho","corset","casual","floral","flowy","formal","halter","leopard","oversized","pinafore","platform","skater","slip","sporty","strapless","strappy","studded","vintage","wrap","ruched","ruffle","pleated","tiered","smocked","puff","sleeve","sleeveless","bandeau","bardot","asymmetric","button","zip","tie","cutout","cut-out","off-shoulder","one-shoulder","v-neck","square-neck","high-neck","low-back","slit","split","a-line","shift","sheath","fit","flare","relaxed","wide","straight","slim","skinny","bootcut","mom","baggy","cargo","chunky","wedge","stiletto","block","kitten","knee-high","clutch","crossbody","tote","shoulder","bucket","mini"];
export const OCCASIONS = ["beach","birthday","bridesmaid","christmas","cocktail","evening","formal","graduation","party","prom","summer","wedding","winter","work","festival","races","holiday","date","everyday","night","guest","bridal","autumn","spring"];

/** Words that describe WHO it's for. Never allowed unless the buyer supplied them. */
export const AUDIENCE_TERMS = ["womens","women","womans","ladies","girls","girl","mens","men","boys","boy","kids","kid","baby","toddler","teen","teens","juniors","plus","petite","tall","curve","maternity","mother","mum","mom","bump"];

/** Informational / non-product intent: heavy penalty. */
export const INFORMATIONAL_PHRASES = ["how to","what is","ideas","near me","diy","pattern","tutorial","meaning","history","outfit ideas","what to wear","where to","review","reviews","vs","best way","dupe","dupes","for sale","wholesale"];
/** Price/promo modifiers: real search behaviour, poor product-title language. */
export const COMMERCIAL_NOISE = ["cheap","sale","under","discount","afterpay","zip pay","clearance","outlet","online","australia","au","nz","melbourne","sydney","free shipping","best","top","new","latest","trending","buy"];

export const STOP_WORDS = new Set(["a","an","and","the","for","with","of","in","on","to","by","at","from","or","&"]);

/**
 * Product-type noun -> dataset category. Used for category/brand fit and to pick the mandatory noun.
 * Keys are singular; matching is singular/plural-insensitive.
 */
export const PRODUCT_TYPE_CATEGORY: Record<string, string> = {
  dress: "Dresses", gown: "Dresses",
  top: "Tops", tee: "Tops", tshirt: "Tops", "t-shirt": "Tops", shirt: "Tops", blouse: "Tops", singlet: "Tops", tank: "Tops", bodysuit: "Tops", camisole: "Tops", cami: "Tops", corset: "Tops",
  shoe: "Shoes", boot: "Shoes", sneaker: "Shoes", sandal: "Shoes", heel: "Shoes", loafer: "Shoes", flat: "Shoes", slide: "Shoes", mule: "Shoes", pump: "Shoes",
  bag: "Bags", handbag: "Bags", backpack: "Bags", tote: "Bags", clutch: "Bags", purse: "Bags", wallet: "Bags", pouch: "Bags",
  jacket: "Coats & Jackets", coat: "Coats & Jackets", puffer: "Coats & Jackets", trench: "Coats & Jackets",
  pant: "Pants", pants: "Pants", trouser: "Pants", legging: "Pants", jogger: "Pants",
  jean: "Jeans & Denim",
  skirt: "Skirts", skort: "Skirts",
  short: "Shorts",
  jumper: "Knitwear", sweater: "Knitwear", cardigan: "Knitwear", knit: "Knitwear", hoodie: "Knitwear", sweatshirt: "Knitwear",
  blazer: "Suits & Blazers", suit: "Suits & Blazers", vest: "Suits & Blazers",
  jumpsuit: "Jumpsuits & Playsuits", playsuit: "Jumpsuits & Playsuits", romper: "Jumpsuits & Playsuits", overall: "Jumpsuits & Playsuits",
  bikini: "Swimwear", swimsuit: "Swimwear", "one-piece": "Swimwear",
  bra: "Lingerie & Sleepwear", pyjama: "Lingerie & Sleepwear", robe: "Lingerie & Sleepwear",
  necklace: "Jewellery", earring: "Jewellery", ring: "Jewellery", bracelet: "Jewellery",
  set: "Sets",
};

/** Cheap singulariser good enough for product nouns (dresses->dress, boots->boot, jeans->jean). */
export function singular(w: string): string {
  if (w.length <= 3) return w;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

export const categoryForType = (t: string | null) => (t ? PRODUCT_TYPE_CATEGORY[singular(t.toLowerCase())] ?? null : null);

/** Nouns that are naturally plural in product titles ("Wide Leg Pants", "White Sneakers"). Not penalised as plural. */
export const PLURAL_NATURAL = new Set(["pants","jeans","shorts","leggings","trousers","tights","overalls","shoes","boots","sneakers","sandals","heels","loafers","flats","slides","mules","pumps","earrings","sunglasses","jorts","bloomers","briefs","knickers"]);

/** Canonical attribute class order for title fit: colour, feature/style, material, length, then the product noun. */
export type AttrClass = "colour" | "feature" | "material" | "length";
export const CLASS_ORDER: AttrClass[] = ["colour", "feature", "material", "length"];
export function classify(tok: string): AttrClass | null {
  const t = singular(tok);
  if (COLOURS.map(singular).includes(t)) return "colour";
  if (LENGTHS.map(singular).includes(t)) return "length";
  if (MATERIALS.map(singular).includes(t)) return "material";
  if (STYLES.map(singular).includes(t) || OCCASIONS.map(singular).includes(t)) return "feature";
  return null;
}

/** Every word the vocabulary treats as a colour/material/length/style/occasion/audience attribute (singular). */
export const ATTRIBUTE_VOCAB_TOKENS = new Set([...COLOURS, ...MATERIALS, ...LENGTHS, ...STYLES, ...OCCASIONS, ...AUDIENCE_TERMS].map(singular));
