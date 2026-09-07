-- Provisio / Freshline — per-language product names.
--
-- `products.name` has always been a single free-text column, and every
-- imported product name is Russian (the ~185-item bulk import from the
-- Padishah invoice, migrated in earlier data-only inserts, plus whatever
-- predates it) — the app's language switcher (ru/uzCyrl/uzLatn/en, see
-- app/lib/i18n/app_lang.dart) never actually touched product names, only
-- static UI copy. This adds three optional override columns; `name` stays
-- the Russian source of truth and the row's fallback whenever a column is
-- null (a product added later without translations just shows Russian,
-- same "not translated yet" degradation the rest of the app's i18n uses).
--
-- Brand/proper names are intentionally NOT translated, only transliterated
-- into Latin letters for the Latin-script columns (uz_latn/en) per the
-- product owner's instruction — e.g. "Янгилик" (a sausage brand) becomes
-- "Yangilik", not some invented English word for it. International Latin
-- trademarks already stored in Latin script in `name` (Coca-Cola, Bonaqua,
-- Barilla, President, Nutella, Oreo, GUZMAN, Tanho, Aroy-D, ASS, TURON)
-- are kept as-is in every column, including uz_cyrl, matching how they
-- already sit un-transliterated inside the Russian `name` values.
alter table products
  add column if not exists name_uz_cyrl text,
  add column if not exists name_uz_latn text,
  add column if not exists name_en text;

comment on column products.name_uz_cyrl is 'Uzbek (Cyrillic) product name override; null falls back to name.';
comment on column products.name_uz_latn is 'Uzbek (Latin) product name override; null falls back to name.';
comment on column products.name_en is 'English product name override; null falls back to name.';

update products as p
set
  name_uz_cyrl = v.uz_cyrl,
  name_uz_latn = v.uz_latn,
  name_en = v.en
from (values
  -- Bakery / Confectionery
  ('BC-0001', 'Гриссини', 'Grissini', 'Grissini (breadsticks)'),

  -- Bread
  ('BR-0001', 'Тост нон', 'Tost non', 'Toast bread'),
  ('BR-0002', 'Қора нон', 'Qora non', 'Black bread'),
  ('BR-0003', 'Батон нон', 'Baton non', 'White loaf'),
  ('BR-0004', 'Багет', 'Baget', 'Baguette'),

  -- Beverages
  ('BV-0001', 'Шарбат', 'Sharbat', 'Juice'),
  ('BV-0002', 'Болалар шарбати', 'Bolalar sharbati', 'Kids'' juice'),
  ('BV-0003', 'Coca-Cola 0,25л', 'Coca-Cola 0,25l', 'Coca-Cola 0.25L'),
  ('BV-0004', 'Bonaqua', 'Bonaqua', 'Bonaqua'),
  ('BV-0005', 'Чортоқ', 'Chortoq', 'Chortoq (mineral water)'),
  ('BV-0006', 'Гилос безаги', 'Gilos bezagi', 'Cherry decor (cocktail cherries)'),
  ('BV-0007', 'Алоэ Вера 1,5л', 'Aloe Vera 1,5l', 'Aloe Vera 1.5L'),

  -- Canned Goods
  ('CG-0001', 'Пелати (консерваланган помидор)', 'Pelati (konservalangan pomidor)', 'Pelati (canned peeled tomatoes)'),

  -- Cleaning
  ('CL-0001', 'Идиш-товоқ гели 5л', 'Idish-tovoq geli 5l', 'Dish soap gel 5L'),
  ('CL-0002', 'ASS оқартиргич', 'ASS oqartirgich', 'ASS bleach'),
  ('CL-0003', 'Лимон кислотаси', 'Limon kislotasi', 'Citric acid'),

  -- Dairy
  ('D-0001', 'Моцарелла пишлоғи', 'Mozzarella pishlogʻi', 'Mozzarella cheese'),
  ('D-0002', 'Дор Блю пишлоғи', 'Dor Blyu pishlogʻi', 'Dor Blue cheese'),
  ('D-0003', 'Мармар пишлоғи', 'Marmar pishlogʻi', 'Marble cheese'),
  ('D-0004', 'Чеддер пишлоғи', 'Chedder pishlogʻi', 'Cheddar cheese'),
  ('D-0005', 'Пармезан пишлоғи', 'Parmezan pishlogʻi', 'Parmesan cheese'),
  ('D-0006', 'Сугуш сути', 'Sugush suti', 'Sugush milk'),
  ('D-0007', 'Сметана', 'Smetana', 'Sour cream'),
  ('D-0008', 'Сузма', 'Suzma', 'Suzma (strained yogurt)'),
  ('D-0009', 'Бринза пишлоғи', 'Brinza pishlogʻi', 'Brynza cheese'),
  ('D-0010', 'President 11% 500гр', 'President 11% 500gr', 'President 11% 500g'),
  ('D-0011', 'Қаймоқ', 'Qaymoq', 'Qaymoq (clotted cream)'),
  ('D-0012', 'Творог', 'Tvorog', 'Cottage cheese'),
  ('D-0013', 'Турк йогурти', 'Turk yogurti', 'Turkish yogurt'),
  ('D-0014', 'Нордон сут', 'Nordon sut', 'Sour milk'),
  ('D-0015', 'Фетакса пишлоғи', 'Fetaksa pishlogʻi', 'Feta-style cheese (Fetaksa)'),
  ('D-0016', 'Сливка', 'Slivka', 'Cream'),

  -- Eggs
  ('E-0001', 'Бедана тухуми', 'Bedana tuxumi', 'Quail eggs'),
  ('E-0002', 'Тухум', 'Tuxum', 'Eggs'),

  -- Fruits
  ('F-0001', 'Киви', 'Kivi', 'Kiwi'),
  ('F-0002', 'Анор', 'Anor', 'Pomegranate'),
  ('F-0003', 'Авокадо', 'Avokado', 'Avocado'),
  ('F-0004', 'Ананас', 'Ananas', 'Pineapple'),
  ('F-0005', 'Аждаҳо меваси', 'Ajdaho mevasi', 'Dragon fruit'),
  ('F-0006', 'Голубика', 'Golubika', 'Blueberry'),
  ('F-0007', 'Лайм', 'Laym', 'Lime'),
  ('F-0008', 'Грейпфрут', 'Greypfrut', 'Grapefruit'),
  ('F-0009', 'Олма', 'Olma', 'Apple'),
  ('F-0010', 'Қовун', 'Qovun', 'Melon'),
  ('F-0011', 'Семеренко олмаси', 'Semerenko olmasi', 'Semerenko apple'),
  ('F-0012', 'Банан', 'Banan', 'Banana'),
  ('F-0013', 'Малина', 'Malina', 'Raspberry'),
  ('F-0014', 'Қулупнай', 'Qulupnay', 'Strawberry'),
  ('F-0015', 'Мандарин', 'Mandarin', 'Tangerine'),
  ('F-0016', 'Апельсин', 'Apelsin', 'Orange'),
  ('F-0017', 'Тарвуз', 'Tarvuz', 'Watermelon'),
  ('F-0018', 'Нок', 'Nok', 'Pear'),
  ('F-0019', 'Анжир', 'Anjir', 'Fig'),
  ('F-0020', 'Лимон', 'Limon', 'Lemon'),

  -- Frozen
  ('FZ-0001', 'Музқаймоқ', 'Muzqaymoq', 'Ice cream'),
  ('FZ-0002', 'Музлатилган қулупнай', 'Muzlatilgan qulupnay', 'Frozen strawberry'),

  -- Grains & Pasta
  ('GP-0001', 'Barilla', 'Barilla', 'Barilla pasta'),
  ('GP-0002', 'Barilla макарони', 'Barilla makaroni', 'Barilla pasta'),
  ('GP-0003', 'Лапша', 'Lapsha', 'Noodles'),
  ('GP-0004', 'Макарон', 'Makaron', 'Pasta (macaroni)'),
  ('GP-0005', 'Аланга гуручи', 'Alanga guruchi', 'Alanga rice'),
  ('GP-0006', 'Лазер гуручи', 'Lazer guruchi', 'Lazer rice'),
  ('GP-0007', 'Манка', 'Manka', 'Semolina'),

  -- Groceries
  ('GR-0001', 'Кепакли ун', 'Kepakli un', 'Bran flour'),
  ('GR-0002', 'Темпура уни', 'Tempura uni', 'Tempura flour'),
  ('GR-0003', 'TURON уни', 'TURON uni', 'TURON flour'),
  ('GR-0004', 'Панко', 'Panko', 'Panko breadcrumbs'),

  -- Herbs
  ('HB-0001', 'Петрушка', 'Petrushka', 'Parsley'),
  ('HB-0002', 'Шивит', 'Shivit', 'Dill'),
  ('HB-0003', 'Кашнич', 'Kashnich', 'Cilantro (kashnich)'),
  ('HB-0004', 'Тимьян', 'Timʼyan', 'Thyme'),
  ('HB-0005', 'Узум барги', 'Uzum bargi', 'Grape leaves'),
  ('HB-0006', 'Қизил турп', 'Qizil turp', 'Radish'),
  ('HB-0007', 'Розмарин', 'Rozmarin', 'Rosemary'),
  ('HB-0008', 'Брокколи', 'Brokkoli', 'Broccoli'),
  ('HB-0009', 'Латук салат', 'Latuk salat', 'Lettuce'),
  ('HB-0010', 'Лолоросса салат', 'Lolorossa salat', 'Lollo Rossa lettuce'),
  ('HB-0011', 'Романо салат', 'Romano salat', 'Romaine lettuce'),
  ('HB-0012', 'Руккола', 'Rukkola', 'Arugula'),
  ('HB-0013', 'Селдерей', 'Selderey', 'Celery'),
  ('HB-0014', 'Айсберг салат', 'Iceberg salat', 'Iceberg lettuce'),
  ('HB-0015', 'Қизил микрозелень', 'Qizil mikrozelen', 'Red microgreens'),
  ('HB-0016', 'Яшил пиёз', 'Yashil piyoz', 'Green onion'),
  ('HB-0017', 'Ялпиз', 'Yalpiz', 'Mint'),
  ('HB-0018', 'Кинза', 'Kinza', 'Cilantro'),
  ('HB-0019', 'Тозаланган саримсоқ', 'Tozalangan sarimsoq', 'Peeled garlic'),
  ('HB-0020', 'Райҳон', 'Rayhon', 'Basil'),
  ('HB-0021', 'Исмалоқ', 'Ismaloq', 'Spinach'),
  ('HB-0022', 'Занжабил', 'Zanjabil', 'Ginger'),
  ('HB-0023', 'Шавель', 'Shavel', 'Sorrel'),
  ('HB-0024', 'Гармдори', 'Garmdori', 'Hot chili pepper (garmdori)'),
  ('HB-0025', 'Бассай салат', 'Bassay salat', 'Bassai (salad green)'),
  ('HB-0026', 'Лимонграс', 'Limongras', 'Lemongrass'),

  -- Honey & Preserves
  ('HP-0001', 'Тоғ асали', 'Togʻ asali', 'Mountain honey'),
  ('HP-0002', 'Асал', 'Asal', 'Honey'),

  -- Kitchen Equipment
  ('KE-0001', 'Миксер', 'Mikser', 'Mixer'),

  -- Kitchen Supplies / Disposables
  ('KS-0001', 'Шашлик таёқчаси', 'Shashlik tayoqchasi', 'Skewers'),
  ('KS-0002', 'Марля', 'Marla', 'Cheesecloth (gauze)'),
  ('KS-0003', 'Бир марталик стакан', 'Bir martalik stakan', 'Disposable cup'),
  ('KS-0004', 'Пойафзал ғилофи', 'Poyafzal gʻilofi', 'Shoe covers'),
  ('KS-0005', 'Газ горелкаси', 'Gaz gorelkasi', 'Gas burner'),
  ('KS-0006', 'Найча', 'Naycha', 'Drinking straw'),
  ('KS-0007', 'Юлдузча', 'Yulduzcha', 'Star (item)'),

  -- Legumes & Cereals
  ('LC-0001', 'Бурчоқ (рус)', 'Burchoq (rus)', 'Peas (Russian)'),
  ('LC-0002', 'Мош', 'Mosh', 'Mung beans'),
  ('LC-0003', 'Гречка', 'Grechka', 'Buckwheat'),
  ('LC-0004', 'Нўхат', 'Noʻxat', 'Chickpeas'),

  -- Meat
  ('M-0001', 'Қази', 'Qazi', 'Qazi (horse meat sausage)'),
  ('M-0002', 'Товуқ қази', 'Tovuq qazi', 'Chicken qazi sausage'),
  ('M-0003', 'Тил рулети', 'Til ruleti', 'Tongue roll'),
  ('M-0004', 'Колбаса', 'Kolbasa', 'Sausage'),
  ('M-0005', 'Янгилик', 'Yangilik', 'Yangilik'),
  ('M-0006', 'Сут сосискаси', 'Sut sosiskasi', 'Milk sausage (hot dog)'),
  ('M-0007', 'Егерский сосиска', 'Egerskiy sosiska', 'Hunter''s sausage'),

  -- Nuts
  ('N-0001', 'Қуритилган анжир', 'Quritilgan anjir', 'Dried fig'),
  ('N-0002', 'Қора майиз', 'Qora mayiz', 'Dried black raisins'),
  ('N-0003', 'Сариқ майиз', 'Sariq mayiz', 'Dried yellow raisins'),
  ('N-0004', 'Тозаланган писта', 'Tozalangan pista', 'Shelled pistachios'),
  ('N-0005', 'Бодом', 'Bodom', 'Almonds'),
  ('N-0006', 'Чиа уруғи', 'Chia urugʻi', 'Chia seeds'),
  ('N-0007', 'Ковок (писта нугаси)', 'Kovok (pista nugasi)', 'Kovok (pistachio nougat)'),
  ('N-0008', 'Кешю', 'Keshyu', 'Cashews'),
  ('N-0009', 'Шўр уруғ', 'Shoʻr urugʻ', 'Salted seeds'),
  ('N-0010', 'Қарағай ёнғоғи', 'Qaragʻay yongʻogʻi', 'Pine nuts'),
  ('N-0011', 'Тозаланган ёнғоқ', 'Tozalangan yongʻoq', 'Shelled walnuts'),

  -- Oil
  ('O-0001', 'Кунжут ёғи', 'Kunjut yogʻi', 'Sesame oil'),

  -- Sauces & Condiments
  ('SC-0001', 'Tanho кетчуп', 'Tanho ketchup', 'Tanho ketchup'),
  ('SC-0002', 'Туз', 'Tuz', 'Salt'),
  ('SC-0003', 'Tanho майонез', 'Tanho mayonez', 'Tanho mayonnaise'),
  ('SC-0004', 'Анчоус', 'Anchous', 'Anchovies'),
  ('SC-0005', 'Барбекю соуси', 'Barbekyu sousi', 'Barbecue sauce'),
  ('SC-0006', 'Вустершир соуси', 'Vustershir sousi', 'Worcestershire sauce'),
  ('SC-0007', 'Aroy-D соус 0.45', 'Aroy-D sous 0.45', 'Aroy-D sauce 0.45'),
  ('SC-0008', 'Aroy-D соус', 'Aroy-D sous', 'Aroy-D sauce'),
  ('SC-0009', 'Соя соуси', 'Soya sousi', 'Soy sauce'),
  ('SC-0010', 'Сирка', 'Sirka', 'Vinegar'),

  -- Seafood
  ('SE-0001', 'Тунец', 'Tunets', 'Tuna'),

  -- Semi-finished Products
  ('SF-0001', 'Мампар хамири', 'Mampar xamiri', 'Mampar dough'),
  ('SF-0002', 'Лағмон хамири', 'Lagʻmon xamiri', 'Lagman dough'),
  ('SF-0003', 'Чучвара', 'Chuchvara', 'Chuchvara (dumplings)'),
  ('SF-0004', 'Вак-мак (ярим тайёр)', 'Vak-mak (yarim tayyor)', 'Vak-mak (mini dumplings)'),
  ('SF-0005', 'Морковча (кореяча сабзи)', 'Morkovcha (koreyacha sabzi)', 'Korean-style carrot mix (morkovcha)'),

  -- Spices
  ('SP-0001', 'Қанд кукуни', 'Qand kukuni', 'Powdered sugar'),
  ('SP-0002', 'Шакар', 'Shakar', 'Sugar'),
  ('SP-0003', 'Қора зира', 'Qora zira', 'Black cumin'),
  ('SP-0004', 'Хамиртуруш', 'Xamirturush', 'Yeast'),
  ('SP-0005', 'Крахмал', 'Kraxmal', 'Starch'),
  ('SP-0006', 'Зира', 'Zira', 'Cumin'),
  ('SP-0007', 'Кунжут', 'Kunjut', 'Sesame seeds'),
  ('SP-0008', 'Ванилин (Guzman)', 'Vanilin (Guzman)', 'Vanillin (Guzman)'),
  ('SP-0009', 'GUZMAN пастаси', 'GUZMAN pastasi', 'GUZMAN paste'),
  ('SP-0010', 'Қалампир', 'Qalampir', 'Cloves'),
  ('SP-0011', 'Долчин', 'Dolchin', 'Cinnamon'),
  ('SP-0012', 'Бодиён', 'Bodyon', 'Star anise'),

  -- Sweets & Snacks
  ('SW-0001', 'Nutella 3кг', 'Nutella 3kg', 'Nutella 3kg'),
  ('SW-0002', 'Маршмелло', 'Marshmello', 'Marshmallows'),
  ('SW-0003', 'Oreo', 'Oreo', 'Oreo'),
  ('SW-0004', 'Лукум', 'Lukum', 'Turkish delight (lukum)'),

  -- Tea & Coffee
  ('TC-0001', 'Каркаде чойи', 'Karkade choyi', 'Hibiscus tea'),
  ('TC-0002', 'Чой', 'Choy', 'Tea'),

  -- Vegetables
  ('V-0001', 'Картошка', 'Kartoshka', 'Potatoes'),
  ('V-0002', 'Пиёз', 'Piyoz', 'Onions'),
  ('V-0003', 'Сариқ пиёз', 'Sariq piyoz', 'Yellow onions'),
  ('V-0004', 'Қизил пиёз', 'Qizil piyoz', 'Red onions'),
  ('V-0005', 'Қизил болгар қалампири', 'Qizil bolgar qalampiri', 'Red bell pepper'),
  ('V-0006', 'Яшил болгар қалампири', 'Yashil bolgar qalampiri', 'Green bell pepper'),
  ('V-0007', 'Пушти помидор', 'Pushti pomidor', 'Pink tomatoes'),
  ('V-0008', 'Помидор', 'Pomidor', 'Tomatoes'),
  ('V-0009', 'Черри помидор', 'Cherri pomidor', 'Cherry tomatoes'),
  ('V-0010', 'Бодринг', 'Bodring', 'Cucumbers'),
  ('V-0011', 'Уч рангли қалампир', 'Uch rangli qalampir', 'Tricolor peppers'),
  ('V-0012', 'Маринадланган бодринг', 'Marinadlangan bodring', 'Pickled cucumbers'),
  ('V-0013', 'Дунган салати (янги)', 'Dungan salati (yangi)', 'Fresh Dungan lettuce'),
  ('V-0014', 'Кесилган сабзи', 'Kesilgan sabzi', 'Shredded carrot'),
  ('V-0015', 'Қизил сабзи', 'Qizil sabzi', 'Red carrot'),
  ('V-0016', 'Сариқ сабзи', 'Sariq sabzi', 'Yellow carrot'),
  ('V-0017', 'Оқ карам', 'Oq karam', 'White cabbage'),
  ('V-0018', 'Қизил карам', 'Qizil karam', 'Red cabbage'),
  ('V-0019', 'Гулкарам', 'Gulkaram', 'Cauliflower'),
  ('V-0020', 'Лавлаги', 'Lavlagi', 'Beetroot'),
  ('V-0021', 'Бақлажон', 'Baqlajon', 'Eggplant'),
  ('V-0022', 'Қовоқча', 'Qovoqcha', 'Zucchini'),
  ('V-0023', 'Қора турп', 'Qora turp', 'Black radish'),
  ('V-0024', 'Дайкон', 'Daykon', 'Daikon radish'),
  ('V-0025', 'Шампиньон', 'Shampinyon', 'Button mushrooms')
) as v(sku, uz_cyrl, uz_latn, en)
where p.sku = v.sku;
