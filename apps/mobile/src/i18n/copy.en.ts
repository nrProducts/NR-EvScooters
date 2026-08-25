/**
 * UI chrome for the consent, privacy and rights screens.
 *
 * The privacy NOTICE itself is deliberately not here — it comes from the API
 * (consent_notices.body_en / body_ta), so publishing a corrected notice does
 * not need an app-store release and consent_records.notice_version always
 * resolves to the exact text the rider saw. This file holds only labels,
 * buttons and the one-line purpose descriptions.
 *
 * Scope: imported only by src/app/consent.tsx, src/app/privacy/* and the
 * consent row in src/app/kyc.tsx. The rest of the app stays hardcoded English
 * until someone decides to translate it properly.
 */
export const en = {
    // --- language ---------------------------------------------------------
    'lang.label': 'Language',

    // --- consent screen ---------------------------------------------------
    'consent.title': 'Your privacy choices',
    'consent.subtitle':
        'Before we take your ID documents, here is what we collect and why. You can change the optional choices at any time.',
    'consent.required.heading': 'Needed to rent a scooter',
    'consent.required.help':
        'We cannot provide the service without these, so they are accepted together. If you would rather we did not hold this data, do not create an account.',
    'consent.optional.heading': 'Up to you',
    'consent.optional.help': 'These are off unless you turn them on. Nothing else changes if you leave them off.',
    'consent.expand': 'What this means',
    'consent.collapse': 'Hide details',
    'consent.detail.collect': 'What we collect',
    'consent.detail.shared': 'Who else sees it',
    'consent.detail.retention': 'How long we keep it',
    'consent.readNotice': 'Read the full privacy notice',
    'consent.version': 'Notice version {version}, effective {date}',
    'consent.confirmDeclaration': 'I confirm that I have read and agree to the terms and conditions.',
    'consent.accept': 'Agree & Continue',
    'consent.saving': 'Saving your choices...',
    'consent.error': 'We could not save your choices. Please try again.',
    'consent.stale':
        'Our privacy notice has been updated since you opened this screen. Please read it again and choose.',
    'consent.grantedOn': 'Consent for identity verification given on {date}',
    'consent.manage': 'Manage',

    // --- purposes ---------------------------------------------------------
    'purpose.kyc_identity_verification.title': 'Verify who you are',
    'purpose.kyc_identity_verification.summary':
        'Your Aadhaar and driving licence photos, the last four digits of each number, and a photo of your face.',
    'purpose.kyc_identity_verification.collect':
        'Photographs of your Aadhaar and driving licence, the last 4 digits of each number, your photo, and the licence expiry date. We do not store the full numbers.',
    'purpose.kyc_identity_verification.shared':
        'Nobody outside Swapngo. A trained member of our staff reviews the documents by hand.',
    'purpose.kyc_identity_verification.retention':
        'While your account is open. Deleted within 90 days if you never complete a rental.',

    'purpose.service_delivery.title': 'Run your rental',
    'purpose.service_delivery.summary':
        'Your name, contact details, date of birth and address, so we can set up your account and assign a scooter.',
    'purpose.service_delivery.collect':
        'Name, phone number, email, date of birth, address, and your booking and rental history.',
    'purpose.service_delivery.shared': 'Nobody outside Swapngo.',
    'purpose.service_delivery.retention': 'While your account is open.',

    'purpose.payments_and_billing.title': 'Take payments and refunds',
    'purpose.payments_and_billing.summary':
        'Records of your deposit, invoices and refunds. We never store your card, UPI or bank details.',
    'purpose.payments_and_billing.collect':
        'Deposit and rental amounts, invoices, payment references and refund records.',
    'purpose.payments_and_billing.shared':
        'Our payment provider, which handles the payment itself. Your card and UPI details go to them, never to us.',
    'purpose.payments_and_billing.retention':
        'Kept after your account closes for as long as tax and company law requires, but no longer linked to your identity once you delete your account.',

    'purpose.safety_and_incident.title': 'Handle damage and accidents',
    'purpose.safety_and_incident.summary':
        'Reports and photographs about damage, accidents or theft involving your scooter.',
    'purpose.safety_and_incident.collect':
        'Incident reports, damage photographs, notes and any dispute you raise.',
    'purpose.safety_and_incident.shared':
        'Insurers or the police only where an incident requires it.',
    'purpose.safety_and_incident.retention':
        'Kept while any claim or dispute is open, then under the published schedule.',

    'purpose.service_communications.title': 'Send you service messages',
    'purpose.service_communications.summary':
        'Login codes, pickup reminders and payment notices. Not marketing.',
    'purpose.service_communications.collect':
        'Your phone number and the notification token for this device.',
    'purpose.service_communications.shared':
        'Our SMS provider and our push-notification provider, for delivery only.',
    'purpose.service_communications.retention': 'While your account is open.',

    'purpose.marketing_communications.title': 'Offers and news',
    'purpose.marketing_communications.summary':
        'Occasional messages about new plans, discounts and Swapngo news.',
    'purpose.marketing_communications.collect': 'Your phone number and email.',
    'purpose.marketing_communications.shared': 'Our SMS and push providers, for delivery only.',
    'purpose.marketing_communications.retention': 'Until you turn this off.',

    'purpose.referral_program.title': 'Referrals',
    'purpose.referral_program.summary':
        'Link your account to whoever referred you, so rewards can be paid.',
    'purpose.referral_program.collect': 'Your referral code and who referred you.',
    'purpose.referral_program.shared': 'Nobody outside Swapngo.',
    'purpose.referral_program.retention': 'While your account is open.',

    'purpose.location_services.title': 'Nearby battery stations',
    'purpose.location_services.summary':
        'Your approximate location while you are using the app, to show nearby swap stations. Never in the background.',
    'purpose.location_services.collect':
        'Your approximate position at the moment you search. We do not keep a history of where you have been.',
    'purpose.location_services.shared':
        'A map and address-search service receives an approximate position — not your name or account.',
    'purpose.location_services.retention': 'Not stored on our servers at all.',

    // --- privacy hub ------------------------------------------------------
    'privacy.title': 'Privacy & data',
    'privacy.consent.heading': 'Your choices',
    'privacy.consent.required.note':
        'These are needed to rent a scooter and cannot be turned off on their own.',
    'privacy.data.heading': 'Your data',
    'privacy.summary': 'What we know about you',
    'privacy.summary.help':
        'A summary of the data we hold about you, how long we keep it, and who else receives it.',
    'privacy.summary.identity': 'Your details',
    'privacy.summary.name': 'Name',
    'privacy.summary.phone': 'Phone',
    'privacy.summary.email': 'Email',
    'privacy.summary.dob': 'Date of birth',
    'privacy.summary.address': 'Address',
    'privacy.summary.correctCta': 'Something here wrong? Ask us to correct it',
    'privacy.summary.categories': 'What we hold',
    'privacy.summary.records': '{count} records',
    'privacy.summary.none': 'Nothing yet',
    'privacy.summary.consents': 'Your choices',
    'privacy.summary.shared': 'Who else receives your data',
    'privacy.summary.notHeld': 'What we do not hold',
    'privacy.summary.generated': 'Correct as of {date}',
    'privacy.data.correct': 'Ask us to correct something',
    'privacy.data.correct.help':
        'For details you cannot edit yourself, such as your name after verification.',
    'privacy.data.delete': 'Delete my account',
    'privacy.data.delete.help': 'Erases your identity. Some financial records must be kept by law.',
    'privacy.nominee.heading': 'Nominee',
    'privacy.nominee.help':
        'You can name one person who may exercise these rights for you if you die or become unable to act.',
    'privacy.nominee.edit': 'Add or change your nominee',
    'privacy.nominee.none': 'You have not named anyone.',
    'privacy.nominee.warn':
        'Please tell this person you have given us their contact details — they have not consented themselves.',
    'privacy.grievance.heading': 'Raise a grievance',
    'privacy.grievance.help':
        'If you are unhappy with how we handle your data, this goes to our Grievance Officer with a tracked reference. It is separate from ordinary Support.',
    'privacy.grievance.cta': 'Raise a data grievance',
    'privacy.officer.heading': 'Grievance Officer',
    'privacy.requests.heading': 'Your requests',
    'privacy.requests.empty': 'You have not made any requests yet.',
    'privacy.requests.viewAll': 'See all your requests',
    'privacy.notice.link': 'Read the privacy notice',
    'privacy.access.heading': 'Who has looked at your data',
    'privacy.access.empty': 'No member of staff has opened your records.',

    // --- rights requests --------------------------------------------------
    'request.type.access_export': 'Copy of my data',
    'request.type.correction': 'Correction',
    'request.type.erasure': 'Delete my account',
    'request.type.grievance': 'Grievance',
    'request.type.nominee_update': 'Nominee',
    'request.status.open': 'Received',
    'request.status.in_progress': 'Being worked on',
    'request.status.awaiting_principal': 'Waiting for you',
    'request.status.completed': 'Done',
    'request.status.rejected': 'Declined',
    'request.status.withdrawn': 'Cancelled by you',
    'request.reference': 'Reference {reference}',
    'request.due': 'We will respond by {date}',
    'request.detailsLabel': 'Tell us more',
    'request.detailsPlaceholder': 'Describe what you would like us to do.',
    'request.submit': 'Send request',
    'request.cancel': 'Cancel this request',
    'request.submitted': 'We have your request. Your reference is {reference}.',

    // --- erasure confirm --------------------------------------------------
    'erasure.title': 'Delete your account?',
    'erasure.body':
        'We will erase your name, contact details, address, photo and identity documents, and close your account. You will not be able to sign in again.',
    'erasure.retained':
        'We must keep your invoices, payments, deposits and refunds for as long as tax and company law requires. After this, those records will no longer be linked to you by name.',
    'erasure.blocked':
        'You have an active rental or an unpaid balance. Please return your scooter and settle your account first.',
    'erasure.understand':
        'I understand my invoices, payments, deposits and refunds will be kept, and will no longer be linked to my name.',
    'erasure.confirm': 'Yes, delete my account',
    'erasure.keep': 'Keep my account',

    // --- shared -----------------------------------------------------------
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.retry': 'Try again',
    'common.loading': 'Loading...',
    'common.on': 'On',
    'common.off': 'Off',
    'common.required': 'Required',
    'common.optional': 'Optional',
} as const;
