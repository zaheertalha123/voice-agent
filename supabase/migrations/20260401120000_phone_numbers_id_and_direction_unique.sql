-- Allow the same E.164 for both inbound and outbound within one org.
-- Previously phone_number was the PRIMARY KEY, so a second row with the same number failed.

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.phone_numbers
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.phone_numbers
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.phone_numbers
  DROP CONSTRAINT IF EXISTS phone_numbers_pkey;

ALTER TABLE public.phone_numbers
  ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_org_phone_direction_key
  ON public.phone_numbers (org_id, phone_number, direction);

COMMENT ON TABLE public.phone_numbers IS
  'Phone numbers per org. Same E.164 may appear twice per org with different direction (inbound vs outbound).';
