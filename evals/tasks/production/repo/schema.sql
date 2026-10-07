-- Frozen fictional production snapshot.
CREATE TABLE listings (
  id uuid PRIMARY KEY, public_slug text UNIQUE NOT NULL,
  title text NOT NULL, status text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  seller_email text NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE admins (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL);
CREATE TABLE leads (
  id uuid PRIMARY KEY, listing_id uuid REFERENCES listings(id),
  customer_email text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL
);
-- There are no dealer ownership/membership tables yet.
