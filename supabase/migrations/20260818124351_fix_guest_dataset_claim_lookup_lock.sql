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
    E'\n  for update;\n',
    E';\n'
  );

  if v_function_sql like E'%\n  for update;\n%' then
    raise exception 'merge_guest_medication_dataset still contains FOR UPDATE.';
  end if;

  execute v_function_sql;
end;
$$;
