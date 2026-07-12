insert into public.product_categories (id, name, description) values
  ('10000000-0000-4000-8000-000000000001', 'Drinkware', 'Mugs, tumblers and bottles'),
  ('10000000-0000-4000-8000-000000000002', 'Apparel', 'Printable garments and textiles'),
  ('10000000-0000-4000-8000-000000000003', 'Home & Gifts', 'Personalised homeware and gifts')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.print_templates (id, name, width_mm, height_mm, notes) values
  ('20000000-0000-4000-8000-000000000001', '11 oz mug wrap', 210.00, 99.00, 'Standard full-wrap mug template'),
  ('20000000-0000-4000-8000-000000000002', 'A4 flat print', 210.00, 297.00, 'General A4 print area')
on conflict (id) do update set width_mm = excluded.width_mm, height_mm = excluded.height_mm, notes = excluded.notes;

insert into public.products (id, category_id, print_template_id, name, description, base_price) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Personalised ceramic mug', 'Gloss white 11 oz mug', 12.50),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Sublimation T-shirt', 'White polyester T-shirt', 18.00)
on conflict (id) do update set name = excluded.name, description = excluded.description, base_price = excluded.base_price;

insert into public.customers (id, name, email, phone, notes) values
  ('40000000-0000-4000-8000-000000000001', 'Sample Customer', 'sample@example.com', '+34 600 000 000', 'Demonstration record'),
  ('40000000-0000-4000-8000-000000000002', 'Costa Events', 'hello@costa-events.example', '+34 611 111 111', 'Regular event customer')
on conflict (id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone, notes = excluded.notes;
