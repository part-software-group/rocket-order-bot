--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

create table if not exists person (
  id          integer primary key autoincrement,
  username    varchar(225),
  name        varchar(225),
  insert_date text not null,
  delete_date integer             default 0
);

create unique index if not exists person_username_uindex
  on person (username, delete_date);

create table if not exists lunch_list (
  id          integer primary key autoincrement,
  order_date  integer,
  list        text,
  insert_date integer,
  delete_date integer             default 0
);

create unique index if not exists lunch_list_order_date_uindex
  on lunch_list (order_date, delete_date);

create table if not exists lunch_order (
  id            integer primary key autoincrement,
  person_id     integer,
  lunch_list_id integer,
  order_date    integer,
  insert_date   integer,
  delete_date   integer             default 0
);

create unique index if not exists lunch_order_order_date_uindex
  on lunch_order (order_date, delete_date);

create table if not exists history (
  id        integer primary key autoincrement,
  person_id integer,
  change    text
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- drop index person_username_uindex;
-- drop index lunch_list_order_date_uindex;
-- drop index lunch_order_order_date_uindex;
--
-- drop table person;
-- drop table lunch_list;
-- drop table lunch_order;
-- drop table history;