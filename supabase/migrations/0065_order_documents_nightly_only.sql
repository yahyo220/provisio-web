-- Freshline / Provisio — order documents go out once a night, not per order.
--
-- At 03:00 Tashkent (the pg_cron job from 0064) the bot sends the накладная
-- of every order placed since 17:00 the evening before, then "Товары по
-- заказам" for them. The per-order trigger from 0064 isn't needed anymore.

drop trigger if exists orders_document_to_telegram on orders;
drop function if exists public.order_document_on_insert();
