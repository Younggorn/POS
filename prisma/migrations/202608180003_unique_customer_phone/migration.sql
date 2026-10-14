CREATE UNIQUE INDEX "customers_phone_normalized_key"
ON "customers" ((regexp_replace("phone", '[^0-9]', '', 'g')))
WHERE NULLIF(regexp_replace("phone", '[^0-9]', '', 'g'), '') IS NOT NULL;
