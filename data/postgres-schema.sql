CREATE SCHEMA IF NOT EXISTS foodsource;
REVOKE ALL ON SCHEMA foodsource FROM PUBLIC;

CREATE TABLE IF NOT EXISTS foodsource.suppliers (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS foodsource.supplier_workspace (
  supplier_id text PRIMARY KEY REFERENCES foodsource.suppliers (id),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlist', 'contacted', 'rejected')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  updated_at timestamptz
);

ALTER TABLE foodsource.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE foodsource.supplier_workspace ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA foodsource FROM PUBLIC;
