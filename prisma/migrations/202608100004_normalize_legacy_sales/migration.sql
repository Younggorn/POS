-- iSoft legacy codes: Scash_credit 0 = cash, 2 = bank/QR transfer.
UPDATE "sales" SET "paymentType" = 'C' WHERE "paymentType" = '0';
UPDATE "sales" SET "paymentType" = 'T' WHERE "paymentType" = '2';

-- Customer 000000 is iSoft's synthetic "cash" customer, not a real customer.
UPDATE "sales" SET "customerCode" = NULL WHERE "customerCode" = '000000';
