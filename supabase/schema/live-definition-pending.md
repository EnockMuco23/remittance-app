# Live database definition status

Status: pending authoritative, read-only database information from the project
owner.

## Repository facts only

The application currently refers to the following Supabase resources from
TypeScript source. This is an integration inventory, not a claim about their
live schema, implementation, policies, or permissions.

| Resource type | Names referenced by application code |
| --- | --- |
| Tables | `profiles`, `transfer_requests`, `transaction_events` |
| Storage bucket | `transaction-evidence` |
| RPC calls | `get_available_agents`, `get_transfer_agent`, `approve_transfer`, `confirm_agent_payment`, `register_agent_evidence`, `send_to_paybot` |

## Explicitly unknown until supplied

- All table definitions, constraints, indexes, and grants.
- RLS policy names and `USING` / `WITH CHECK` expressions.
- Storage bucket configuration and `storage.objects` policies.
- Trigger definitions and trigger-function bodies.
- RPC source code, ownership, `SECURITY DEFINER` settings, grants, and input
  validation.

No security or database changes may be designed or applied from this inventory.
Once the authoritative definitions are provided, they will be recorded here
without exposing secrets, then reviewed before any forward-only migration is
proposed.
