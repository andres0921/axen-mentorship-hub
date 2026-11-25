-- Assertion helpers for the RLS tests. SECURITY INVOKER on purpose: they run
-- with the privileges of whatever role the test impersonates.
-- Results are reported as NOTICE lines "PASS: ..." / "FAIL: ..." which
-- scripts/test-rls.sh counts.

drop schema if exists tst cascade;
create schema tst;

create function tst.ok(p_name text, p_cond boolean) returns void
language plpgsql as $$
begin
  if coalesce(p_cond, false) then
    raise notice 'PASS: %', p_name;
  else
    raise notice 'FAIL: %', p_name;
  end if;
end;
$$;

-- Like ok() but shows expected/actual on failure.
create function tst.eq(p_name text, p_actual anyelement, p_expected anyelement) returns void
language plpgsql as $$
begin
  if p_actual is not distinct from p_expected then
    raise notice 'PASS: %', p_name;
  else
    raise notice 'FAIL: % (expected %, got %)', p_name, p_expected, p_actual;
  end if;
end;
$$;

-- Number of rows a query returns for the current role; -1 if it errors.
create function tst.cnt(p_sql text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  return n;
exception when others then
  return -1;
end;
$$;

-- SQLSTATE raised by a statement, or 'OK'. Changes are rolled back (subtransaction).
create function tst.err(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  raise exception using errcode = 'TSTOK';
exception
  when sqlstate 'TSTOK' then return 'OK';
  when others then return sqlstate;
end;
$$;

-- Rows affected by a DML statement; -1 if it errors. Changes are rolled back.
create function tst.affected(p_sql text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'TSTOK';
  exception
    when sqlstate 'TSTOK' then return n;
    when others then return -1;
  end;
end;
$$;

-- "Denied" = permission error (42501) or RLS violation (also 42501) or 0 rows.
create function tst.denied(p_sql text) returns boolean
language plpgsql as $$
declare
  n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'TSTOK';
  exception
    when sqlstate 'TSTOK' then return n = 0;
    when insufficient_privilege then return true;
    when others then return false;
  end;
end;
$$;

grant usage on schema tst to anon, authenticated, service_role;
grant execute on all functions in schema tst to anon, authenticated, service_role;
