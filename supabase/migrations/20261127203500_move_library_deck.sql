-- Serialize relative moves per course. All reads/writes run under the caller's RLS.
create or replace function public.move_library_deck(p_owner_id uuid, p_course_id uuid, p_deck_id uuid, p_direction text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_direction is null or p_direction not in ('up', 'down') then
    raise invalid_parameter_value using message = 'Invalid move direction';
  end if;
  perform id from public.courses
    where id = p_course_id and owner_id = p_owner_id and p_owner_id = (select auth.uid())
    for update;
  if not found then return; end if;

  with ordered as materialized (
    select d.id, d.position, row_number() over (order by d.position, d.created_at, d.id) as n,
      count(*) over (partition by d.position) as ties
    from public.decks d
    where d.owner_id = p_owner_id and d.course_id = p_course_id and d.archived_at is null
  ), pair as (
    select a.n as src, b.n as dst, a.position as old_pos, b.position as new_pos,
      a.ties > 1 or b.ties > 1 as tied
    from ordered a join ordered b on b.n = a.n + case p_direction when 'up' then -1 else 1 end
    where a.id = p_deck_id
  ), tie_start as (
    select min(o.n) as first_n, min(o.position) as base
    from ordered o cross join pair p
    where p.tied and o.position = least(p.old_pos, p.new_pos)
  ), tie_range as (
    -- Old/imported decks can share position 0. Spread only the affected run,
    -- stopping at the first existing gap with room for the swapped sequence.
    select s.*, coalesce((select min(o.n) from ordered o cross join pair p
                          where o.position > greatest(p.old_pos, p.new_pos)
                            and o.position >= s.base + o.n - s.first_n),
                         (select max(n) + 1 from ordered)) as end_n
    from tie_start s
  ), moves as (
    select o.id, case when not p.tied then
      case when o.n = p.src then p.new_pos else p.old_pos end
      -- On an integer-saturated tail, reclaim earlier gaps by using dense positions.
      when r.base + r.end_n - 1 - r.first_n > 2147483647 then
        case o.n when p.src then p.dst when p.dst then p.src else o.n end - 1
      else r.base + (case o.n when p.src then p.dst when p.dst then p.src else o.n end) - r.first_n
      end as position
    from ordered o cross join pair p cross join tie_range r
    where (not p.tied and o.n in (p.src,p.dst))
       or (p.tied and (o.n >= r.first_n and o.n < r.end_n
           or r.base + r.end_n - 1 - r.first_n > 2147483647))
  )
  update public.decks d set position = m.position::integer from moves m
   where d.id = m.id and d.owner_id = p_owner_id and d.course_id = p_course_id
     -- Eligibility belongs to the move snapshot. A concurrent archive can then
     -- take effect after the full swap without leaving only one updated position.
     and d.position <> m.position;
end;
$$;
revoke all on function public.move_library_deck(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.move_library_deck(uuid, uuid, uuid, text) to authenticated;
