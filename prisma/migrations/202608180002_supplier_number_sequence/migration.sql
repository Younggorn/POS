CREATE SEQUENCE "supplier_number_seq" START WITH 1 INCREMENT BY 1;

SELECT setval(
  'supplier_number_seq',
  COALESCE((
    SELECT MAX(SUBSTRING("code" FROM 2 FOR 4)::INTEGER)
    FROM "suppliers"
    WHERE "code" ~ '^S[0-9]{4}$'
  ), 0) + 1,
  false
);
