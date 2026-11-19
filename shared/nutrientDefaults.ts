/**
 * Default fiber / sugar / salt per 100 g for food whose label or source did not give them.
 *
 * Pure and read-time only: nothing here is written to the database. A real value (label, Open Food Facts,
 * fill_nutrients, an edit) always wins, and the estimate disappears as soon as one is stored.
 *
 * How: the food's name (ru / uk / pl / en) picks a food type, the type gives typical values from USDA and
 * Polish reference tables. Sugar and often fiber are a share of the food's own carbs, so a type stays sane
 * across very different foods (twaróg 3.5 g carbs vs sweetened condensed milk 55 g). Unknown types fall
 * back on a mixed-meal profile. Numbers are rough by design: the goal is a stable day total instead of
 * one that jumps with whichever foods happened to have data, not lab precision.
 */

export type ExtraKey = 'fiber' | 'sugar' | 'salt'
export const EXTRA_KEYS: ExtraKey[] = ['fiber', 'sugar', 'salt']

export interface FoodBasics { name: string, kcal: number, c: number }

/** A value per 100 g: grams, or a share of the food's carbs ({ c: 0.6 } = 60 % of carbs). */
type V = number | { c: number, min?: number, max?: number }

interface FoodType { type: string, re: RegExp, fiber: V, sugar: V, salt: V }

// A stem matches at the start of a word (JS \b doesn't know Cyrillic, hence the lookbehind).
const w = (stems: string) => new RegExp(`(?<!\\p{L})(?:${stems})`, 'iu')

/** First match wins, so composite dishes and sauces come before their ingredients. */
export const FOOD_TYPES: FoodType[] = [
  // tea, coffee, water: nothing
  { type: 'drink0', re: w('вод[аы]|чай|чаю|кофе|эспрессо|американо|herbat|kaw[aey]|wod[ay]|water|tea|coffee|espresso'), fiber: 0, sugar: { c: 1 }, salt: 0 },
  // pure fats
  { type: 'oil', re: w('масло (?:оливк|подсолн|растит|кокос|рапс|льнян)|оливков\\p{L}* масло|растительн\\p{L}* масло|ол[іи]я|olej|oliw|oil'), fiber: 0, sugar: 0, salt: 0 },
  { type: 'butter', re: w('масло сливоч|сливочн\\p{L}* масло|масло(?!\\p{L})|masło|butter'), fiber: 0, sugar: { c: 1 }, salt: 0.1 },
  // composite dishes: before the sauces, cheese, meat and bread they contain
  { type: 'sushi', re: w('суши|ролл|роллы|sushi|maki|onigiri'), fiber: { c: 0.03 }, sugar: { c: 0.2 }, salt: 0.8 },
  { type: 'dish', re: w('пицц|бургер|smash|хот-?дог|шаурм|шаверм|кебаб|аранчини|гуляш|рагу|мешанк|суп|борщ|солянк|пельмен|варени|лазань|ризотто|плов|котлет|крокет|наггетс|шницел|запеканк|омлет с|pizz|burger|hot ?dog|kebab|gulasz|zup|pierog|kotlet|krokiet|lasagn|risott|nugget|schnitzel|stew|soup'), fiber: { c: 0.07, min: 0.5 }, sugar: { c: 0.12 }, salt: 1.2 },
  // sauces
  { type: 'soy-sauce', re: w('соев\\p{L}* соус|sos sojow|soy sauce'), fiber: 0, sugar: { c: 0.3 }, salt: 14 },
  { type: 'ketchup', re: w('кетчуп|ketchup'), fiber: 0.8, sugar: { c: 0.85 }, salt: 2 },
  { type: 'mayo', re: w('майонез|дижонез|айоли|majonez|mayo|aioli'), fiber: 0.2, sugar: { c: 0.5 }, salt: 1.5 },
  { type: 'guacamole', re: w('гуакамоле|guacamole|хумус|humm?us'), fiber: 5, sugar: { c: 0.2 }, salt: 0.7 },
  { type: 'sauce', re: w('соус|подлив|sos|sauce|pesto|песто'), fiber: 1, sugar: { c: 0.55 }, salt: 1.1 },
  // drinks with sugar
  { type: 'sweet-drink', re: w('сок|кола|лимонад|какао|горяч\\p{L}* шоколад|газировк|компот|морс|sok|napój|cola|juice|soda|lemonade|hot chocolate|cocoa'), fiber: { c: 0.03 }, sugar: { c: 0.9 }, salt: 0.05 },
  // protein powder before sweets ("Whey, шоколад")
  { type: 'protein-powder', re: w('протеин|whey|białko serwatk|odżywk|protein'), fiber: 1, sugar: { c: 0.5 }, salt: 0.5 },
  // sweets: before milk ("молочный шоколад") and nuts ("батончик с арахисом")
  { type: 'sweets', re: w('торт(?!ил)|тирамису|эклер|пирог|пирожн|печень[еяю]|шоколад|конфет|батончик|пралине|слойк|круассан|пончик|донат|вафл|мороже|десерт|кекс|маффин|чизкейк|зефир|мармелад|халв|ciast|czekolad|baton|cukierk|wafel|wafl|lody|pączek|drożdżówk|knoppers|cake|cookie|biscuit|donut|croissant|chocolate|candy|brownie|muffin|ice cream|dessert'), fiber: { c: 0.04, min: 1 }, sugar: { c: 0.6 }, salt: 0.3 },
  { type: 'sugar', re: w('мёд|мед|сахар|варень|джем|повидл|сироп|miód|cukier|dżem|syrop|honey|sugar|jam|syrup'), fiber: { c: 0.01 }, sugar: { c: 0.95 }, salt: 0 },
  { type: 'chips', re: w('чипс|сухарик|крекер|попкорн|paluszk|chips|chipsy|crisps|cracker|popcorn|pretzel|lay\'s'), fiber: 4, sugar: { c: 0.04 }, salt: 1.4 },
  // potato before dairy ("пюре с молоком и маслом")
  { type: 'potato', re: w('картоф|картош|пюре картоф|ньокки|фри(?!\\p{L})|ziemniak|frytk|kopytk|gnocchi|potato|fries'), fiber: { c: 0.09, min: 1 }, sugar: { c: 0.05 }, salt: 0.4 },
  // bread and grains: before nuts ("хлеб с орехами")
  { type: 'bread-whole', re: w('ч[её]рн\\p{L}* хлеб|хлеб ч[её]рн|ржан|цельнозерн|бородин|отрубн|żytni|pełnoziarn|razow|graham|whole ?grain|wholemeal|rye'), fiber: 6, sugar: { c: 0.08 }, salt: 1.2 },
  { type: 'bread', re: w('хлеб|хліб|багет|булк|бул[оа]чк|батон|тортиль|лаваш|пита(?!н)|чиабат|тост|брускетт|chleb|bułk|bagiet|tortill|bread|baguette|bun|toast|pita|wrap'), fiber: { c: 0.06, min: 2 }, sugar: { c: 0.08 }, salt: 1.2 },
  { type: 'grain-whole', re: w('бур\\p{L}* рис|рис бур|гречк|греч|овсян|овсянк|булгур|киноа|перлов|brązow|kasz[aey]|płatki owsian|owsian|brown rice|oat|buckwheat|quinoa'), fiber: { c: 0.1 }, sugar: { c: 0.02 }, salt: 0.05 },
  { type: 'grain', re: w('макарон|спагетти|паста|лапш|рис|кускус|makaron|spaghetti|ryż|pasta|noodle|rice|couscous'), fiber: { c: 0.06 }, sugar: { c: 0.02 }, salt: 0.2 },
  // eggs: after oil ("масло для яичницы")
  { type: 'egg', re: w('яйц|яичн|яйко|белок|желток|jaj|białk|egg'), fiber: 0, sugar: { c: 1 }, salt: 0.35 },
  { type: 'cheese', re: w('сыр(?!о|ник|ец|ые|ой)|сир(?!о|ник)|гауда|чеддер|камамбер|бри(?!\\p{L})|моцарелл|пармезан|фета|брынз|маскарпоне|рикотт|ser(?!ek|n)|gouda|cheddar|camembert|mozzarell|parmesan|feta|cheese|halloumi'), fiber: 0, sugar: { c: 1, max: 1 }, salt: 1.6 },
  // dairy: after cheese, whose stems skip "сырок" and "serek" ("сыр Favita (Mlekovita)" is cheese)
  { type: 'dairy', re: w('творог|творож|сырок|сирок|йогурт|кефир|ряженк|скир|простокваш|сметан|сливк|молок|молоч|сгущ|twaróg|twarog|serek|jogurt|kefir|skyr|maślank|śmietan|mleko|mleczn|cottage|yog(?:h)?urt|milk|cream'), fiber: 0, sugar: { c: 0.95 }, salt: 0.1 },
  // meat
  { type: 'cured-meat', re: w('ветчин|шинк|колбас|сосиск|сардельк|кабанос|салями|бекон|панчетт|бужен|карбонад|паштет|szynk|kiełbas|kielbas|parówk|kabanos|salami|boczek|pasztet|ham|sausage|bacon|pancetta|prosciutto|chorizo'), fiber: 0, sugar: { c: 0.8 }, salt: 2.2 },
  { type: 'meat-fish', re: w('кур(?!аг)|индейк|говяд|телят|свин|баран|рёбр|ребр|грудк|филе|фарш|стейк|мяс|печень(?![еяю])|рыб|лосос|сёмг|семг|форел|хек|минта|треск|тунец|скумбр|креветк|кальмар|мидии|kurczak|kurcz|indyk|wołow|wieprz|mięs|łosoś|dorsz|tuńczyk|krewetk|ryb|chicken|turkey|beef|pork|lamb|steak|salmon|tuna|cod|shrimp|prawn|fish|meat'), fiber: 0, sugar: { c: 0.5 }, salt: 0.4 },
  // nuts and seeds
  { type: 'nuts', re: w('орех|арахис|миндал|кешью|фисташ|фундук|семечк|семен[аи]|кунжут|чиа|orzech|orzesz|migdał|nerkow|pistacj|nasion|słonecznik|nut|almond|peanut|cashew|pistachio|seed'), fiber: 8, sugar: { c: 0.3 }, salt: 0.05 },
  // fruit and vegetables
  { type: 'avocado', re: w('авокадо|awokado|avocado'), fiber: 6.7, sugar: 0.7, salt: 0.02 },
  { type: 'pickled', re: w('солён|солен|маринов|квашен|консерв|kiszon|ogórki kiszon|marynow|pickle'), fiber: 1.2, sugar: { c: 0.5 }, salt: 2.5 },
  { type: 'fruit', re: w('банан|яблок|груш|апельсин|мандарин|клементин|грейпфрут|киви|манго|ананас|персик|абрикос|слив|вишн|черешн|ягод|клубник|малин|черник|голубик|виноград|арбуз|дыня|хурм|финик|изюм|курага|фрукт|banan|jabłk|gruszk|pomarańcz|mandaryn|truskaw|malin|borówk|winogron|arbuz|śliwk|wiśni|owoc|banana|apple|pear|orange|berr|grape|melon|mango|pineapple|peach|plum|cherry|fruit|date|raisin'), fiber: { c: 0.15 }, sugar: { c: 0.65 }, salt: 0 },
  { type: 'vegetable', re: w('шпинат|брокколи|огур|помидор|томат|морков|капуст|салат|айсберг|руккол|лук|чеснок|перец|кабач|баклажан|свекл|тыкв|цветн|спарж|фасоль стручк|горош|кукуруз|грибы|гриб|шампиньон|зелень|укроп|петрушк|сельдер|редис|овощ|szpinak|brokuł|ogórek|ogórk|pomidor|marchew|kapust|sałat|cebul|czosnek|papryk|cukini|bakłażan|burak|dyni|warzyw|pieczark|grzyb|kukurydz|spinach|broccoli|cucumber|tomato|carrot|cabbage|lettuce|salad|onion|garlic|pepper|zucchini|eggplant|beet|pumpkin|mushroom|corn|vegetable'), fiber: { c: 0.5, min: 1.2 }, sugar: { c: 0.4 }, salt: 0.05 },
  { type: 'legumes', re: w('фасол|чечевиц|нут|горох|соя|тофу|fasol|soczewic|ciecierzyc|groch|tofu|bean|lentil|chickpea'), fiber: { c: 0.35 }, sugar: { c: 0.1 }, salt: 0.1 },
]

/** No type: a mixed meal. */
const FALLBACK: Omit<FoodType, 're'> = { type: 'mixed', fiber: { c: 0.05 }, sugar: { c: 0.25 }, salt: 0.6 }

const round = (k: ExtraKey, n: number) => k === 'salt' ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10

function value(v: V, c: number) {
  if (typeof v === 'number') return v
  let n = c * v.c
  if (v.min != null) n = Math.max(v.min, n)
  if (v.max != null) n = Math.min(v.max, n)
  return n
}

export function foodType(name: string) {
  return FOOD_TYPES.find(t => t.re.test(name)) ?? FALLBACK
}

/** Typical fiber / sugar / salt per 100 g for a food, from its name and carbs. Always within the DB rules. */
export function estimateExtras(f: FoodBasics): Record<ExtraKey, number> & { type: string } {
  const c = Math.max(0, f.c || 0)
  // ~0 kcal: water, tea, coffee, diet drinks
  if (f.kcal < 5) return { type: 'drink0', fiber: 0, sugar: round('sugar', c), salt: 0 }
  const t = foodType(f.name)
  const out = { type: t.type } as Record<ExtraKey, number> & { type: string }
  for (const k of EXTRA_KEYS) out[k] = round(k, Math.min(100, Math.max(0, value(t[k], c))))
  // sugars are part of carbs
  out.sugar = Math.min(out.sugar, round('sugar', c))
  return out
}

/**
 * Fill the unknown extras of a per-100 g row with estimates. Known values are kept as they are.
 * Returns the filled values and which of them are estimates.
 */
export function fillExtras100(f: FoodBasics & { fiber?: number | null, sugar?: number | null, salt?: number | null }) {
  const missing = EXTRA_KEYS.filter(k => f[k] == null)
  if (!missing.length) return { values: { fiber: f.fiber!, sugar: f.sugar!, salt: f.salt! }, estimated: [] as ExtraKey[] }
  const est = estimateExtras(f)
  return {
    values: { fiber: f.fiber ?? est.fiber, sugar: f.sugar ?? est.sugar, salt: f.salt ?? est.salt },
    estimated: missing,
  }
}
