-- Migracion inicial: Esquema completo para Servicios Opticos Profesionales
-- Ejecutar en Supabase SQL Editor (https://supabase.com/dashboard/project/vlaqhkqsajmqnjpuqdhz/sql/new)

-- 1. PROFILES (vinculado a auth.users de Supabase)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  name text not null default '',
  role text not null default 'Administrador' check (role in ('Administrador', 'Cliente')),
  email text,
  phone text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- 2. INVENTORY ITEMS
create table if not exists inventory_items (
  id text primary key,
  sku text not null,
  name text not null,
  category text not null default 'Monturas',
  supplier text not null default 'Proveedor por asignar',
  stock integer not null default 0,
  min_stock integer not null default 3,
  cost numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  tax_rate numeric(4,3) not null default 0.07,
  location text not null default 'Deposito',
  status text not null default 'Activo' check (status in ('Activo', 'Bajo stock', 'Servicio')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table inventory_items enable row level security;

-- 3. PURCHASE ORDERS
create table if not exists purchase_orders (
  id text primary key,
  supplier text not null,
  ruc text not null default '',
  dv text not null default '00',
  date date not null,
  due_date date not null,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Recibida', 'Pagada')),
  items integer not null default 0,
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  created_at timestamptz default now()
);
alter table purchase_orders enable row level security;

-- 4. SERVICE PAYMENTS
create table if not exists service_payments (
  id text primary key,
  service text not null,
  provider text not null,
  category text not null default 'Servicios publicos',
  due_date date not null,
  amount numeric(10,2) not null default 0,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Pagado', 'Vence pronto')),
  method text not null default 'Por definir',
  created_at timestamptz default now()
);
alter table service_payments enable row level security;

-- 5. CUSTOMERS
create table if not exists customers (
  id text primary key,
  name text not null,
  document text not null default 'Consumidor final',
  dv text not null default '00',
  email text not null default '',
  phone text not null default '',
  prescription text not null default '',
  last_visit date not null default current_date,
  balance numeric(10,2) not null default 0,
  created_at timestamptz default now()
);
alter table customers enable row level security;

-- 6. INVOICES
create table if not exists invoices (
  id text primary key,
  customer_id text not null references customers(id),
  customer text not null,
  document text not null,
  dv text not null default '00',
  date date not null,
  status text not null default 'Borrador' check (status in ('Borrador', 'Emitida', 'Pagada')),
  payment text not null default 'Efectivo',
  cufe text not null,
  cafe text not null,
  created_at timestamptz default now()
);
alter table invoices enable row level security;

-- 7. INVOICE LINES
create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references invoices(id) on delete cascade,
  item_id text not null,
  description text not null,
  qty integer not null default 1,
  unit_price numeric(10,2) not null default 0,
  tax_rate numeric(4,3) not null default 0.07
);
alter table invoice_lines enable row level security;

-- 8. APPOINTMENTS
create table if not exists appointments (
  id text primary key,
  customer_id text not null references customers(id),
  date date not null,
  reason text not null default '',
  status text not null default 'Solicitada' check (status in ('Solicitada', 'Confirmada', 'Completada')),
  created_at timestamptz default now()
);
alter table appointments enable row level security;

-- 9. USER ACCOUNTS (sistema interno)
create table if not exists user_accounts (
  id text primary key,
  name text not null,
  role text not null default 'Cliente' check (role in ('Administrador', 'Cliente')),
  email text not null default '',
  status text not null default 'Activo' check (status in ('Activo', 'Pendiente')),
  created_at timestamptz default now()
);
alter table user_accounts enable row level security;

-- 10. TECH ADVANCES (solo lectura, datos precargados)
create table if not exists tech_advances (
  id text primary key,
  title text not null,
  category text not null,
  description text not null,
  benefits text not null,
  badge text not null default 'Nuevo' check (badge in ('Nuevo', 'Popular', 'Premium')),
  price_range text not null default ''
);
alter table tech_advances enable row level security;

-- RLS: Permitir acceso autenticado a todos los registros
-- (se puede refinar por rol en produccion)
create policy if not exists "Acceso para usuarios autenticados" on profiles for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on inventory_items for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on purchase_orders for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on service_payments for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on customers for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on invoices for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on invoice_lines for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on appointments for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on user_accounts for all using (auth.role() = 'authenticated');
create policy if not exists "Acceso para usuarios autenticados" on tech_advances for all using (auth.role() = 'authenticated');
