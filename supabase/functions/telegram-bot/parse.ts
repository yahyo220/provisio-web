// Freshline — turns a plain-text order from a Telegram group into catalog
// lines. Clients write the way they talk: Russian, Uzbek (Cyrillic or
// Latin), typos, abbreviations — "Кр калифорния 5кг", "Qizil pamidor 3kg",
// "Огурцы свежые (орзу)3 кг". Everything is transliterated to one Latin
// form, common words are mapped to the catalog's vocabulary, and each line
// is matched against every name a product has (Russian, Uzbek, English).
// No external services. Kept free of Deno APIs so it can be tested with Node.

export interface CatalogProduct {
  id: string
  name: string
  name_uz_cyrl?: string | null
  name_uz_latn?: string | null
  name_en?: string | null
  unit: string
  sku?: string | null
}

export interface ParsedLine {
  text: string
  product: CatalogProduct | null
  qty: number | null
  /** Russian unit label stored on the order line ("кг", "шт.", "пучок"…). */
  unit: string
  score: number
}

const UNIT_RU: Record<string, string> = {
  kg: 'кг',
  piece: 'шт.',
  box: 'коробка',
  bottle: 'бутылка',
  package: 'упаковка',
  bunch: 'пучок',
  bag: 'мешок',
  pack: 'уп.',
  gram: 'грамм',
}

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h', ı: 'i', ş: 'sh', ç: 'ch', ğ: 'g', ö: 'o', ü: 'u',
}

/** Lower-case Latin skeleton: transliterated, no apostrophes or punctuation. */
export function latin(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ’‘`'´]/g, '')
    .split('')
    .map((ch) => CYR[ch] ?? ch)
    .join('')
    .replace(/kh/g, 'x')
    // Uzbek Latin "j" is the Russian "ж" ("lojka", "morojni").
    .replace(/j/g, 'zh')
    .replace(/[^a-z0-9.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words clients use → the catalog's words (all already in latin()). */
const ALIASES: Record<string, string> = {
  kr: 'krasnyy', kras: 'krasnyy', krasn: 'krasnyy', qizil: 'krasnyy', kizil: 'krasnyy', qozil: 'krasnyy', qip: '',
  zh: 'zheltyy', zhel: 'zheltyy', jel: 'zheltyy', sariq: 'zheltyy', sarik: 'zheltyy', sari: 'zheltyy',
  z: 'zelenyy', zel: 'zelenyy', yashil: 'zelenyy', kok: 'zelenyy',
  rozviy: 'rozovyy', rozvi: 'rozovyy', rozovye: 'rozovyy', rozoviy: 'rozovyy', pushti: 'rozovyy', r: 'rozovyy',
  // "Кр/Зел/Жел калифорния" — the blocky California peppers sold as Триколор.
  kaliforniya: 'trikolor', balgariski: 'bolgarskiy', bolgarski: 'bolgarskiy', balgarskiy: 'bolgarskiy',
  balgarski: 'bolgarskiy', bolgsrskiy: 'bolgarskiy', bolgor: 'bolgarskiy', bolgar: 'bolgarskiy', qalampir: 'perec', qalampiri: 'perec',
  pamidor: 'pomidor', pamdor: 'pomidor', pomidori: 'pomidor', pomidory: 'pomidor', pomtdor: 'pomidor', prmidor: 'pomidor', plmidor: 'pomidor', pomidory_: 'pomidor', pomidorlar: 'pomidor', pomidoe: 'pomidor',
  kartofel: 'kartoshka', kartoshqa: 'kartoshka', kartrfel: 'kartoshka', ksrtofel: 'kartoshka', kartoshkasi: 'kartoshka', kartofelь: 'kartoshka',
  baqlazhon: 'baklazhan', baklazhon: 'baklazhan', baqlajon: 'baklazhan', bakladzhan: 'baklazhan', baklajan: 'baklazhan', baklazhany: 'baklazhan', baklvdzhan: 'baklazhan', bakladzhan3: 'baklazhan', baklozhan: 'baklazhan', baklajon: 'baklazhan',
  bodring: 'ogurec', bodrig: 'ogurec', ogurcy: 'ogurec', ogurtsy: 'ogurec', ogurcya: 'ogurec', '0gurcy': 'ogurec',
  piyoz: 'luk', piyaz: 'luk', piez: 'luk', repchptyy: 'repchatyy', repchaiyy: 'repchatyy',
  sabzi: 'morkov', markov: 'morkov', marakov: 'morkov', mvrkov: 'morkov', markovt: 'morkov', tugralgan: 'rezanaya', tugralgani: 'rezanaya', rezanyy: 'rezanaya', rezannaya: 'rezanaya',
  karam: 'kapusta', karom: 'kapusta', oq: 'belokochannaya', belokapchannaya: 'belokochannaya', belakapchannaya: 'belokochannaya', belokachannaya: 'belokochannaya', belokapchannvya: 'belokochannaya',
  lolaross: 'lolorossa', lolarosso: 'lolorossa', lolorosso: 'lolorossa', lolaros: 'lolorossa', lolarossa: 'lolorossa', looaross: 'lolorossa', lolarosa: 'lolorossa',
  rukkola: 'rukkolo', rokula: 'rukkolo', rukola: 'rukkolo', rukkoka: 'rukkolo', ruccola: 'rukkolo',
  latok: 'latuk', aysbarg: 'aysberg', ayzberk: 'aysberg', aysberk: 'aysberg',
  tuxum: 'yayco', yaytsa: 'yayco', yayca: 'yayco', yayco: 'yayco', bedana: 'perepelinye',
  un: 'muka', turan: 'turon', guruch: 'ris', gruch: 'ris', lazir: 'lazer',
  suzma: 'syuzma', suzme: 'syuzma', syuzma: 'syuzma', sbzma: 'syuzma', qatiq: 'kisloe moloko', katyk: 'kisloe moloko', qatıq: 'kisloe moloko',
  sut: 'moloko', sariyog: 'maslo slivochnoe', saryog: 'maslo slivochnoe', yog: 'maslo',
  anor: 'granat', nok: 'grusha', noq: 'grusha', olma: 'yabloko', yabloka: 'yabloko', qulupnay: 'klubnika', klubnika: 'klubnika', kulubnika: 'klubnika',
  tarvuz: 'arbuz', qovun: 'dynya', avakado: 'avokado', avakoda: 'avokado', avokado: 'avokado', aplesin: 'apelsin', aplesin_: 'apelsin',
  chisnoq: 'chesnok', chisgok: 'chesnok', tazelengen: 'chishchennyy', tozalangan: 'chishchennyy', orchilgen: 'chishchennyy', chishshennyy: 'chishchennyy', chishshenyy: 'chishchennyy', chishennyy: 'chishchennyy', chishchenyy: 'chishchennyy',
  miyata: 'myata', miata: 'myata', yalpiz: 'myata', rayhon: 'bazilik', raykhon: 'bazilik', rayhan: 'bazilik', bazilik: 'bazilik',
  dunganskiy: 'dunganskiy', dunganski: 'dunganskiy', dunganskiyi4: 'dunganskiy',
  trikalor: 'trikolor', triflor: 'trikolor', trikokor: 'trikolor', trikolor: 'trikolor', triaolor: 'trikolor', trieolor: 'trikolor', tpikolor: 'trikolor', trikolop: 'trikolor', trikoloor: 'trikolor', trikolorm: 'trikolor', trikolorzelenyy: 'trikolor zelenyy',
  cheri: 'cherri', cherry: 'cherri',
  buxonka: 'buxanka', buhanka: 'buxanka', buxanqa: 'buxanka', buxonqa: 'buxanka', buhanqa: 'buxanka',
  tostir: 'toster', tostirnyy: 'toster', grechka: 'grechka', chechivitsa: 'chechevica', chechivitse: 'chechevica', chichivitse: 'chechevica',
  mosh: 'mash', noxat: 'nut', nohut: 'nut', noxot: 'nut', nuxat: 'nut', nohat: 'nut',
  tuz: 'sol', shakar: 'saxar', kunjut: 'kunzhut', zira: 'kumin', kimyon: 'kumin', kalbasa: 'kolbasa', imbir: 'imbir', ananas: 'ananas',
  kivi: 'kivi', limon: 'limon', banan: 'banan', mandarin: 'mandarin', apelsin: 'apelsin', laym: 'laym', laem: 'laym',
}

/** Words that describe the order, not the product. */
const STOP = new Set([
  'svezhie', 'svezhye', 'svezhiy', 'svejiy', 'svezhyy', 'svezhyh', 'otbor', 'otbornyy', 'otborniy', 'otborny', 'mestnyy', 'mestniy', 'mest', 'krupnyy',
  'bolshoy', 'bolshie', 'samyy', 'yaxshisi', 'yaxshi', 'yaxsisidan', 'yaxsisi', 'kattasi', 'katta', 'kattaroq', 'iltimos', 'orzu', 'zuridan', 'eron', 'barga',
  'non', 'personal', 'saralangan', 'va', 'dan', 'i', 's', 'dlya', 'iz', 'kottasidan', 'kottasi', 'zhrtalab', 'kelsin', 'odiysi', 'figurasi', 'paket', 'paketda',
  'svezhyye', 'svejie', 'ilk', 'shtuk', 'shtuki', 'shtuka', 'chupsiz', 'butuni', 'mayda', 'maydasi',
])

/** Extra names clients use for a product, keyed by its catalog name. */
const EXTRA_NAMES: Record<string, string[]> = {
  Помидор: ['помидор красный'],
  'Мука TURON': ['мука', 'мука высший сорт'],
  Сюзьма: ['сюзьма доброе'],
  Мороженое: ['мороженое пломбир'],
  'Молоко сугуш': ['молоко'],
}

const UNIT_WORDS = new Set(['ml', 'sm', 'litrlik', 'grlik', 'kgdan', 'grdan', 'tadan', 'gramm', 'kilogramm'])

function stem(t: string): string {
  if (t.length <= 4) return t
  for (const end of ['ykh', 'ogo', 'aya', 'oye', 'yye', 'iye', 'yy', 'iy', 'oy', 'ye', 'ie', 'ov', 'ey', 'ya', 'yu', 'y', 'i', 'a', 'e', 'u']) {
    if (t.endsWith(end) && t.length - end.length >= 3) return t.slice(0, -end.length)
  }
  return t
}

function tokens(s: string, aliased: boolean): string[] {
  let words = latin(s)
    .replace(/[0-9.,]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  // "lola roza", "lola rossa" → one word.
  words = words.flatMap((w, i) => (w === 'lola' && /^ro[sz]/.test(words[i + 1] ?? '') ? ['lolorossa'] : /^ro[sz]/.test(w) && words[i - 1] === 'lola' ? [] : [w]))
  if (aliased) words = words.flatMap((w) => (w in ALIASES ? ALIASES[w].split(' ') : [w])).filter((w) => w && !STOP.has(w))
  // Units and single letters left over ("1 л" in "Графин 1 л", "500 gr") aren't part of the name.
  return words.filter((w) => w.length > 1 && !UNIT_WORDS.has(w) && !unitOf(w)).map(stem)
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

function tokSim(a: string, b: string): number {
  if (a === b) return 1
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.9
  const r = 1 - lev(a, b) / Math.max(a.length, b.length)
  return r >= 0.7 ? r : 0
}

/** F1 of how much of the product name is in the line and how much of the line is the name. */
function nameScore(line: string[], name: string[]): number {
  if (!line.length || !name.length) return 0
  const cover = name.reduce((s, n) => s + Math.max(...line.map((l) => tokSim(l, n))), 0) / name.length
  const precise = line.reduce((s, l) => s + Math.max(...name.map((n) => tokSim(l, n))), 0) / line.length
  return cover + precise === 0 ? 0 : (2 * cover * precise) / (cover + precise)
}

interface Prepared {
  product: CatalogProduct
  names: string[][]
}

export function prepareCatalog(products: CatalogProduct[]): Prepared[] {
  return products.map((p) => ({
    product: p,
    names: [p.name, p.name_uz_cyrl, p.name_uz_latn, p.name_en, ...(EXTRA_NAMES[p.name.trim()] ?? [])].filter((n): n is string => !!n && !!n.trim()).map((n) => tokens(n, false)),
  }))
}

const UNIT_PATTERNS: [RegExp, string][] = [
  [/^(kg|kilo|kilogramm?|kgdan|kq|ug|kh)$/, 'kg'],
  [/^(gr|g|gramm?|grdan|grlik)$/, 'g'],
  [/^(sht|shtuk|shtuka|shtuki|ta|dona|dane|don|donasi|sh|shch|sht\.)$/, 'шт.'],
  [/^(puch|puchok|puchka|puchkov|puchok\.|bog|bogi|boglam)$/, 'пучок'],
  [/^(l|lt|litr|litra|litrov|litrlik)$/, 'л'],
  [/^(blok|bloka|blokov)$/, 'блок'],
  [/^(korobka|korobki|karobka|karobki|qadoq|kn)$/, 'коробка'],
  [/^(pachka|pachki|pachek|pochka|pochki|p|pach)$/, 'пачка'],
  [/^(up|upak|upakovka|upakovki)$/, 'упаковка'],
  [/^(banka|bonka|banki)$/, 'банка'],
  [/^(kletka)$/, 'клетка'],
  [/^(palka)$/, 'шт.'],
]

function unitOf(word: string): string | null {
  for (const [re, u] of UNIT_PATTERNS) if (re.test(word)) return u
  return null
}

/** How sure a unit makes us that the number is the quantity: "5 dona" in
 * "Grafin 5 dona 1 litrlik", "4 Dane" in "Sariyog' 500 gr - 4 Dane". */
const UNIT_RANK: Record<string, number> = { kg: 3, л: 2, g: 1 }
const rank = (u: string | null) => (u == null ? 0 : UNIT_RANK[u] ?? 4)

/** Finds the quantity in a line: the number with the most telling unit after it (the last one on a tie). */
function quantity(line: string): { qty: number; unit: string | null; rest: string } | null {
  const l = latin(line).replace(/(\d)\s+[.,]\s*(\d)/g, '$1.$2')
  const re = /(\d+(?:[.,]\d+)?)\s*([a-z.]+)?/g
  let best: { qty: number; unit: string | null; index: number; length: number } | null = null
  for (let m = re.exec(l); m; m = re.exec(l)) {
    const unit = m[2] ? unitOf(m[2].replace(/\.$/, '')) : null
    const qty = Number(m[1].replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) continue
    // "11%", "20 sm", "0.5" in a product name ("Bonaqua 0.5") lose to a number with a unit.
    if (!best || rank(unit) >= rank(best.unit)) best = { qty, unit, index: m.index, length: m[0].length }
  }
  if (!best) return null
  return { qty: best.qty, unit: best.unit, rest: l.slice(0, best.index) + ' ' + l.slice(best.index + best.length) }
}

export function parseOrderText(text: string, catalog: Prepared[]): ParsedLine[] {
  const out: ParsedLine[] = []
  for (const raw of text.split(/\r?\n|;/)) {
    // Numbered lists ("1. Лола роса — 2 кг") and chat export prefixes.
    const line = raw.replace(/^\s*\d+[.)]\s+/, '').trim()
    if (!/[\p{L}]/u.test(line)) continue
    const q = quantity(line)
    const words = tokens(q ? q.rest : line, true)
    if (!words.length) continue
    let best: Prepared | null = null
    let bestScore = 0
    for (const c of catalog) {
      const s = Math.max(...c.names.map((n) => nameScore(words, n)))
      // Ties go to the product listed first (the older, plain one: "Помидор черри красный" before "…жёлтый").
      if (s > bestScore + 1e-9) {
        best = c
        bestScore = s
      }
    }
    const product = best && bestScore >= 0.6 ? best.product : null
    let qty = q?.qty ?? null
    let unit = product ? UNIT_RU[product.unit] ?? product.unit : ''
    if (q?.unit === 'g') {
      if (product?.unit === 'kg' && qty != null) qty = Math.round((qty / 1000) * 1000) / 1000
      else unit = 'гр'
    } else if (q?.unit) {
      unit = q.unit === 'kg' ? 'кг' : q.unit
    }
    out.push({ text: line, product, qty, unit, score: Math.round(bestScore * 100) / 100 })
  }
  return out
}
