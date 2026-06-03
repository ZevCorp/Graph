# Supabase

SQL migrations for the Miracle "doble conexión" feature, applied to the live project
`miracle` (ref `nzccbfccuvyfxujymizr`).

These files mirror the schema already applied to the remote database; they exist for
reproducibility and review. To apply them to a fresh project with the Supabase CLI:

```
supabase link --project-ref <your-ref>
supabase db push
```

| Migration | What it creates |
|---|---|
| `20260602000001_encounters.sql` | `encounters` (per-encounter note `jsonb`) + owner-only RLS |
| `20260602000002_encounter_events.sql` | `encounter_events` append-only audit trail + RLS |
| `20260603000001_patients.sql` | `patients` + `encounters.patient_id` + RLS |

All tables use Row Level Security so each user only sees their own rows.
