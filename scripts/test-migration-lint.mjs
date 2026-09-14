import assert from "node:assert/strict";

import { analyzeMigrationSql } from "./check-migrations.mjs";

const riskySql = `
alter table public.profiles
  add column nickname text not null,
  alter column phone set not null,
  alter column status type text;

create unique index concurrently if not exists profiles_phone_key
  on public.profiles (phone);
`;

assert.deepEqual(
    analyzeMigrationSql(riskySql).map(({ type, table }) => ({ type, table })),
    [
        { type: "ADD_NOT_NULL", table: "public.profiles" },
        { type: "SET_NOT_NULL", table: "public.profiles" },
        { type: "ALTER_TYPE", table: "public.profiles" },
        { type: "UNIQUE_INDEX", table: "public.profiles" },
    ],
);

const safeSql = `
-- alter table public.hidden add column value text not null;
alter table public.profiles
  add column nickname text not null default '';
create index profiles_name_idx on public.profiles (name);
`;

assert.deepEqual(analyzeMigrationSql(safeSql), []);

console.log("✅ 마이그레이션 위험 DDL 린트 테스트 6건 통과");
