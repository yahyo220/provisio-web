-- Provisio — fixes 0026's per-language product names for rows whose
-- Russian `name` was edited (or added) on the website after 0026 ran:
--   F-0005  "Дракон" -> "Дракон красный" (a new white-flesh sibling, F-0021,
--           was added alongside it, so this one needs "red" too)
--   F-0021  new product, no translations yet
--   HB-0024 "Гаримдори" -> "Перец" (same hot-pepper-spice product, simpler name)
--   SC-0011 new product ("Ворчестор Соус" — replaces the deleted SC-0006)
--   SF-0003 "Чучвара" -> "Пельмени" (same dumpling product, different name)
--   V-0013  "Салат дунганский свежий" -> "Перец дунганский" — NOT a rename
--           of the same item, an actual meaning change (salad -> pepper,
--           confirmed against the matching product photo), so 0026's
--           "lettuce" translation was outright wrong, not just stale.
update products as p
set name_uz_cyrl = v.uz_cyrl, name_uz_latn = v.uz_latn, name_en = v.en
from (values
  ('F-0005',  'Қизил аждаҳо меваси', 'Qizil ajdaho mevasi', 'Red dragon fruit'),
  ('F-0021',  'Оқ аждаҳо меваси',    'Oq ajdaho mevasi',    'White dragon fruit'),
  ('HB-0024', 'Гармдори',            'Garmdori',            'Hot pepper (garmdori)'),
  ('SC-0011', 'Вустершир соуси',     'Vustershir sousi',    'Worcestershire sauce'),
  ('SF-0003', 'Пельмени',            'Pelmeni',             'Pelmeni (dumplings)'),
  ('V-0013',  'Дунган қалампири',    'Dungan qalampiri',    'Dungan pepper')
) as v(sku, uz_cyrl, uz_latn, en)
where p.sku = v.sku;
