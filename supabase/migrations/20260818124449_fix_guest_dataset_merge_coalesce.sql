do $$
declare
  v_function_sql text;
begin
  select pg_get_functiondef(
    'public.merge_guest_medication_dataset(text,jsonb,jsonb)'::regprocedure
  )
  into v_function_sql;

  v_function_sql := replace(
    v_function_sql,
    'pg_catalog.coalesce(',
    'coalesce('
  );

  if v_function_sql like '%pg_catalog.coalesce(%' then
    raise exception 'merge_guest_medication_dataset still contains pg_catalog.coalesce.';
  end if;

  execute v_function_sql;
end;
$$;
