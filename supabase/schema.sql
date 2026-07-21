-- Profiles (auto-created on user signup via trigger)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Boards
create table if not exists public.boards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  is_public boolean default false,
  share_slug text unique,
  created_at timestamptz default now()
);
alter table public.boards enable row level security;
create policy "Users can manage own boards" on public.boards for all using (auth.uid() = user_id);
create policy "Anyone can read public boards" on public.boards for select using (is_public = true);

-- Board Locations
create table if not exists public.board_locations (
  id uuid default gen_random_uuid() primary key,
  board_id uuid references public.boards(id) on delete cascade not null,
  place_id text not null,
  place_name text not null,
  place_address text,
  place_photo_url text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz default now()
);
alter table public.board_locations enable row level security;
create policy "Users can manage locations in own boards" on public.board_locations
  for all using (
    exists (select 1 from public.boards where id = board_id and user_id = auth.uid())
  );
create policy "Anyone can read locations in public boards" on public.board_locations
  for select using (
    exists (select 1 from public.boards where id = board_id and is_public = true)
  );
