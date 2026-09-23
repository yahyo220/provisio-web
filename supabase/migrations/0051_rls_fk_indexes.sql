-- Provisio / Freshline — indexes on the FK columns RLS policies walk on
-- every request (via `exists (select 1 from ... where x.customer_id =
-- current_customer_id())`-style checks). None of these had one — fine at
-- today's row counts, but each is an unindexed seq scan that gets slower
-- with every order/message/review this business accumulates. Purely
-- additive/low-risk: no schema or behavior change, just query plans.
create index if not exists orders_customer_id_idx on orders (customer_id);
create index if not exists order_items_order_id_idx on order_items (order_id);
create index if not exists deliveries_order_id_idx on deliveries (order_id);
create index if not exists deliveries_driver_id_idx on deliveries (driver_id);
create index if not exists support_messages_customer_id_idx on support_messages (customer_id);
create index if not exists support_messages_driver_id_idx on support_messages (driver_id);
create index if not exists order_feedback_order_id_idx on order_feedback (order_id);
create index if not exists order_feedback_customer_id_idx on order_feedback (customer_id);
create index if not exists product_reviews_customer_id_idx on product_reviews (customer_id);
