# Rights requests — operating procedure

How ops works the queue at **Privacy Requests** in the admin console. The
software enforces the parts that can be enforced; this covers the parts that
cannot.

Requires the **`rights_officer`** capability (Settings → Capabilities).
Erasure additionally requires **admin**.

---

## The clock

Every request gets an `sla_due_at` on creation. **30 days** for access,
correction, erasure and grievance; **7 days** for a nominee change.

These periods are published to riders in the notice and in the app. They are
therefore a commitment, not a target — a period ops cannot meet is worse than
a longer one honestly stated. If 30 days turns out to be unrealistic, change
the period and the notice together, not just the notice.

The queue is sorted **oldest-due first** by the backend. That is deliberate:
a queue sorted newest-first is one where the request closest to breaching is
the hardest to find. The **Overdue only** filter is the daily check.

---

## Before you action anything: verify who is asking

The one control the software cannot apply.

- **In-app requests** are already authenticated — the rider was signed in.
  No further verification is needed, and asking for some is friction with no
  benefit.
- **Email, phone or walk-in requests are not.** Someone claiming to be a rider
  is exactly how a social-engineering attack on an erasure or an export
  begins. Verify against something only the account holder would know before
  doing anything, and record how you verified it in the resolution notes.

**Never action an off-app erasure or export on the strength of a name and a
phone number.** An export is a complete copy of someone's record; an erasure
is irreversible.

---

## By type

### Access / copy of data
Riders self-serve from the app; most never reach the queue. For an off-app
request use **`POST /privacy/users/:userId/export`**, which needs the
`pii_exporter` capability and is logged to `pii_access_log` as a read of the
rider's entire record — because that is what it is.

The bundle is limited to 1 per rider per 24 h and is deleted after 30 days.
See [dsar-export-schema.md](dsar-export-schema.md).

### Correction
Only for fields the rider cannot edit themselves — name after verification,
date of birth, document details. Anything they can change in the app is not a
correction request.

For identity-document corrections: **re-verify against the document image**
before applying. A correction request is a plausible way to substitute someone
else's details onto an account, and the number itself is no longer stored to
compare against.

Apply the change, then complete with notes saying what was changed.

### Erasure — two steps, deliberately

**1. Approve.** Starts a 7-day cooling-off window. Reversible: the rider can
still cancel, and so can you. The system refuses if the rider has a live
rental or an unpaid balance, and tells them what to settle first.

**2. Execute.** Destroys the identity. **There is no undo and no backup path
that restores one rider.**

The window exists because erasure is triggered by a single tap and cannot be
reversed — it protects a rider who tapped by mistake or whose phone was taken,
and gives ops a chance to spot a coerced request.

The retention job executes due erasures automatically at 03:30 UTC, so an
approved erasure completes on time whether or not anyone is watching. Manual
execution is for when it needs to happen sooner.

**Forcing early** requires a written reason, is audited, and the person who
approved it **cannot** be the one who forces it. Two people, same as roles and
capabilities.

What the rider is told, and what is true: their name, contact details,
address, photo and identity documents are destroyed; invoices, payments,
deposits and refunds are kept because tax and company law require it, no
longer linked to a name. Vehicle damage photographs are kept as evidence of a
vehicle's condition.

### Grievance
The statutory channel (s.13), deliberately separate from ordinary Support so
data complaints are not buried in the ticket queue. Every grievance has a
tracked reference and a published response period.

Treat a grievance as a signal, not just a ticket: if a rider is complaining
about how their data was handled, check `pii_access_log` for their account
before responding.

### Nominee
Usually self-serve. A nominee **exercising** rights on a deceased or
incapacitated rider's behalf is not yet a built flow — it arrives off-app,
needs documentary proof, and needs escalation.

---

## Writing the resolution

`resolution_notes` is **sent to the rider verbatim**. It is not an internal
note.

- Write it for them, not for us. No table names, no internal jargon.
- Say what was done, in the past tense.
- If something was refused, say why in a way that lets them respond.
- Rejection needs a real reason — the system enforces a 10-character minimum
  and that is a floor, not a target.

---

## Daily checks

1. **Overdue only** — anything there is already a missed commitment.
2. Requests in `awaiting_principal` for more than a week — the rider may not
   have understood what was asked.
3. Erasures approved but not executed past their grace window; the job should
   have taken them.

```sql
select category, started_at, rows_affected, error
  from public.retention_runs
 where category = 'due_erasures'
 order by started_at desc limit 7;
```

---

## Escalate

- Any erasure where the rider seems to be acting under pressure.
- Any off-app request you cannot verify.
- A nominee acting for a deceased rider.
- Any request that looks like a precursor to a dispute or a Board complaint —
  loop in the Grievance Officer early, not after the deadline.
