# Supabase source control

This directory is the repository location for Supabase documentation and future
forward-only migrations.

The database predates this repository directory. No live database definitions
have been imported or reconstructed here yet. The project owner will provide
the authoritative definitions before any database, RLS, Storage, trigger, or
RPC implementation is changed.

Until then, do not apply SQL to the live Supabase project and do not treat the
application's client-side references as authoritative database definitions.

Future migrations belong in `migrations/` and must be reviewed before they are
applied to any database with operational data.
