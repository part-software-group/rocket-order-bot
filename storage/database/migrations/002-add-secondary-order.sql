--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

drop index lunch_list_order_date_uindex;
drop index lunch_order_date_uindex;

alter table lunch_list rename to daily;
alter table lunch_order rename to person_order;

alter table person add column platform varchar(50);
alter table daily add column is_primary char;
alter table daily add column max_count integer;
alter table daily add column priority integer;
alter table daily add column is_open char;
alter table person_order add column menu_list text;

update daily set is_primary = '1';
update daily set max_count = 1;
update daily set priority = 1;
update daily set is_open = '0';
update person set platform = 'rocket-chat';

create table if not exists menu (
  id          integer primary key autoincrement,
  name    varchar(225),
  insert_date       integer,
  delete_date integer             default 0
);

create table if not exists daily_menu (
  daily_id integer,
  menu_id integer,
  insert_date       integer,
  delete_date integer             default 0
);

create table if not exists person_order_menu (
  id          integer primary key autoincrement,
  person_order_menu varchar(225),
  menu_id integer,
  insert_date       integer,
  delete_date integer             default 0
);

create unique index if not exists menu_name_uindex
  on menu (name, delete_date);

create unique index if not exists daily_date_uindex on daily (order_date, is_primary, delete_date);

with recursive split(name, rest) as (
  select
    '',
    list || '|'
  from daily
  union all
  select
    substr(rest, 0, instr(rest, '|')),
    substr(rest, instr(rest, '|') + 1)
  from split
  where rest <> ''
)
insert into menu (name, insert_date)
select distinct name, 20190106000000000
from split
where name <> '';

with recursive split(id, name, rest) as (
  select
    id,
    '',
    list || '|'
  from daily
  union all
  select
    id,
    substr(rest, 0, instr(rest, '|')),
    substr(rest, instr(rest, '|') + 1)
  from split
  where rest <> ''
), data as (
    select s.id daily_id, m.id menu_id
    from split s, menu m
    where s.name <> '' and s.name = m.name order by s.id)
insert into daily_menu (daily_id, menu_id, insert_date)
select daily_id, menu_id, 20190106000000000 from data;

insert into person_order_menu (person_order_id, menu_id, insert_date, delete_date)
  select
    uo.id,
    m.id,
    uo.insert_date,
    uo.delete_date
  from person_order uo, menu m
  where uo.lunch = m.name;

drop index person_username_uindex;
create table person137c
(
    id integer primary key autoincrement,
    username varchar(225),
    name varchar(225),
    platform varchar(50),
    insert_date integer,
    delete_date integer default 0,
);
create unique index person_username_uindex ON person137c (username, delete_date);
insert into person137c(id, username, name, platform, insert_date, delete_date) select id, username, name, platform, insert_date, delete_date from person;
drop table person;
alter table person137c rename to person;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------