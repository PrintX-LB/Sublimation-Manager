create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'staff');
create type public.order_status as enum ('draft', 'confirmed', 'in_production', 'ready', 'completed', 'cancelled');
create type public.file_kind as enum ('customer_artwork', 'print_ready');
create type public.stock_movement_type as enum ('adjustment', 'purchase', 'order_usage', 'return');
create type public.payment_method as enum ('cash', 'card', 'bank_transfer', 'other');
create type public.payment_status as enum ('pending', 'completed', 'refunded', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  email text,
  phone text,
  billing_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.print_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  width_mm numeric(10,2) not null check (width_mm > 0),
  height_mm numeric(10,2) not null check (height_mm > 0),
  file_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id) on delete set null,
  print_template_id uuid references public.print_templates(id) on delete set null,
  name text not null,
  description text,
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.order_status not null default 'draft',
  due_date date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_total_consistent check (total = subtotal - discount + tax and discount <= subtotal + tax)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete restrict,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_total_consistent check (line_total = unit_price * quantity)
);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  kind public.file_kind not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity integer not null check (quantity <> 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  status public.payment_status not null default 'completed',
  reference text,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_name_idx on public.customers (name);
create index customers_email_idx on public.customers (lower(email));
create index products_category_id_idx on public.products (category_id);
create index products_template_id_idx on public.products (print_template_id);
create index product_variants_product_id_idx on public.product_variants (product_id);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_status_due_date_idx on public.orders (status, due_date);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (product_variant_id);
create index order_files_order_id_idx on public.order_files (order_id);
create index order_files_item_id_idx on public.order_files (order_item_id);
create index stock_movements_variant_id_idx on public.stock_movements (product_variant_id);
create index stock_movements_order_item_id_idx on public.stock_movements (order_item_id);
create index payments_order_id_idx on public.payments (order_id);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','customers','product_categories','print_templates','products','product_variants','orders','order_items','order_files','payments']
  loop execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name); end loop;
end $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', '')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_company_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active);
$$;
revoke all on function public.is_company_user() from public;
grant execute on function public.is_company_user() to authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['customers','product_categories','print_templates','products','product_variants','orders','order_items','order_files','stock_movements','payments']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "Active company users can view %1$I" on public.%1$I for select to authenticated using ((select public.is_company_user()))', table_name);
    execute format('create policy "Active company users can insert %1$I" on public.%1$I for insert to authenticated with check ((select public.is_company_user()))', table_name);
    execute format('create policy "Active company users can update %1$I" on public.%1$I for update to authenticated using ((select public.is_company_user())) with check ((select public.is_company_user()))', table_name);
    execute format('create policy "Active company users can delete %1$I" on public.%1$I for delete to authenticated using ((select public.is_company_user()))', table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "Active company users can view profiles" on public.profiles
  for select to authenticated using ((select public.is_company_user()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 20971520, array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf'])
on conflict (id) do nothing;
create policy "Company users can read order files" on storage.objects for select to authenticated using (bucket_id = 'order-files' and (select public.is_company_user()));
create policy "Company users can upload order files" on storage.objects for insert to authenticated with check (bucket_id = 'order-files' and (select public.is_company_user()));
create policy "Company users can update order files" on storage.objects for update to authenticated using (bucket_id = 'order-files' and (select public.is_company_user())) with check (bucket_id = 'order-files' and (select public.is_company_user()));
create policy "Company users can delete order files" on storage.objects for delete to authenticated using (bucket_id = 'order-files' and (select public.is_company_user()));
