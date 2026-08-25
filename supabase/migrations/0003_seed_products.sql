-- Provisio — seed the real Mahalla Bazaar catalog into `products`.
--
-- Needed because of 0002_roles_auth.sql: shoppers can no longer create
-- product rows on the fly (only an admin can write to `products` now), so
-- the 9 real products have to already exist before anyone places an order.
-- Run this in the SQL editor as yourself (or via `supabase db push`) — it
-- runs as postgres, which bypasses RLS, so it works regardless of policies.
--
-- Safe to re-run: matches by sku and skips rows that already exist.

insert into products (sku, name, category, price, unit, stock, active, image_url)
select v.sku, v.name, v.category, v.price, v.unit, v.stock::stock_status, v.active, v.image_url
from (values
  ('tomato-vine', 'Помидоры, спелые', 'Овощи', 12000, '1 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/6945203b1610.jpg'),
  ('cucumber', 'Огурцы короткие', 'Овощи', 9500, '1 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/21e458317469.jpg'),
  ('onion', 'Лук репчатый', 'Овощи', 6000, '1 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/fa800430e889.jpg'),
  ('pepper', 'Перец болгарский, микс', 'Овощи', 14500, '500 г', 'out', false,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/e38d932ffcc8.jpg'),
  ('carrot', 'Морковь, пучок', 'Овощи', 8200, '1 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/9cd1cda5164a.jpg'),
  ('eggplant', 'Баклажаны', 'Овощи', 10800, '1 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/9b7f0830373b.jpg'),
  ('potato', 'Картофель', 'Овощи', 11000, '2 кг', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/fb23457386b7.jpg'),
  ('farm-milk', 'Домашнее молоко', 'Молоко', 15000, '1 л', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/e685118e47cf.jpg'),
  ('non-bread', 'Лепёшка «нон»', 'Хлеб', 6000, '1 шт', 'in', true,
    'https://rpreisbpsxrjwqsfeggf.supabase.co/storage/v1/object/public/direction-images/directions/25172cf3-2318-4568-a338-85a967947d5b/b6051fc85ead.jpg')
) as v(sku, name, category, price, unit, stock, active, image_url)
where not exists (select 1 from products p where p.sku = v.sku);
