import type { Copy } from './types';

/**
 * ============================================================================
 * DRAFT — NEEDS NATIVE-SPEAKER AND LEGAL REVIEW BEFORE LAUNCH
 * ============================================================================
 *
 * This translation was drafted by an engineer, not a Tamil speaker or a
 * lawyer. It is here so the consent screens are genuinely bilingual during
 * development and so a reviewer has concrete text to correct rather than a
 * blank file.
 *
 * Two things a reviewer must check, beyond ordinary accuracy:
 *
 *  1. Register. Swapngo's riders are gig workers, not lawyers. Where a term
 *     has a formal Tamil equivalent and a plainer everyday one, the everyday
 *     one is almost always the right choice — "informed consent" is judged by
 *     whether the rider understood, not by whether the words were correct.
 *
 *  2. Anything describing a legal right or a retention period. A mistranslated
 *     right is a mis-stated right.
 *
 * The keys are type-checked against copy.en.ts, so a missing entry is a build
 * failure rather than a silent English fallback. Do not "fix" a build error
 * here by copying the English string in — leave it broken until it is
 * translated, because a screen that looks translated and is not is the worst
 * outcome available.
 */
export const ta: Copy = {
    // --- language ---------------------------------------------------------
    'lang.label': 'மொழி',

    // --- consent screen ---------------------------------------------------
    'consent.title': 'உங்கள் தனியுரிமைத் தேர்வுகள்',
    'consent.subtitle':
        'உங்கள் அடையாள ஆவணங்களைப் பெறுவதற்கு முன், நாங்கள் என்ன சேகரிக்கிறோம், ஏன் என்பதைப் பாருங்கள். விருப்பத் தேர்வுகளை எப்போது வேண்டுமானாலும் மாற்றலாம்.',
    'consent.required.heading': 'ஸ்கூட்டர் வாடகைக்குத் தேவையானவை',
    'consent.required.help':
        'இவை இல்லாமல் சேவையை வழங்க முடியாது, எனவே இவை ஒன்றாக ஏற்கப்படுகின்றன. இந்தத் தரவை நாங்கள் வைத்திருப்பதை நீங்கள் விரும்பவில்லை என்றால், கணக்கை உருவாக்க வேண்டாம்.',
    'consent.optional.heading': 'உங்கள் விருப்பம்',
    'consent.optional.help':
        'நீங்கள் இயக்கும் வரை இவை அணைந்தே இருக்கும். அணைத்து வைத்தால் வேறு எதுவும் மாறாது.',
    'consent.expand': 'இதன் பொருள் என்ன',
    'consent.collapse': 'விவரங்களை மறை',
    'consent.detail.collect': 'நாங்கள் என்ன சேகரிக்கிறோம்',
    'consent.detail.shared': 'வேறு யார் பார்க்கிறார்கள்',
    'consent.detail.retention': 'எவ்வளவு காலம் வைத்திருக்கிறோம்',
    'consent.readNotice': 'முழு தனியுரிமை அறிவிப்பைப் படிக்கவும்',
    'consent.version': 'அறிவிப்பு பதிப்பு {version}, {date} முதல் அமல்',
    'consent.confirmDeclaration': 'நான் விதிமுறைகள் மற்றும் நிபந்தனைகளைப் படித்து ஒப்புக்கொள்கிறேன் என்பதை உறுதிப்படுத்துகிறேன்.',
    'consent.accept': 'ஒப்புக்கொண்டு தொடரவும்',
    'consent.saving': 'உங்கள் தேர்வுகள் சேமிக்கப்படுகின்றன...',
    'consent.error': 'உங்கள் தேர்வுகளைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'consent.stale':
        'இந்தத் திரையைத் திறந்த பிறகு எங்கள் தனியுரிமை அறிவிப்பு புதுப்பிக்கப்பட்டுள்ளது. மீண்டும் படித்துத் தேர்வு செய்யவும்.',
    'consent.grantedOn': 'அடையாளச் சரிபார்ப்புக்கான சம்மதம் {date} அன்று வழங்கப்பட்டது',
    'consent.manage': 'நிர்வகி',

    // --- purposes ---------------------------------------------------------
    'purpose.kyc_identity_verification.title': 'நீங்கள் யார் என்பதைச் சரிபார்த்தல்',
    'purpose.kyc_identity_verification.summary':
        'உங்கள் ஆதார் மற்றும் ஓட்டுநர் உரிமப் புகைப்படங்கள், ஒவ்வொரு எண்ணின் கடைசி நான்கு இலக்கங்கள், மற்றும் உங்கள் முகப் புகைப்படம்.',
    'purpose.kyc_identity_verification.collect':
        'உங்கள் ஆதார் மற்றும் ஓட்டுநர் உரிமப் புகைப்படங்கள், ஒவ்வொரு எண்ணின் கடைசி 4 இலக்கங்கள், உங்கள் புகைப்படம், உரிமம் காலாவதியாகும் தேதி. முழு எண்களை நாங்கள் சேமிப்பதில்லை.',
    'purpose.kyc_identity_verification.shared':
        'ஸ்வாப்ங்கோவுக்கு வெளியே யாரும் இல்லை. பயிற்சி பெற்ற எங்கள் ஊழியர் ஒருவர் ஆவணங்களை நேரடியாகப் பரிசீலிக்கிறார்.',
    'purpose.kyc_identity_verification.retention':
        'உங்கள் கணக்கு செயலில் உள்ளவரை. நீங்கள் ஒருபோதும் வாடகையை முடிக்கவில்லை என்றால் 90 நாட்களுக்குள் நீக்கப்படும்.',

    'purpose.service_delivery.title': 'உங்கள் வாடகையை நடத்துதல்',
    'purpose.service_delivery.summary':
        'உங்கள் கணக்கை அமைக்கவும் ஸ்கூட்டரை ஒதுக்கவும் உங்கள் பெயர், தொடர்பு விவரங்கள், பிறந்த தேதி மற்றும் முகவரி.',
    'purpose.service_delivery.collect':
        'பெயர், தொலைபேசி எண், மின்னஞ்சல், பிறந்த தேதி, முகவரி, மற்றும் உங்கள் முன்பதிவு மற்றும் வாடகை வரலாறு.',
    'purpose.service_delivery.shared': 'ஸ்வாப்ங்கோவுக்கு வெளியே யாரும் இல்லை.',
    'purpose.service_delivery.retention': 'உங்கள் கணக்கு செயலில் உள்ளவரை.',

    'purpose.payments_and_billing.title': 'கட்டணங்கள் மற்றும் திரும்பப் பெறுதல்',
    'purpose.payments_and_billing.summary':
        'உங்கள் வைப்புத்தொகை, விலைப்பட்டியல்கள் மற்றும் திரும்பப் பெறுதல்களின் பதிவுகள். உங்கள் அட்டை, UPI அல்லது வங்கி விவரங்களை நாங்கள் ஒருபோதும் சேமிப்பதில்லை.',
    'purpose.payments_and_billing.collect':
        'வைப்புத்தொகை மற்றும் வாடகைத் தொகைகள், விலைப்பட்டியல்கள், கட்டணக் குறிப்புகள் மற்றும் திரும்பப் பெறுதல் பதிவுகள்.',
    'purpose.payments_and_billing.shared':
        'கட்டணத்தைக் கையாளும் எங்கள் கட்டண வழங்குநர். உங்கள் அட்டை மற்றும் UPI விவரங்கள் அவர்களிடம் செல்கின்றன, எங்களிடம் அல்ல.',
    'purpose.payments_and_billing.retention':
        'வரி மற்றும் நிறுவனச் சட்டம் தேவைப்படும் காலம் வரை கணக்கு மூடப்பட்ட பிறகும் வைக்கப்படும்; ஆனால் நீங்கள் கணக்கை நீக்கியவுடன் அவை உங்கள் அடையாளத்துடன் இணைக்கப்பட்டிருக்காது.',

    'purpose.safety_and_incident.title': 'சேதம் மற்றும் விபத்துகளைக் கையாளுதல்',
    'purpose.safety_and_incident.summary':
        'உங்கள் ஸ்கூட்டர் தொடர்பான சேதம், விபத்து அல்லது திருட்டு பற்றிய அறிக்கைகள் மற்றும் புகைப்படங்கள்.',
    'purpose.safety_and_incident.collect':
        'விபத்து அறிக்கைகள், சேதப் புகைப்படங்கள், குறிப்புகள் மற்றும் நீங்கள் எழுப்பும் எந்தத் தகராறும்.',
    'purpose.safety_and_incident.shared':
        'விபத்து தேவைப்படுத்தும் இடங்களில் மட்டும் காப்பீட்டு நிறுவனங்கள் அல்லது காவல்துறை.',
    'purpose.safety_and_incident.retention':
        'உரிமைகோரல் அல்லது தகராறு நிலுவையில் உள்ளவரை; பின்னர் வெளியிடப்பட்ட அட்டவணைப்படி.',

    'purpose.service_communications.title': 'சேவைச் செய்திகள் அனுப்புதல்',
    'purpose.service_communications.summary':
        'உள்நுழைவுக் குறியீடுகள், ஸ்கூட்டர் பெறும் நினைவூட்டல்கள் மற்றும் கட்டண அறிவிப்புகள். விளம்பரம் அல்ல.',
    'purpose.service_communications.collect':
        'உங்கள் தொலைபேசி எண் மற்றும் இந்தச் சாதனத்திற்கான அறிவிப்பு டோக்கன்.',
    'purpose.service_communications.shared':
        'வழங்குவதற்கு மட்டும் எங்கள் SMS வழங்குநர் மற்றும் புஷ்-அறிவிப்பு வழங்குநர்.',
    'purpose.service_communications.retention': 'உங்கள் கணக்கு செயலில் உள்ளவரை.',

    'purpose.marketing_communications.title': 'சலுகைகள் மற்றும் செய்திகள்',
    'purpose.marketing_communications.summary':
        'புதிய திட்டங்கள், தள்ளுபடிகள் மற்றும் ஸ்வாப்ங்கோ செய்திகள் பற்றிய அவ்வப்போது செய்திகள்.',
    'purpose.marketing_communications.collect': 'உங்கள் தொலைபேசி எண் மற்றும் மின்னஞ்சல்.',
    'purpose.marketing_communications.shared':
        'வழங்குவதற்கு மட்டும் எங்கள் SMS மற்றும் புஷ் வழங்குநர்கள்.',
    'purpose.marketing_communications.retention': 'நீங்கள் இதை அணைக்கும் வரை.',

    'purpose.referral_program.title': 'பரிந்துரைகள்',
    'purpose.referral_program.summary':
        'வெகுமதிகள் வழங்கப்படுவதற்காக உங்களைப் பரிந்துரைத்தவருடன் உங்கள் கணக்கை இணைத்தல்.',
    'purpose.referral_program.collect': 'உங்கள் பரிந்துரைக் குறியீடு மற்றும் உங்களைப் பரிந்துரைத்தவர்.',
    'purpose.referral_program.shared': 'ஸ்வாப்ங்கோவுக்கு வெளியே யாரும் இல்லை.',
    'purpose.referral_program.retention': 'உங்கள் கணக்கு செயலில் உள்ளவரை.',

    'purpose.location_services.title': 'அருகிலுள்ள பேட்டரி நிலையங்கள்',
    'purpose.location_services.summary':
        'அருகிலுள்ள மாற்று நிலையங்களைக் காட்ட, நீங்கள் செயலியைப் பயன்படுத்தும் போது மட்டும் உங்கள் தோராயமான இருப்பிடம். பின்னணியில் ஒருபோதும் இல்லை.',
    'purpose.location_services.collect':
        'நீங்கள் தேடும் தருணத்தில் உங்கள் தோராயமான இடம். நீங்கள் எங்கு சென்றீர்கள் என்ற வரலாற்றை வைத்திருப்பதில்லை.',
    'purpose.location_services.shared':
        'வரைபட மற்றும் முகவரித் தேடல் சேவை ஒரு தோராயமான இடத்தைப் பெறுகிறது — உங்கள் பெயரையோ கணக்கையோ அல்ல.',
    'purpose.location_services.retention': 'எங்கள் சேவையகங்களில் சேமிக்கப்படுவதே இல்லை.',

    // --- privacy hub ------------------------------------------------------
    'privacy.title': 'தனியுரிமை மற்றும் தரவு',
    'privacy.consent.heading': 'உங்கள் தேர்வுகள்',
    'privacy.consent.required.note':
        'இவை ஸ்கூட்டர் வாடகைக்குத் தேவை; தனித்தனியாக அணைக்க முடியாது.',
    'privacy.data.heading': 'உங்கள் தரவு',
    'privacy.data.export': 'உங்கள் தரவின் நகலைப் பதிவிறக்கவும்',
    'privacy.data.export.help':
        'உங்களைப் பற்றி நாங்கள் வைத்திருக்கும் அனைத்தையும் கொண்ட கோப்பைத் தயாரிப்போம்.',
    'privacy.data.export.preparing': 'உங்கள் கோப்பு தயாராகிறது...',
    'privacy.data.export.ready':
        'உங்கள் கோப்பு தயார். இந்த இணைப்பு 5 நிமிடங்களுக்கு மட்டும் செயல்படும்.',
    'privacy.data.correct': 'ஏதேனும் திருத்தச் சொல்லுங்கள்',
    'privacy.data.correct.help':
        'சரிபார்ப்புக்குப் பிறகு உங்கள் பெயர் போன்ற, நீங்களே திருத்த முடியாத விவரங்களுக்கு.',
    'privacy.data.delete': 'என் கணக்கை நீக்கு',
    'privacy.data.delete.help':
        'உங்கள் அடையாளத்தை அழிக்கிறது. சில நிதிப் பதிவுகளைச் சட்டப்படி வைத்திருக்க வேண்டும்.',
    'privacy.nominee.heading': 'வாரிசுதாரர்',
    'privacy.nominee.help':
        'நீங்கள் இறந்தால் அல்லது செயல்பட இயலாத நிலையில், உங்கள் சார்பாக இந்த உரிமைகளைப் பயன்படுத்த ஒருவரை நியமிக்கலாம்.',
    'privacy.nominee.edit': 'வாரிசுதாரரைச் சேர்க்க அல்லது மாற்ற',
    'privacy.nominee.none': 'நீங்கள் யாரையும் நியமிக்கவில்லை.',
    'privacy.nominee.warn':
        'அவர்களின் தொடர்பு விவரங்களை எங்களிடம் வழங்கியுள்ளீர்கள் என்பதை அவர்களிடம் தெரிவிக்கவும் — அவர்கள் தாமாக சம்மதிக்கவில்லை.',
    'privacy.grievance.heading': 'குறை தெரிவித்தல்',
    'privacy.grievance.help':
        'உங்கள் தரவை நாங்கள் கையாண்ட விதம் குறித்து நீங்கள் திருப்தி அடையவில்லை என்றால், இது கண்காணிக்கக்கூடிய குறிப்புடன் எங்கள் குறைதீர்ப்பு அலுவலரிடம் செல்கிறது. இது வழக்கமான ஆதரவிலிருந்து வேறுபட்டது.',
    'privacy.grievance.cta': 'தரவு குறை தெரிவிக்கவும்',
    'privacy.officer.heading': 'குறைதீர்ப்பு அலுவலர்',
    'privacy.requests.heading': 'உங்கள் கோரிக்கைகள்',
    'privacy.requests.empty': 'நீங்கள் இதுவரை எந்தக் கோரிக்கையும் செய்யவில்லை.',
    'privacy.requests.viewAll': 'உங்கள் அனைத்துக் கோரிக்கைகளையும் பார்க்க',
    'privacy.notice.link': 'தனியுரிமை அறிவிப்பைப் படிக்கவும்',
    'privacy.access.heading': 'உங்கள் தரவை யார் பார்த்தார்கள்',
    'privacy.access.empty': 'எந்த ஊழியரும் உங்கள் பதிவுகளைத் திறக்கவில்லை.',

    // --- rights requests --------------------------------------------------
    'request.type.access_export': 'என் தரவின் நகல்',
    'request.type.correction': 'திருத்தம்',
    'request.type.erasure': 'என் கணக்கை நீக்கு',
    'request.type.grievance': 'குறை',
    'request.type.nominee_update': 'வாரிசுதாரர்',
    'request.status.open': 'பெறப்பட்டது',
    'request.status.in_progress': 'பணி நடைபெறுகிறது',
    'request.status.awaiting_principal': 'உங்களுக்காகக் காத்திருக்கிறோம்',
    'request.status.completed': 'முடிந்தது',
    'request.status.rejected': 'மறுக்கப்பட்டது',
    'request.status.withdrawn': 'நீங்கள் ரத்து செய்தீர்கள்',
    'request.reference': 'குறிப்பு {reference}',
    'request.due': '{date}-க்குள் நாங்கள் பதிலளிப்போம்',
    'request.detailsLabel': 'மேலும் விவரம் சொல்லுங்கள்',
    'request.detailsPlaceholder': 'நாங்கள் என்ன செய்ய வேண்டும் என்பதை விவரிக்கவும்.',
    'request.submit': 'கோரிக்கையை அனுப்பு',
    'request.cancel': 'இந்தக் கோரிக்கையை ரத்து செய்',
    'request.submitted': 'உங்கள் கோரிக்கை பெறப்பட்டது. உங்கள் குறிப்பு {reference}.',

    // --- erasure confirm --------------------------------------------------
    'erasure.title': 'உங்கள் கணக்கை நீக்கவா?',
    'erasure.body':
        'உங்கள் பெயர், தொடர்பு விவரங்கள், முகவரி, புகைப்படம் மற்றும் அடையாள ஆவணங்களை அழித்து, உங்கள் கணக்கை மூடுவோம். நீங்கள் மீண்டும் உள்நுழைய முடியாது.',
    'erasure.retained':
        'வரி மற்றும் நிறுவனச் சட்டம் தேவைப்படும் காலம் வரை உங்கள் விலைப்பட்டியல்கள், கட்டணங்கள், வைப்புத்தொகைகள் மற்றும் திரும்பப் பெறுதல்களை வைத்திருக்க வேண்டும். அதன் பிறகு அந்தப் பதிவுகள் உங்கள் பெயருடன் இணைக்கப்பட்டிருக்காது.',
    'erasure.blocked':
        'உங்களிடம் செயலில் உள்ள வாடகை அல்லது நிலுவைத் தொகை உள்ளது. முதலில் ஸ்கூட்டரைத் திருப்பி, கணக்கைத் தீர்க்கவும்.',
    'erasure.understand':
        'என் விலைப்பட்டியல்கள், கட்டணங்கள், வைப்புத்தொகைகள் மற்றும் திரும்பப் பெறுதல்கள் வைக்கப்படும் என்பதையும், அவை இனி என் பெயருடன் இணைக்கப்பட்டிருக்காது என்பதையும் புரிந்துகொள்கிறேன்.',
    'erasure.confirm': 'ஆம், என் கணக்கை நீக்கு',
    'erasure.keep': 'என் கணக்கை வைத்திரு',

    // --- shared -----------------------------------------------------------
    'common.save': 'சேமி',
    'common.cancel': 'ரத்து',
    'common.close': 'மூடு',
    'common.retry': 'மீண்டும் முயற்சி',
    'common.loading': 'ஏற்றுகிறது...',
    'common.on': 'இயக்கு',
    'common.off': 'அணை',
    'common.required': 'கட்டாயம்',
    'common.optional': 'விருப்பம்',
};
