-- =========================================================================
-- 20260814100200_dpdpa_consent.sql
--
-- Notice and consent (DPDPA ss.5-6).
--
-- Before this migration there was no consent record of any kind. The KYC
-- wizard showed two checkboxes (apps/mobile/src/app/kyc.tsx) whose values
-- were never persisted, so for every rider the answer to "what did they
-- agree to, when, and against which version of the notice" was: unknowable.
-- That is the single largest DPDPA gap in the product, because every other
-- lawful-basis argument rests on it.
-- =========================================================================

-- ---------------------------------------------------------------------
-- consent_notices
--
-- The notice text lives in the database, not in the mobile bundle, for two
-- reasons: publishing a corrected notice must not require an app-store
-- release, and consent_records.notice_version has to resolve to the exact
-- words the rider saw, years later, for a dispute.
--
-- body_sha256 is the integrity anchor. If anyone edits a notice row after
-- riders have consented against it, the hash no longer matches and the
-- tampering is visible.
-- ---------------------------------------------------------------------
create table public.consent_notices (
    id             uuid primary key default gen_random_uuid(),
    version        text not null unique,                 -- e.g. '2026-08-14.1'
    effective_from timestamptz not null default now(),
    retired_at     timestamptz,
    body_en        text not null,
    body_ta        text not null,
    body_sha256    text not null,
    purposes       public.consent_purpose[] not null,
    created_by     uuid references public.users(id) on delete set null,
    created_at     timestamptz not null default now()
);

-- At most one live notice. The expression index on a constant is the
-- standard trick for "only one row may satisfy this predicate".
create unique index uq_consent_notices_one_active
    on public.consent_notices ((true))
    where retired_at is null;

-- ---------------------------------------------------------------------
-- consent_records
--
-- A CHANGE log, not a snapshot log: one row per purpose whose state
-- actually changed. Reconstructing "what is granted right now" is the
-- v_current_consents view's job. This keeps the table proportional to
-- decisions taken rather than to screens opened.
--
-- `ip` is itself a collection. It is kept because consent evidence that
-- cannot be tied to a device is weak evidence, but it is disclosed in the
-- notice and has its own retention row in retention_policies. Do not add
-- further telemetry here without doing the same.
-- ---------------------------------------------------------------------
create table public.consent_records (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.users(id) on delete cascade,
    purpose        public.consent_purpose not null,
    action         public.consent_action not null,
    notice_id      uuid not null references public.consent_notices(id) on delete restrict,
    notice_version text not null,
    language       text not null default 'en' check (language in ('en', 'ta')),
    source         text not null default 'mobile'
                   check (source in ('mobile', 'web', 'admin', 'import')),
    ip             inet,
    user_agent     text,
    device_id      text,
    -- Set only when a staff member recorded the decision on the rider's
    -- behalf (a phone or walk-in request). Null means the rider acted.
    actor_id       uuid references public.users(id) on delete set null,
    created_at     timestamptz not null default now()
);

create index idx_consent_records_user_purpose
    on public.consent_records (user_id, purpose, created_at desc);
create index idx_consent_records_created
    on public.consent_records (created_at desc);

create trigger trg_consent_records_append_only
    before update or delete on public.consent_records
    for each row execute function public.trg_append_only_fn();

-- ---------------------------------------------------------------------
-- Current state per (user, purpose).
-- ---------------------------------------------------------------------
create view public.v_current_consents as
select distinct on (user_id, purpose)
       user_id,
       purpose,
       action,
       notice_id,
       notice_version,
       language,
       created_at as decided_at
  from public.consent_records
 order by user_id, purpose, created_at desc;

alter view public.v_current_consents set (security_invoker = on);

-- ---------------------------------------------------------------------
-- RLS — same shape as the rest of the schema.
-- ---------------------------------------------------------------------
alter table public.consent_notices enable row level security;
alter table public.consent_records enable row level security;

-- Any signed-in user may read notices: a rider must be able to re-read what
-- they agreed to without asking anyone.
create policy consent_notices_select on public.consent_notices
    for select using (auth.uid() is not null);

create policy consent_notices_admin_write on public.consent_notices
    for all using (public.is_admin()) with check (public.is_admin());

create policy consent_records_select on public.consent_records
    for select using (user_id = auth.uid() or public.is_admin());

-- No insert/update/delete policy on consent_records at all. Writes go
-- through the backend service role only, exactly like audit_logs and
-- notifications_log — a client that can forge its own consent record has
-- not consented to anything.

-- ---------------------------------------------------------------------
-- Seed the first notice.
--
-- DRAFT — NEEDS LEGAL REVIEW. This text is engineering's best reading of
-- what the product actually does; it is not legal advice. It is seeded
-- rather than left empty so that consent_records.notice_id has something
-- valid to reference from the first rider onwards, and so the mobile
-- screens have real copy to render during development.
--
-- The identical text is mirrored in docs/dpdpa/privacy-notice.en.md and
-- .ta.md for review. THIS ROW IS THE OPERATIVE ONE. Publishing a revision
-- means inserting a new version through POST /consent/notices, which
-- retires this one and re-prompts every rider — never editing this row.
--
-- The Tamil text is a drafted translation and has NOT been checked by a
-- native speaker. It must be before launch: DPDPA s.5(3) gives the data
-- principal the right to the notice in any Eighth Schedule language, and
-- consent obtained from a notice the rider could not read is not informed.
-- ---------------------------------------------------------------------
insert into public.consent_notices (version, body_en, body_ta, body_sha256, purposes)
select
    '2026-08-14.1',
    en.t,
    ta.t,
    -- sha256() is a Postgres built-in (pg_catalog), not pgcrypto's digest().
    -- pgcrypto IS enabled, but Supabase installs extensions into the
    -- `extensions` schema, which is not on a migration's search_path — so
    -- digest() resolves to nothing here. The built-in avoids the question
    -- entirely and has no extension dependency to break later.
    --
    -- Must stay byte-identical to publishNotice() in consent.service.ts:
    -- createHash("sha256").update(`${body_en}|${body_ta}`).digest("hex").
    encode(sha256(convert_to(en.t || '|' || ta.t, 'UTF8')), 'hex'),
    enum_range(null::public.consent_purpose)
from (select $en$
# How Swapngo uses your personal data

**DRAFT — pending legal review. Version 2026-08-14.1**

Swapngo Fleet Hub ("we") rents electric scooters to riders in Chennai. To do
that we have to collect some information about you. This notice tells you
what we collect, why, who else sees it, how long we keep it, and how you can
change your mind.

## What we collect and why

**Identity verification (required).** Your Aadhaar and driving licence — the
last four digits of each number, plus photographs of the documents — and a
photograph of your face. We need this to confirm you are who you say you are
and that you are licensed to ride. A member of our staff looks at these
documents; we do not send them to an automated verification service. We do
not store your full Aadhaar or driving licence number.

**Providing the service (required).** Your name, phone number, email address,
date of birth and address, so we can create your account, assign you a
scooter, and contact you about your rental.

**Payments (required).** Records of your deposit, rentals, invoices and
refunds. Your card, UPI or bank details are handled entirely by our payment
provider and are never stored on our systems.

**Safety and incidents (required).** Reports, photographs and notes relating
to damage, accidents or theft involving a scooter you rented.

**Service messages (required).** Your phone number and device push token, so
we can send you one-time login codes, pickup reminders and payment notices.

**Marketing (optional).** Offers and news about Swapngo. You can turn this off
at any time and nothing else changes.

**Referrals (optional).** Linking your account to whoever referred you, so
rewards can be paid.

**Location (optional).** Your approximate location, only while you are using
the app, to show nearby battery-swap stations and how far away they are. We do
not track your location in the background and we do not keep a history of
where you have been.

We also record the name and phone number of an emergency contact, and — if you
choose to name one — a nominee who may act for you. Please tell that person
that you have given us their contact details.

## Who else sees your data

- Our payment provider, for taking payments and issuing refunds.
- Our SMS provider, for delivering your one-time login codes.
- Our push-notification provider, for app notifications.
- Our hosting provider, which stores the data on our behalf.
- A map and address-search service, which receives an approximate location
  when you search for a station — not your identity.

We do not sell your personal data, and we do not use it for advertising.

## How long we keep it

We keep your identity documents while your account is open. If you never
complete a rental we delete them within 90 days. Financial records — invoices,
payments, deposits and refunds — are kept for as long as tax and company law
requires, even after your account closes. Everything else is deleted or
anonymised on a published schedule.

## Your rights

You can, from the Privacy screen in the app:

- **See and download** a copy of the personal data we hold about you.
- **Correct** anything that is wrong.
- **Delete your account.** We erase your identity — your name, contact
  details, address and identity documents — and keep only the financial
  records the law requires us to keep. Those records will no longer be linked
  to a living identity.
- **Withdraw consent** for anything marked optional above, with a single
  toggle. Withdrawing consent for something marked required means closing
  your account, because we cannot rent you a scooter without it.
- **Nominate someone** to exercise these rights for you if you die or become
  unable to act.
- **Raise a grievance** if you are unhappy with how we have handled your data.

## Who to contact

Grievance Officer: **[NAME TO BE APPOINTED]**
Email: **[GRIEVANCE EMAIL TO BE PUBLISHED]**

We will acknowledge your request and respond within the period published on
the Privacy screen. If you are not satisfied, you may complain to the Data
Protection Board of India.
$en$::text as t) en
cross join (select $ta$
# ஸ்வாப்ங்கோ உங்கள் தனிப்பட்ட தரவை எவ்வாறு பயன்படுத்துகிறது

**வரைவு — சட்ட ஆய்வுக்குக் காத்திருக்கிறது. பதிப்பு 2026-08-14.1**

ஸ்வாப்ங்கோ ஃப்ளீட் ஹப் ("நாங்கள்") சென்னையில் மின்சார ஸ்கூட்டர்களை
வாடகைக்கு வழங்குகிறது. அதற்கு உங்களைப் பற்றிய சில தகவல்களை நாங்கள்
சேகரிக்க வேண்டியுள்ளது. நாங்கள் என்ன சேகரிக்கிறோம், ஏன், வேறு யார்
பார்க்கிறார்கள், எவ்வளவு காலம் வைத்திருக்கிறோம், நீங்கள் எப்படி உங்கள்
முடிவை மாற்றலாம் என்பதை இந்த அறிவிப்பு விளக்குகிறது.

## நாங்கள் என்ன சேகரிக்கிறோம், ஏன்

**அடையாள சரிபார்ப்பு (கட்டாயம்).** உங்கள் ஆதார் மற்றும் ஓட்டுநர் உரிமம் —
ஒவ்வொரு எண்ணின் கடைசி நான்கு இலக்கங்கள் மட்டும், ஆவணங்களின் புகைப்படங்களுடன்
— மேலும் உங்கள் முகப் புகைப்படம். நீங்கள் சொல்பவர்தானா என்பதையும், ஸ்கூட்டர்
ஓட்ட உரிமம் பெற்றவரா என்பதையும் உறுதிப்படுத்த இது தேவை. எங்கள் ஊழியர் ஒருவர்
இந்த ஆவணங்களைப் பார்வையிடுகிறார்; தானியங்கி சரிபார்ப்பு சேவைக்கு நாங்கள்
அனுப்புவதில்லை. உங்கள் முழு ஆதார் அல்லது ஓட்டுநர் உரிம எண்ணை நாங்கள்
சேமிப்பதில்லை.

**சேவை வழங்கல் (கட்டாயம்).** உங்கள் பெயர், தொலைபேசி எண், மின்னஞ்சல் முகவரி,
பிறந்த தேதி மற்றும் முகவரி — உங்கள் கணக்கை உருவாக்கவும், ஸ்கூட்டரை
ஒதுக்கவும், வாடகை குறித்து உங்களைத் தொடர்பு கொள்ளவும்.

**கட்டணங்கள் (கட்டாயம்).** உங்கள் வைப்புத்தொகை, வாடகைகள், விலைப்பட்டியல்கள்
மற்றும் திரும்பப் பெறுதல்கள் பற்றிய பதிவுகள். உங்கள் அட்டை, UPI அல்லது வங்கி
விவரங்கள் முழுவதுமாக எங்கள் கட்டண வழங்குநரால் கையாளப்படுகின்றன; அவை எங்கள்
அமைப்புகளில் ஒருபோதும் சேமிக்கப்படுவதில்லை.

**பாதுகாப்பு மற்றும் விபத்துகள் (கட்டாயம்).** நீங்கள் வாடகைக்கு எடுத்த
ஸ்கூட்டர் தொடர்பான சேதம், விபத்து அல்லது திருட்டு குறித்த அறிக்கைகள்,
புகைப்படங்கள் மற்றும் குறிப்புகள்.

**சேவைச் செய்திகள் (கட்டாயம்).** ஒரு முறை உள்நுழைவுக் குறியீடுகள், ஸ்கூட்டர்
பெறும் நினைவூட்டல்கள் மற்றும் கட்டண அறிவிப்புகளை அனுப்ப உங்கள் தொலைபேசி எண்
மற்றும் சாதன புஷ் டோக்கன்.

**விளம்பரம் (விருப்பத்தேர்வு).** ஸ்வாப்ங்கோ சலுகைகள் மற்றும் செய்திகள்.
எப்போது வேண்டுமானாலும் இதை நிறுத்தலாம்; வேறு எதுவும் மாறாது.

**பரிந்துரை (விருப்பத்தேர்வு).** வெகுமதிகள் வழங்கப்படுவதற்காக உங்களைப்
பரிந்துரைத்தவருடன் உங்கள் கணக்கை இணைத்தல்.

**இருப்பிடம் (விருப்பத்தேர்வு).** அருகிலுள்ள பேட்டரி மாற்று நிலையங்களையும்
அவை எவ்வளவு தூரத்தில் உள்ளன என்பதையும் காட்ட, நீங்கள் செயலியைப் பயன்படுத்தும்
போது மட்டும் உங்கள் தோராயமான இருப்பிடம். பின்னணியில் உங்கள் இருப்பிடத்தைக்
கண்காணிப்பதில்லை; நீங்கள் எங்கு சென்றீர்கள் என்ற வரலாற்றை வைத்திருப்பதில்லை.

அவசரகாலத் தொடர்பு நபரின் பெயர் மற்றும் தொலைபேசி எண்ணையும், நீங்கள்
தேர்ந்தெடுத்தால் உங்கள் சார்பாகச் செயல்படக்கூடிய ஒரு வாரிசுதாரரின்
விவரங்களையும் நாங்கள் பதிவு செய்கிறோம். அவர்களின் தொடர்பு விவரங்களை எங்களிடம்
வழங்கியுள்ளீர்கள் என்பதை அவர்களிடம் தெரிவிக்கவும்.

## வேறு யார் உங்கள் தரவைப் பார்க்கிறார்கள்

- கட்டணங்களைப் பெறவும் பணத்தைத் திரும்ப வழங்கவும் எங்கள் கட்டண வழங்குநர்.
- உங்கள் ஒரு முறை உள்நுழைவுக் குறியீடுகளை வழங்க எங்கள் SMS வழங்குநர்.
- செயலி அறிவிப்புகளுக்கு எங்கள் புஷ்-அறிவிப்பு வழங்குநர்.
- எங்கள் சார்பாகத் தரவைச் சேமிக்கும் எங்கள் ஹோஸ்டிங் வழங்குநர்.
- நிலையத்தைத் தேடும்போது தோராயமான இருப்பிடத்தைப் பெறும் வரைபட மற்றும் முகவரித்
  தேடல் சேவை — உங்கள் அடையாளத்தை அல்ல.

உங்கள் தனிப்பட்ட தரவை நாங்கள் விற்பதில்லை; விளம்பரத்திற்குப்
பயன்படுத்துவதில்லை.

## எவ்வளவு காலம் வைத்திருக்கிறோம்

உங்கள் கணக்கு செயலில் உள்ளவரை உங்கள் அடையாள ஆவணங்களை வைத்திருக்கிறோம். நீங்கள்
ஒருபோதும் வாடகையை முடிக்கவில்லை என்றால் 90 நாட்களுக்குள் அவற்றை நீக்குகிறோம்.
நிதிப் பதிவுகள் — விலைப்பட்டியல்கள், கட்டணங்கள், வைப்புத்தொகைகள் மற்றும்
திரும்பப் பெறுதல்கள் — உங்கள் கணக்கு மூடப்பட்ட பிறகும், வரி மற்றும் நிறுவனச்
சட்டம் தேவைப்படும் காலம் வரை வைக்கப்படும். மற்ற அனைத்தும் வெளியிடப்பட்ட
அட்டவணையின்படி நீக்கப்படும் அல்லது அடையாளம் நீக்கப்படும்.

## உங்கள் உரிமைகள்

செயலியில் உள்ள தனியுரிமைத் திரையிலிருந்து நீங்கள்:

- உங்களைப் பற்றி நாங்கள் வைத்திருக்கும் தனிப்பட்ட தரவின் நகலைப் **பார்க்கவும்
  பதிவிறக்கவும்** முடியும்.
- தவறான எதையும் **திருத்த** முடியும்.
- **உங்கள் கணக்கை நீக்க** முடியும். உங்கள் அடையாளத்தை — பெயர், தொடர்பு
  விவரங்கள், முகவரி மற்றும் அடையாள ஆவணங்கள் — நாங்கள் அழித்து, சட்டப்படி
  வைத்திருக்க வேண்டிய நிதிப் பதிவுகளை மட்டும் வைத்திருப்போம். அந்தப் பதிவுகள்
  இனி ஒரு உயிருள்ள அடையாளத்துடன் இணைக்கப்பட்டிருக்காது.
- மேலே விருப்பத்தேர்வு எனக் குறிக்கப்பட்ட எதற்கும் ஒரே சுவிட்சில் **சம்மதத்தைத்
  திரும்பப் பெற** முடியும். கட்டாயம் எனக் குறிக்கப்பட்ட ஒன்றுக்குச் சம்மதத்தைத்
  திரும்பப் பெறுவது என்பது உங்கள் கணக்கை மூடுவதாகும் — அது இல்லாமல் உங்களுக்கு
  ஸ்கூட்டர் வாடகைக்கு வழங்க முடியாது.
- நீங்கள் இறந்தால் அல்லது செயல்பட இயலாத நிலையில் இந்த உரிமைகளைப் பயன்படுத்த
  ஒருவரை **வாரிசுதாரராக நியமிக்க** முடியும்.
- உங்கள் தரவை நாங்கள் கையாண்ட விதம் குறித்து நீங்கள் திருப்தி அடையவில்லை
  என்றால் **குறை தெரிவிக்க** முடியும்.

## யாரைத் தொடர்பு கொள்வது

குறைதீர்ப்பு அலுவலர்: **[நியமிக்கப்பட வேண்டியவர்]**
மின்னஞ்சல்: **[வெளியிடப்பட வேண்டியது]**

உங்கள் கோரிக்கையை நாங்கள் ஒப்புக்கொண்டு, தனியுரிமைத் திரையில் வெளியிடப்பட்ட
காலத்திற்குள் பதிலளிப்போம். நீங்கள் திருப்தி அடையவில்லை என்றால், இந்திய தரவுப்
பாதுகாப்பு வாரியத்திடம் புகார் அளிக்கலாம்.
$ta$::text as t) ta;
