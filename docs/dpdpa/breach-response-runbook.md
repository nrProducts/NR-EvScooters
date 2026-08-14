# Personal data breach — response runbook

**DRAFT. The notification timeline in §4 must be confirmed against the final
Rule text before anyone relies on it.**

---

## Read this first: this runbook has no detection behind it

Everything below assumes somebody has *noticed* a breach. Today that means a
person spotting something — there is no automated detection, no alerting on
`pii_access_log` volume, no anomaly detection on storage reads, and no
external monitoring.

**A runbook with no detection is paper.** It tells you what to do once you
know, and says nothing about the far more likely case where nobody knows. The
gap is stated here rather than hidden because a compliance document that
implies a capability the system does not have is worse than one that admits
the hole.

**The follow-up work, in priority order:**

1. Alert on `pii_access_log` rate anomalies per actor — an ops agent opening
   forty riders' documents in an hour is the signal that matters most, and the
   data to detect it now exists.
2. Alert on Supabase Auth failed-login spikes and on service-role key use from
   an unexpected source.
3. Alert on bulk reads of `kyc-documents` in Supabase storage logs.

Until at least (1) exists, treat the detection column of any assessment as
red.

---

## 1. What counts

A personal data breach is any unauthorised processing, accidental disclosure,
acquisition, sharing, use, alteration, destruction or loss of access to
personal data that compromises its confidentiality, integrity or availability.

Concretely, for Swapngo:

| Scenario | Breach? |
|---|---|
| A staff member without `kyc_reviewer` obtains an ID image | Yes |
| A staff member with the capability opens documents for riders they have no task for | Yes — misuse |
| The service-role key leaks | Yes, and treat as total |
| A `data-exports` signed URL is forwarded outside the rider | Yes |
| A rider's account is accessed by someone else via a stolen OTP | Yes |
| Ransomware or accidental destruction of the KYC bucket | Yes — availability |
| An ops agent views a rider's profile to answer their ticket | No |
| A rider downloads their own data | No |

---

## 2. Immediately (first hour)

Containment first. Evidence second. Notification third. In that order.

1. **Contain.**
   - Suspected key or account compromise → rotate the Supabase service-role
     key; revoke sessions (`auth.admin.signOut(userId, 'global')`).
   - Suspected staff misuse → revoke their capabilities first
     (Settings → Capabilities; it takes effect immediately, capabilities are
     read per request, not from the JWT), then their roles.
   - Suspected storage exposure → the buckets are private and URLs expire in
     300 s; confirm no bucket was flipped public.

2. **Preserve evidence — before anything else is changed.**
   ```sql
   -- who read what, and why they said they were reading it
   select * from public.pii_access_log
    where created_at > now() - interval '30 days'
    order by created_at desc;

   -- what changed
   select * from public.audit_logs
    where created_at > now() - interval '30 days'
    order by created_at desc;
   ```
   Both tables are append-only, so they cannot be tampered with after the
   fact — including by us. Export to a file held outside the system.

   Also capture Supabase Auth logs, Edge Function logs and storage access logs
   **before** their own retention expires.

3. **Open an incident record.** Time of discovery, who found it, what is known
   and what is guessed — keep those two apart.

---

## 3. Assess (first day)

Answer four questions, in writing:

1. **Which categories?** Identity documents and images are the most serious
   category the system holds. Financial records are next. Use
   [data-inventory.md](data-inventory.md) to be exhaustive rather than
   working from memory.
2. **Whose, and how many?** `pii_access_log.target_user_id` gives the exact
   list where the exposure went through the application.
3. **Full numbers or last four?** Since the minimisation work, `user_documents`
   holds only the last four characters — **but check whether the legacy
   `doc_number` column had been dropped at the time of the breach, and check
   whether any PITR backup in scope predates the drop.** Do not assert "only
   last four" without verifying both.
4. **Still ongoing?**

---

## 4. Notify

> **The exact timeline must be confirmed against the final DPDP Rules text.**
> Cited periods vary between sources, and this is not a number to get from a
> blog post. See the legal list in [README.md](README.md).

**Data Protection Board of India** — without delay once a breach is known.
Include nature, categories, approximate number of principals, likely
consequences, measures taken and the contact point.

**Affected data principals** — without delay, in English **and Tamil**, in
plain language. Use the app's notification channel and SMS; do not rely on
email alone, since many riders sign up by phone only.

Template — fill in, do not send as-is:

> **Something happened to your information**
>
> On **[date]** we found that **[what happened, plainly]**.
>
> **What was affected:** [categories. Be specific. If ID documents were
> involved, say so.]
>
> **What we have done:** [containment, in the past tense.]
>
> **What you should do:** [concrete steps, or say plainly that there is
> nothing they need to do.]
>
> If you have questions, contact our Grievance Officer at **[email]**. You
> may also complain to the Data Protection Board of India.

Do not minimise, do not say "may have been affected" if you know they were,
and do not delay a notification to finish the investigation — say what is
known and follow up.

---

## 5. After

- **Post-incident review within two weeks.** What let it happen, what let it
  continue undetected, and which of the three detection items above would have
  caught it.
- Update [data-inventory.md](data-inventory.md) if the breach revealed data
  flowing somewhere it does not record.
- If a processor was involved, review their DPA and whether they notified us in
  time — see [processor-dpa-checklist.md](processor-dpa-checklist.md).
- Keep the incident record. It is evidence of the response.

---

## Contacts

| Role | Who | Reach |
|---|---|---|
| Grievance Officer | **[TO BE APPOINTED]** | **[TO BE PUBLISHED]** |
| Incident lead | **[TO BE ASSIGNED]** | |
| Supabase support | | |
| Razorpay security | | |
| MSG91 support | | |

**These placeholders must be filled before launch.** An incident is not the
moment to be working out who to call.
