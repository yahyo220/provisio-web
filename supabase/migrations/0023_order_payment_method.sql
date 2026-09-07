-- Provisio — record which payment method a customer picked at checkout
-- (card / cash / transfer). Previously nothing captured this at all, so an
-- order with payment='pending' had no way to tell "cash on delivery,
-- collect later" apart from "bank transfer, collect later" — needed now
-- that "Перечисление" is a real, trackable method rather than a purely
-- cosmetic checkout option.

alter table orders add column if not exists payment_method text not null default 'card';
