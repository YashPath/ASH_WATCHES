-- Cash on delivery as a payment provider.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'COD';
