import type { Copy } from './types';

/**
 * ============================================================================
 * DRAFT — NEEDS NATIVE-SPEAKER AND LEGAL REVIEW BEFORE LAUNCH
 * ============================================================================
 *
 * This translation was drafted by an engineer, not a Tamil speaker or a
 * lawyer. It is here so the app is genuinely usable in Tamil during
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
 *  2. Anything describing a legal right, a retention period, or money. A
 *     mistranslated right is a mis-stated right, and a mistranslated fee is a
 *     support ticket.
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
    'language.title': 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    'language.subtitle': 'இதை நீங்கள் பின்னர் உங்கள் சுயவிவரத்தில் மாற்றலாம்.',
    'language.settingsTitle': 'மொழியைத் தேர்ந்தெடுக்கவும்',
    'language.continue': 'தொடரவும்',
    'language.done': 'முடிந்தது',
    'language.changed': 'மொழி புதுப்பிக்கப்பட்டது',
    'language.a11y.selected': '{language}, தேர்ந்தெடுக்கப்பட்டது',
    'language.a11y.notSelected': '{language}, தேர்ந்தெடுக்கப்படவில்லை',
    'language.a11y.hint': 'செயலியை இந்த மொழிக்கு மாற்றுகிறது',
    'language.offlineNote':
        'உங்கள் தேர்வு இந்தச் சாதனத்தில் சேமிக்கப்படும், மீண்டும் இணையம் கிடைக்கும்போது ஒத்திசைக்கப்படும்.',

    // --- common -----------------------------------------------------------
    'common.confirm': 'உறுதிப்படுத்து',
    'common.yes': 'ஆம்',
    'common.no': 'இல்லை',
    'common.ok': 'சரி',
    'common.gotIt': 'புரிந்தது',
    'common.back': 'பின்செல்',
    'common.next': 'அடுத்து',
    'common.continue': 'தொடரவும்',
    'common.done': 'முடிந்தது',
    'common.skip': 'தவிர்',
    'common.notNow': 'இப்போது வேண்டாம்',
    'common.submit': 'சமர்ப்பி',
    'common.share': 'பகிர்',
    'common.seeAll': 'அனைத்தையும் காண்க',
    'common.viewAll': 'அனைத்தையும் பார்க்க',
    'common.remove': 'அகற்று',
    'common.edit': 'திருத்து',
    'common.refresh': 'புதுப்பி',
    'common.search': 'தேடு',
    'common.none': 'எதுவும் இல்லை',
    'common.dash': '—',
    'common.total': 'மொத்தம்',
    'common.somethingWentWrong': 'ஏதோ தவறு நடந்தது',
    'common.genericError': 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
    'common.tryAgain': 'மீண்டும் முயற்சி செய்',
    'common.noMatches': 'பொருத்தங்கள் இல்லை.',
    'common.pleaseTryAgain': 'தயவுசெய்து மீண்டும் முயற்சிக்கவும்.',

    // --- navigation -------------------------------------------------------
    'navigation.home': 'முகப்பு',
    'navigation.scooter': 'ஸ்கூட்டர்',
    'navigation.billing': 'திட்டம் & கட்டணம்',
    'navigation.stations': 'நிலையங்கள்',
    'navigation.profile': 'சுயவிவரம்',
    'navigation.notifications': 'அறிவிப்புகள்',
    'navigation.support': 'ஆதரவு',

    // --- settings / profile menu ------------------------------------------
    'settings.settings': 'அமைப்புகள்',
    'settings.language': 'மொழி',
    'settings.chooseLanguage': 'மொழியைத் தேர்ந்தெடுக்கவும்',
    'settings.account': 'கணக்கு',

    // --- my scooter / rental ----------------------------------------------
    'scooter.title': 'என் ஸ்கூட்டர்',
    'scooter.registrationNumber': 'பதிவு எண்',
    'scooter.plan': 'திட்டம்',
    'scooter.onRentSince': 'வாடகை தொடங்கியது',
    'scooter.sinceValue': '{date} · நாள் {day}',
    'scooter.planEnded': 'திட்டம் முடிந்தது',
    'scooter.renewsOn': 'புதுப்பிக்கப்படும் தேதி',
    'scooter.nextServiceDue': 'அடுத்த சர்வீஸ் தேதி',
    'scooter.pickedUpAt': 'பெறப்பட்ட இடம்',
    'scooter.pickupStation': 'பிக்கப் நிலையம்',
    'scooter.renewPlan': 'திட்டத்தைப் புதுப்பி',
    'scooter.returnScooter': 'ஸ்கூட்டரைத் திருப்பு',
    'scooter.returnAfter': 'உங்கள் தற்போதைய திட்டக் காலம் {date} அன்று முடிந்தவுடன் திருப்பித் தரலாம்.',
    'scooter.reportProblem': 'ஒரு பிரச்சினையைப் புகாரளி',
    'scooter.notAssigned': 'வாகனம் இன்னும் ஒதுக்கப்படவில்லை',
    'scooter.empty.title': 'செயலில் வாடகை இல்லை',
    'scooter.empty.subtitle':
        'ஒரு ஸ்கூட்டரை முன்பதிவு செய்யுங்கள் — பெற்றவுடன் அதன் விவரங்கள் இந்தத் திரையில் தோன்றும்.',
    'rental.activePlan': 'செயலில் உள்ள திட்டம்',
    'rental.unlimitedKms': 'வரம்பற்ற கி.மீ',
    'rental.myPlan': 'என் திட்டம்',
    'rental.yourPlan': 'உங்கள் திட்டம்',
    'rental.assigned': 'ஒதுக்கப்பட்டது',
    'rental.viewPlanDetails': 'திட்ட விவரங்களைப் பார்க்க',
    'rental.renewPlanNow': 'இப்போதே திட்டத்தைப் புதுப்பி',
    'rental.lastDay': 'கடைசி நாள்',
    'rental.daysRemaining.one': '1 நாள் மீதம்',
    'rental.daysRemaining.other': '{count} நாட்கள் மீதம்',
    'rental.dayOf': 'நாள் {day} / {total}',
    'rental.periodRange': '{start}  —  {end}',

    // --- scooter status card (Home alert strip) ---------------------------
    'scooterStatus.paymentRequired': 'கட்டணம் தேவை',
    'scooterStatus.paymentRequired.body': 'உங்கள் ஸ்கூட்டர் திருப்பலை முடிக்க கட்டணத்தைச் செலுத்தவும்.',
    'scooterStatus.pay': '{amount} செலுத்து',
    'scooterStatus.paymentReceived': 'கட்டணம் பெறப்பட்டது',
    'scooterStatus.paymentReceived.body': 'உங்கள் திருப்பு முடிவதற்கு முன் நிர்வாக உறுதிப்படுத்தல் நிலுவையில்.',
    'scooterStatus.verificationPending': 'திருப்பு சரிபார்ப்பு நிலுவையில்',
    'scooterStatus.verificationPending.body': 'உங்கள் கட்டணம் சரிபார்க்கப்பட்டது — எங்கள் குழு ஒப்படைப்பை முடித்துக்கொண்டிருக்கிறது.',
    'scooterStatus.returnRequested': 'திருப்பு கோரப்பட்டது',
    'scooterStatus.returnRequested.body':
        'உங்கள் ஸ்கூட்டர் ஊழியர் உறுதிப்படுத்த காத்திருக்கிறது. அது உறுதிப்படுத்தும் வரை உங்களுடையதே.',
    'scooterStatus.recoveryRequired': 'வாகனத்தை மீட்க வேண்டும்',
    'scooterStatus.recoveryRequired.body':
        '{amount} தாமத கட்டணம் பொருந்தும். உங்கள் ஸ்கூட்டரை பெறுவதற்குத் தயாராக வையுங்கள்.',
    'scooterStatus.renewalScheduled': 'புதுப்பித்தல் திட்டமிடப்பட்டது',
    'scooterStatus.renewalScheduled.starts': '{date} அன்று தொடங்கும்.',
    'scooterStatus.renewalScheduled.body': 'உங்கள் தற்போதைய திட்டம் அதுவரை செயலில் இருக்கும்.',
    'scooterStatus.expired.overdueOne': 'திட்டம் முடிந்தது · 1 நாள் தாமதம்',
    'scooterStatus.expired.overdueOther': 'திட்டம் முடிந்தது · {count} நாட்கள் தாமதம்',
    'scooterStatus.expired.renewToday': 'திட்டம் முடிந்தது · இன்றே புதுப்பிக்கவும்',
    'scooterStatus.lateFeeBuilt': '{amount} தாமத கட்டணம் சேர்ந்துவிட்டது, ஒவ்வொரு நாளும் அதிகரிக்கும்.',
    'scooterStatus.renewToClear': 'இதை அழிக்கவும் தொடர்ந்து ஓட்டவும் கீழே புதுப்பிக்கவும்.',
    'scooterStatus.returnAsap': 'கூடிய விரைவில் உங்கள் ஸ்கூட்டரைத் திருப்பவும்.',
    'scooterStatus.renewFreeToday': 'இன்று கீழே புதுப்பித்தால் தாமத கட்டணம் இல்லை — {rate}/நாள் நாளையிலிருந்து தொடங்கும்.',
    'scooterStatus.renewToKeepRiding': 'தொடர்ந்து ஓட்ட கீழே திட்டத்தைப் புதுப்பிக்கவும்.',
    'scooterStatus.planExpired': 'திட்டம் முடிந்தது',
    'scooterStatus.planEndsOn': 'திட்டம் {date} அன்று முடியும்',
    'scooterStatus.planEndsOnWithLeft': 'திட்டம் {date} அன்று முடியும் · {remaining}',
    'scooterStatus.planStatus': 'திட்ட நிலை',
    'scooterStatus.daysLeftOne': '1 நாள் மீதம்',
    'scooterStatus.daysLeftOther': '{count} நாட்கள் மீதம்',
    'scooterStatus.renewLateFeeApplies': 'கீழே புதுப்பிக்கவும் — தாமத கட்டணம் பொருந்தும், செலுத்தும் முன் காட்டப்படும்.',
    'scooterStatus.renewAnyTime': 'திட்டம் முடிவதற்கு முன் எப்போது வேண்டுமானாலும் புதுப்பிக்கலாம்.',
    'scooterStatus.active': 'ஸ்கூட்டர் செயலில்',
    'scooterStatus.allGood': 'எல்லாம் சரியாக உள்ளது.',

    // --- return status card -----------------------------------------------
    'returnStatus.overdueOne': '1 நாள் தாமதம்',
    'returnStatus.overdueOther': '{count} நாட்கள் தாமதம்',
    'returnStatus.returnRequested': 'திருப்பு கோரப்பட்டது',
    'returnStatus.recoveryBody.one':
        '{amount} தாமத கட்டணம் பொருந்தும் (1 நாள் வரை) மற்றும் எங்கள் குழு ஸ்கூட்டரைச் சேகரிக்க வருகிறது. அதை பெறுவதற்குத் தயாராக வையுங்கள்.',
    'returnStatus.recoveryBody.other':
        '{amount} தாமத கட்டணம் பொருந்தும் ({days} நாட்கள் வரை) மற்றும் எங்கள் குழு ஸ்கூட்டரைச் சேகரிக்க வருகிறது. அதை பெறுவதற்குத் தயாராக வையுங்கள்.',
    'returnStatus.overdueBody':
        'இதுவரை {amount} தாமத கட்டணம் சேர்ந்துள்ளது, எங்கள் குழு ஒப்படைப்பை உறுதிப்படுத்தும்போது வசூலிக்கப்படும்.',
    'returnStatus.handInBy':
        '{deadline}க்குள் உங்கள் ஸ்கூட்டரைத் திருப்பவும். எங்கள் குழு ஒப்படைப்பை உறுதிப்படுத்தும் — அதுவரை ஸ்கூட்டர் உங்களுடையதே.',
    'returnStatus.stagePrefix': 'திருப்பு நிலை: {stage}',
    'returnStatus.stage.payment_required': 'கட்டணம் தேவை',
    'returnStatus.stage.payment_submitted': 'கட்டணம் சமர்ப்பிக்கப்பட்டது',
    'returnStatus.stage.ready_for_approval': 'கட்டணம் சரிபார்க்கப்பட்டது — ஒப்புதலுக்குத் தயார்',
    'returnStatus.stage.return_completed': 'திருப்பு முடிந்தது',
    'returnStatus.stageBody.paymentRequired':
        'பரிசோதனையின்போது {amount} கூடுதலாகக் கண்டறியப்பட்டது (சேதம்/பிற கட்டணங்கள்). உங்கள் திருப்பைத் தொடர மேலே செலுத்தவும்.',
    'returnStatus.stageBody.paymentSubmitted':
        'கட்டண நிலை: செலுத்தப்பட்டது – நிர்வாக சரிபார்ப்புக்காகக் காத்திருக்கிறது. உங்கள் கட்டணம் பெறப்பட்டது. நிர்வாகி அதைச் சரிபார்த்து உங்கள் வாகனத் திருப்பை முடிப்பார்.',
    'returnStatus.stageBody.readyForApproval':
        'உங்கள் கட்டணம் சரிபார்க்கப்பட்டது. திருப்பு முடிவதற்குக் காத்திருக்கிறது — எங்கள் குழு விரைவில் ஒப்படைப்பை முடிக்கும்.',
    'returnStatus.stageBody.completed': 'உங்கள் வாகனம் வெற்றிகரமாகத் திருப்பப்பட்டது.',

    // --- return lock ------------------------------------------------------
    'returnLock.title': 'திருப்பு கோரப்பட்டது',
    'returnLock.body':
        'இந்த ஸ்கூட்டரைத் திருப்பக் கோரியுள்ளீர்கள், எனவே எங்கள் குழு ஒப்படைப்பை முடிக்கும் வரை உங்கள் திட்டத்தை மாற்ற முடியாது. அவர்கள் உறுதிப்படுத்தும் வரை ஸ்கூட்டர் உங்களுடையதே.',
    'returnLock.blockedHint':
        'தொடர்ந்து ஓட்ட வேண்டுமா? ஆதரவைத் தொடர்பு கொள்ளுங்கள், உங்களுக்காக திருப்பை ரத்து செய்யலாம்.',
    'returnLock.supportHint': 'இந்தத் திருப்பு உட்பட, நீங்கள் இன்னும் ஆதரவைத் தொடர்பு கொள்ளலாம்.',
    'returnLock.continueToSupport': 'ஆதரவுக்குத் தொடரவும்',

    // --- late fee policy explainer ----------------------------------------
    'lateFee.title': 'உங்கள் தாமத கட்டணம் எப்படிக் கணக்கிடப்படுகிறது',
    'lateFee.lastDay.heading': 'உங்கள் திட்டத்தின் கடைசி நாள் உங்களுடையது',
    'lateFee.lastDay.body':
        'உங்கள் திட்டம் அதன் கடைசி நாளை முழுவதுமாக உள்ளடக்கியது. திட்டம் முடிந்த மறுநாள் மட்டுமே தாமத கட்டணம் தொடங்கும்.',
    'lateFee.renewing.heading': 'புதுப்பித்தல் இன்றைக்கானது',
    'lateFee.renewing.body':
        'நீங்கள் புதுப்பிக்கும்போது, உங்கள் புதிய திட்டம் இன்றே தொடங்குகிறது — எனவே இன்று அபராதமாக அல்ல, திட்ட நேரமாகக் கணக்கிடப்படுகிறது. திட்டம் முடிந்த முதல் நாளிலேயே புதுப்பித்தால் தாமத கட்டணமே இல்லை.',
    'lateFee.returning.heading': 'திருப்புதல் இன்றைப் பயன்படுத்துகிறது',
    'lateFee.returning.body':
        'நீங்கள் ஸ்கூட்டரைத் திருப்பும்போது, ஏற்கனவே இன்று அதை ஓட்டிவிட்டீர்கள், எனவே இன்றும் கணக்கிடப்படும். அதனால்தான் திருப்புதல் எப்போதும் அதே தேதியில் புதுப்பிப்பதைவிட ஒரு நாள் அதிகமாகக் காட்டும்.',
    'lateFee.oneFee.heading': 'இது ஒரு கட்டணம் தான், ஒருமுறை மட்டும் செலுத்தப்படும்',
    'lateFee.oneFee.withRate':
        'இரு வழியிலும் விகிதம் {rate}/நாள். எப்படி அழித்தாலும் — புதுப்பித்தாலும் அல்லது திருப்புவதற்கு முன் செலுத்தினாலும் — இது ஒரே கடன், ஒருமுறை செலுத்தினால் இந்தச் சுழற்சிக்கு தீர்ந்துவிடும்.',
    'lateFee.oneFee.noRate':
        'இரு வழியிலும் விகிதம் ஒன்றே. எப்படி அழித்தாலும் — புதுப்பித்தாலும் அல்லது திருப்புவதற்கு முன் செலுத்தினாலும் — இது ஒரே கடன், ஒருமுறை செலுத்தினால் இந்தச் சுழற்சிக்கு தீர்ந்துவிடும்.',
    'lateFee.example.intro': 'உங்கள் திட்டம் 1ஆம் தேதி முடிந்தது, இன்று 4ஆம் தேதி என வைத்துக்கொள்வோம்:',
    'lateFee.example.renew': '· இன்று புதுப்பித்தால் → 2 நாட்கள் (2, 3){amount}',
    'lateFee.example.return': '· இன்று திருப்பினால் → 3 நாட்கள் (2, 3, 4){amount}',
    'lateFee.example.equals': ' = {amount}',

    // --- settlement card --------------------------------------------------
    'settlement.status.pending_refund': 'திரும்பப் பணம் நிலுவையில்',
    'settlement.status.refund_processing': 'திரும்பப் பணம் செயலாக்கத்தில்',
    'settlement.status.refund_completed': 'திரும்பப் பணம் முடிந்தது',
    'settlement.status.no_refund_required': 'திரும்பப் பணம் தேவையில்லை',
    'settlement.status.amount_due': 'கட்டணம் நிலுவை',
    'settlement.status.settlement_completed': 'தீர்வு முடிந்தது',
    'settlement.returnSettlement': 'ஸ்கூட்டர் திருப்பு தீர்வு',
    'settlement.additionalDue': 'கூடுதல் தொகை நிலுவையில் — உங்கள் திருப்பு செயல்முறையை முடிக்க இதைச் செலுத்தவும்.',
    'settlement.processing': 'செயலாக்கத்தில்…',
    'settlement.returnedSuccessfully': 'ஸ்கூட்டர் வெற்றிகரமாகத் திருப்பப்பட்டது',
    'settlement.dismiss': 'மூடு',
    'settlement.securityDeposit': 'பாதுகாப்பு வைப்புத்தொகை',
    'settlement.lateFee': 'தாமத கட்டணம்',
    'settlement.damageFee': 'சேத கட்டணம்',
    'settlement.refundAmount': 'திரும்பப் பணத் தொகை',
    'settlement.checkoutDescription': 'திருப்பு தீர்வு',
    'payment.failed': 'கட்டணம் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',

    // --- late fee payment gate --------------------------------------------
    'lateFeeGate.title': 'தாமத கட்டணம் செலுத்த வேண்டும்',
    'lateFeeGate.planExpired': 'திட்டம் முடிந்தது',
    'lateFeeGate.body':
        'உங்கள் திட்டம் முடிந்துவிட்டது, தாமத கட்டணம் நிலுவையில் உள்ளது. ஸ்கூட்டரைத் திருப்புவதற்கு முன் தாமத கட்டணத்தைச் செலுத்தவும்.',
    'lateFeeGate.rider': 'சவாரி செய்பவர்',
    'lateFeeGate.vehicle': 'வாகனம்',
    'lateFeeGate.planEnded': 'திட்டம் முடிந்தது',
    'lateFeeGate.overdue': 'தாமதம்',
    'lateFeeGate.overdueDays.one': '1 நாள்',
    'lateFeeGate.overdueDays.other': '{count} நாட்கள்',
    'lateFeeGate.lateFee': 'தாமத கட்டணம்',
    'lateFeeGate.amountDue': 'நிலுவைத் தொகை',
    'lateFeeGate.payButton': 'தாமத கட்டணம் செலுத்து — {amount}',
    'lateFeeGate.checkoutDescription': 'திட்டம் முடிந்தது — தாமத கட்டணம்',
    'lateFeeGate.error':
        'உங்கள் தாமத கட்டணம் முடிக்கப்படவில்லை. திருப்பு செயல்முறையைத் தொடர மீண்டும் முயற்சிக்கவும்.',

    // --- KYC wizard -------------------------------------------------------
    'kyc.title': 'அடையாள சரிபார்ப்பு',
    'kyc.loading': 'உங்கள் சரிபார்ப்பை ஏற்றுகிறது...',
    'kyc.loadFailed': 'உங்கள் KYC-ஐ ஏற்ற முடியவில்லை.',
    'kyc.step.photo': 'புகைப்படம்',
    'kyc.step.emergency': 'அவசர தொடர்பு',
    'kyc.step.aadhaar': 'ஆதார்',
    'kyc.step.licence': 'உரிமம்',
    'kyc.step.review': 'மறுஆய்வு',
    'kyc.header.title': 'அடையாள சரிபார்ப்பு',
    'kyc.header.percent': '{percent}% முடிந்தது',
    'kyc.header.rejected': 'ஒரு ஆவணம் நிராகரிக்கப்பட்டது. கீழே சரி செய்து மீண்டும் சமர்ப்பிக்கவும்.',
    'kyc.header.pending': 'உங்கள் ஆவணங்கள் மறுஆய்வு செய்யப்படுகின்றன. இப்போதைக்கு வேறு எதுவும் செய்ய வேண்டாம்.',
    'kyc.verified.title': 'நீங்கள் சரிபார்க்கப்பட்டீர்கள்',
    'kyc.verified.body':
        'உங்கள் ஆவணங்கள் ஏற்கப்பட்டன, உங்கள் ஸ்கூட்டரைத் திறக்கலாம். ஏதேனும் ஆவணம் காலாவதியானால் புதிதாக ஒன்றை பதிவேற்றக் கேட்கப்படும்.',
    'kyc.skipForNow': 'இப்போதைக்குத் தவிர்',
    'kyc.skipConfirm.title': 'இப்போதைக்கு KYC-ஐத் தவிர்க்கவா?',
    'kyc.skipConfirm.message':
        'உங்கள் முன்னேற்றம் சேமிக்கப்பட்டது. முகப்பிலிருந்து எப்போது வேண்டுமானாலும் முடிக்கலாம், ஆனால் KYC முடியும் வரை ஸ்கூட்டரை வாடகைக்கு எடுக்க முடியாது.',
    'kyc.skipConfirm.keepGoing': 'தொடர்கிறேன்',

    'kyc.photo.title': 'சுயவிவரப் புகைப்படம்',
    'kyc.photo.intro': 'உங்கள் புகைப்படத்தை எடுப்பதற்கு முன்:',
    'kyc.photo.tip.faceCamera': 'கேமராவை நேரடியாகப் பாருங்கள்',
    'kyc.photo.tip.lighting': 'நல்ல, சமமான வெளிச்சத்தைப் பயன்படுத்துங்கள்',
    'kyc.photo.tip.noSunglasses': 'கண்ணாடி அல்லது தொப்பியை அகற்றுங்கள்',
    'kyc.photo.tip.plainBackground': 'ஒரு எளிய பின்னணியில் நில்லுங்கள்',
    'kyc.photo.tip.wholeFace': 'உங்கள் முழு முகமும் தெரிவதை உறுதிசெய்யுங்கள்',
    'kyc.photo.onFile': 'புகைப்படம் ஏற்கனவே பதிவில் உள்ளது',
    'kyc.photo.retake': 'மீண்டும் எடு அல்லது வேறொன்றைத் தேர்வுசெய்',
    'kyc.photo.take': 'ஒரு புகைப்படத்தை எடு அல்லது தேர்வுசெய்',
    'kyc.photo.save': 'புகைப்படத்தைச் சேமி',

    'kyc.emergency.title': 'அவசர தொடர்பு',
    'kyc.emergency.body': 'உங்களை சவாரியின் போது தொடர்பு கொள்ள முடியாதபோது மட்டுமே இந்த எண்ணைப் பயன்படுத்துவோம்.',
    'kyc.emergency.name': 'தொடர்பு பெயர்',
    'kyc.emergency.namePlaceholder': 'முழுப் பெயர்',
    'kyc.emergency.phone': 'மாற்று தொலைபேசி எண்',
    'kyc.emergency.phonePlaceholder': 'மாற்று தொலைபேசி எண்',
    'kyc.emergency.saveContinue': 'சேமித்துத் தொடரவும்',
    'kyc.emergency.error.name':
        'தொடர்பு பெயரில் எழுத்துகள், இடைவெளிகள், மேற்கோள் குறிகள் மற்றும் இணைப்புக் கோடுகள் மட்டுமே அனுமதிக்கப்படும்.',
    'kyc.emergency.error.phone': 'சரியான தொலைபேசி எண்ணை உள்ளிடவும், எ.கா. +919876543210.',
    'kyc.emergency.error.save': 'சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',

    'kyc.doc.rejected': 'நிராகரிக்கப்பட்டது',
    'kyc.doc.removeReupload': 'அகற்றி மீண்டும் பதிவேற்று',
    'kyc.doc.aadhaarNumber': 'ஆதார் எண்',
    'kyc.doc.documentNumber': 'ஆவண எண்',
    'kyc.doc.aadhaarPlaceholder': 'எ.கா. 2345 6789 0123',
    'kyc.doc.licencePlaceholder': 'எ.கா. TN0120110012345',
    'kyc.doc.aadhaarHint': 'இன்று கைமுறையாக உள்ளிடவும் — OCR தானியங்கு-நிரப்பல் எதிர்காலப் பதிப்பில் திட்டமிடப்பட்டுள்ளது.',
    'kyc.doc.expiryDate': 'காலாவதி தேதி',
    'kyc.doc.expiryHint': 'காலாவதியான உரிமத்தைச் சரிபார்க்க முடியாது.',
    'kyc.doc.front': 'முன்பக்கம்',
    'kyc.doc.back': 'பின்பக்கம்',
    'kyc.doc.removeSide': '{side}ஐ அகற்று',
    'kyc.doc.addPhotoOrPdf': 'புகைப்படம் அல்லது PDF சேர்க்கவும்',
    'kyc.doc.upload': 'ஆவணத்தைப் பதிவேற்று',
    'kyc.doc.resubmit': 'மீண்டும் சமர்ப்பி',
    'kyc.doc.expiresOn': ' • {date} அன்று காலாவதி',
    'kyc.doc.expired': 'காலாவதியானது — புதியதைப் பதிவேற்றவும்',
    'kyc.doc.preview': 'ஆவணத்தை முன்னோட்டமிடு',
    'kyc.doc.closePreview': 'முன்னோட்டத்தை மூடு',
    'kyc.doc.pdfTitle': 'PDF ஆவணம்',
    'kyc.doc.pdfBody':
        'PDF-களை உள்ளடக்கமாகக் காட்ட முடியாது. கையொப்பமிடப்பட்ட இணைப்பு சில நிமிடங்களில் காலாவதியாகும், உங்கள் சாதனத்தில் ஒருபோதும் சேமிக்கப்படாது.',

    'kyc.review.title': 'மறுஆய்வு & உறுதிமொழி',
    'kyc.review.fullName': 'முழுப் பெயர்',
    'kyc.review.dob': 'பிறந்த தேதி',
    'kyc.review.phone': 'தொலைபேசி',
    'kyc.review.profilePhoto': 'சுயவிவரப் புகைப்படம்',
    'kyc.review.uploaded': 'பதிவேற்றப்பட்டது',
    'kyc.review.notUploaded': 'பதிவேற்றப்படவில்லை',
    'kyc.review.emergencyContact': 'அவசர தொடர்பு',
    'kyc.review.declaration':
        'வழங்கப்பட்ட தகவலும் ஆவணங்களும் உண்மையானவை என்றும் எனக்குச் சொந்தமானவை என்றும் உறுதிமொழி அளிக்கிறேன்.',
    'kyc.review.submit': 'மறுஆய்வுக்குச் சமர்ப்பி',
    'kyc.stillNeeded': 'இன்னும் தேவை: {documents}',
    'kyc.consentGiven': 'அடையாளச் சரிபார்ப்புக்கான சம்மதம் {date} அன்று வழங்கப்பட்டது.',
    'kyc.consentMissing': 'உங்கள் அடையாளத்தைச் சரிபார்க்க இன்னும் உங்கள் சம்மதம் எங்களிடம் இல்லை.',
    'kyc.giveConsent': 'சம்மதம் அளி',

    'kyc.error.docNumber.title': 'ஆவண எண் தேவை',
    'kyc.error.docNumber.message': 'ஆவணத்தில் அச்சிடப்பட்ட எண்ணை உள்ளிடவும்.',
    'kyc.error.front.title': 'முன்பக்கப் படம் தேவை',
    'kyc.error.front.message': 'ஆவணத்தின் முன்பக்கத்தின் புகைப்படம் அல்லது PDF-ஐச் சேர்க்கவும்.',
    'kyc.error.back.title': 'பின்பக்கப் படம் தேவை',
    'kyc.error.back.message': 'ஆவணத்தின் பின்பக்கத்தின் புகைப்படம் அல்லது PDF-ஐச் சேர்க்கவும்.',
    'kyc.error.expiry.title': 'காலாவதி தேதி தேவை',
    'kyc.error.expiry.message': 'ஓட்டுநர் உரிமத்தில் காலாவதி தேதி இருக்க வேண்டும்.',
    'kyc.error.date.title': 'தவறான தேதி',
    'kyc.error.date.message': 'YYYY-MM-DD வடிவத்தைப் பயன்படுத்தவும்.',
    'kyc.error.aadhaar.title': 'தவறான ஆதார் எண்',
    'kyc.error.aadhaar.message': 'உங்கள் 12-இலக்க ஆதார் எண்ணை உள்ளிடவும்.',
    'kyc.error.uploadFailed': 'பதிவேற்றம் தோல்வியடைந்தது',
    'kyc.error.removeFailed': 'அகற்ற முடியவில்லை',
    'kyc.error.previewUnavailable': 'முன்னோட்டம் கிடைக்கவில்லை',
    'kyc.error.submitFailed': 'சமர்ப்பிக்க முடியவில்லை',
    'kyc.error.declare.title': 'உறுதிப்படுத்தல் தேவை',
    'kyc.error.declare.message': 'உங்கள் KYC-ஐச் சமர்ப்பிக்க உங்கள் விவரங்கள் உண்மை என உறுதிப்படுத்தவும்.',
    'kyc.removeConfirm.title': 'ஆவணத்தை அகற்று',
    'kyc.removeConfirm.message': 'உங்கள் {document}ஐ அகற்றவா?',
    'kyc.submitted.title': 'சமர்ப்பிக்கப்பட்டது',
    'kyc.submitted.message': 'உங்கள் ஆவணங்கள் எங்கள் குழுவிடம் உள்ளன. மறுஆய்வு முடிந்ததும் உங்களுக்குத் தெரிவிப்போம்.',

    // --- KYC banner (Home) ------------------------------------------------
    'kycBanner.rejected': 'அனைத்து அம்சங்களையும் திறக்க ஒரு ஆவணத்தைச் சரி செய்ய வேண்டும்',
    'kycBanner.inReview': 'உங்கள் சுயவிவரம் மறுஆய்வில் உள்ளது — உங்களுக்குத் தெரிவிப்போம்',
    'kycBanner.incomplete': 'அனைத்து அம்சங்களையும் திறக்க உங்கள் சுயவிவரத்தை முடிக்கவும்',

    // --- maintenance notice (Home) ----------------------------------------
    'maintenance.inspecting': 'உங்கள் ஸ்கூட்டர் பரிசோதிக்கப்படுகிறது. விரைவில் உங்களுக்குத் தெரிவிப்போம்.',
    'maintenance.beingRepaired': 'உங்கள் ஸ்கூட்டர் பழுதுபார்க்கப்படுகிறது',
    'maintenance.expectedReady': '{time} அளவில் தயாராகும்.',
    'maintenance.inMaintenance': 'உங்கள் ஸ்கூட்டர் பராமரிப்பில் உள்ளது',
    'maintenance.useTempVehicle': 'தயாராகும் வரை இந்த தற்காலிக வாகனத்தைப் பயன்படுத்தவும்.',

    // --- Home hero card ---------------------------------------------------
    'hero.kycRequired.heading': 'உங்கள் முதல் சவாரிக்கு ஒரு படி',
    'hero.kycRequired.body': 'வரம்பற்ற கி.மீ EV ஸ்கூட்டர் வாடகையைத் திறக்க உங்கள் KYC-ஐ முடிக்கவும்.',
    'hero.kycRequired.cta': 'KYC-ஐ முடி',
    'hero.kycInReview.heading': 'கிட்டத்தட்ட முடிந்துவிட்டது',
    'hero.kycInReview.body': 'உங்கள் KYC மறுஆய்வில் உள்ளது. அது ஏற்கப்பட்டவுடன் வாடகை திறக்கப்படும்.',
    'hero.kycInReview.cta': 'KYC மறுஆய்வில்',
    'hero.readyToBook.heading': 'பசுமையாகச் செல்லுங்கள். வரம்பின்றிச் செல்லுங்கள்.',
    'hero.readyToBook.body': 'உங்கள் EV ஸ்கூட்டரில் வரம்பற்ற கிலோமீட்டர்கள், ஒரே எளிய வார திட்டம்.',
    'hero.readyToBook.cta': 'ஒரு ஸ்கூட்டரை முன்பதிவு செய்',
    'hero.rentalCompleted.heading': 'அடுத்த சவாரிக்குத் தயாரா?',
    'hero.rentalCompleted.body': 'ஒரு திட்டத்தைத் தேர்ந்தெடுத்து, சில நிமிடங்களில் மீண்டும் EV ஸ்கூட்டரில் ஏறுங்கள்.',
    'hero.rentalCompleted.cta': 'ஒரு ஸ்கூட்டரை முன்பதிவு செய்',

    // --- Home quick links -------------------------------------------------
    'quickLinks.nearbyScooters': 'அருகிலுள்ள ஸ்கூட்டர்கள்',
    'quickLinks.myBookings': 'என் முன்பதிவுகள்',
    'quickLinks.myPlan': 'என் திட்டம்',
    'quickLinks.lockedHint': 'உங்கள் திருப்பு முடியும் வரை இது கிடைக்காது',

    // --- home -------------------------------------------------------------
    'home.title': 'முகப்பு',
    'home.paymentPending': 'கட்டணம் நிலுவையில்',
    'home.pickupScheduled': 'பிக்கப் திட்டமிடப்பட்டது',
    'home.yourScooter': 'உங்கள் ஸ்கூட்டர்',
    'home.notConfirmed': 'இந்த முன்பதிவு இன்னும் உறுதிசெய்யப்படவில்லை — அதைப் பாதுகாக்க கட்டணத்தை முடிக்கவும்.',
    'home.heldFor': '{duration} வைக்கப்பட்டுள்ளது.',
    'home.reserved': 'உங்கள் ஸ்கூட்டர் ஒதுக்கப்பட்டுள்ளது — பிக்கப்பில் ஊழியர் அதை ஒப்படைப்பார்கள்.',
    'home.willNotify': 'முந்தைய நாள் உங்களுக்குத் தெரிவிப்போம் — பிக்கப்பில் ஊழியர் உங்கள் ஸ்கூட்டரை ஒதுக்குவார்கள்.',
    'home.completePayment': 'கட்டணத்தை முடி',
    'home.getDirections': 'பிக்கப்புக்கு வழி காட்டு',
    'home.readyToRide': 'சவாரி செய்யத் தயாரா?',
    'home.error.maps.title': 'வரைபடத்தைத் திறக்க முடியவில்லை',
    'home.error.maps.message': 'இந்தச் சாதனத்தில் வரைபட செயலி எதுவும் கிடைக்கவில்லை.',
    'home.duration.minutes': '{minutes} நிமிடம்',
    'home.duration.hoursMinutes': '{hours} மணி {minutes} நிமிடம்',

    // --- support ----------------------------------------------------------
    'support.title': 'ஆதரவு',
    'support.heading': 'நாங்கள் எப்படி உதவலாம்?',
    'support.subheading': 'எங்கள் ஆதரவுக் குழுவை நேரடியாகத் தொடர்பு கொள்ளுங்கள், அல்லது கீழே ஒரு செய்தி அனுப்புங்கள்.',
    'support.callSupport': 'ஆதரவை அழை',
    'support.emailUs': 'எங்களுக்கு மின்னஞ்சல் அனுப்பு',
    'support.sendMessage': 'எங்களுக்கு ஒரு செய்தி அனுப்புங்கள்',
    'support.subject': 'தலைப்பு',
    'support.subjectPlaceholder': 'இது எதைப் பற்றியது?',
    'support.description': 'விவரம்',
    'support.descriptionPlaceholder': 'என்ன நடக்கிறது என்று சொல்லுங்கள்...',
    'support.submitRequest': 'கோரிக்கையைச் சமர்ப்பி',
    'support.submitted': 'கோரிக்கை சமர்ப்பிக்கப்பட்டது',
    'support.submittedHelp': 'விரைவில் உங்களைத் தொடர்பு கொள்வோம் — கீழே அதன் நிலையைக் கண்காணிக்கலாம்.',
    'support.sendAnother': 'மற்றொன்றை அனுப்பு',
    'support.yourRequests': 'உங்கள் கோரிக்கைகள்',
    'support.noRequests': 'நீங்கள் இதுவரை எந்தக் கோரிக்கையும் சமர்ப்பிக்கவில்லை.',
    'support.error.subject': 'உங்கள் கோரிக்கைக்கு ஒரு சிறு தலைப்பு கொடுங்கள்.',
    'support.error.description': 'மேலும் கொஞ்சம் சொல்லுங்கள் — குறைந்தது 10 எழுத்துகள்.',
    'support.error.submitFailed': 'உங்கள் கோரிக்கையைச் சமர்ப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'support.error.cannotOpen.title': 'அதைச் செய்ய முடியாது',
    'support.error.cannotOpen.message': 'இந்தச் சாதனத்தில் அந்தச் செயலைக் கையாள எந்தச் செயலியும் இல்லை.',
    'support.needHelp': 'உதவி தேவையா?',
    'support.available247': 'நாங்கள் 24/7 உங்களுக்கு உதவ இங்கே இருக்கிறோம்.',
    'support.getSupport': 'ஆதரவைப் பெறு',
    'support.contactSupport': 'ஆதரவைத் தொடர்பு கொள்',

    // --- notifications ----------------------------------------------------
    'notifications.title': 'அறிவிப்புகள்',
    'notifications.unreadCount': '{count} படிக்காதவை',
    'notifications.markAllRead': 'அனைத்தையும் படித்ததாகக் குறி',
    'notifications.empty.title': 'இன்னும் அறிவிப்புகள் இல்லை',
    'notifications.empty.subtitle': 'உங்கள் கவனம் தேவைப்படும்போது உங்களுக்குத் தெரிவிப்போம்.',
    'notifications.fallbackTitle': 'அறிவிப்பு',

    // --- booking history --------------------------------------------------
    'bookingHistory.title': 'முன்பதிவு வரலாறு',
    'bookingHistory.empty.title': 'இன்னும் முன்பதிவுகள் இல்லை',
    'bookingHistory.empty.subtitle': 'உங்கள் முன்பதிவு வரலாறு இங்கே தோன்றும்.',
    'bookingHistory.loadFailed': 'உங்கள் முன்பதிவு வரலாற்றை ஏற்ற முடியவில்லை.',
    'bookingHistory.scooterFallback': 'ஸ்கூட்டர்',
    'bookingHistory.cancelledOn': '{date} அன்று ரத்து செய்யப்பட்டது',
    'bookingHistory.refundLine': 'ரத்துக் கட்டணம் {fee} · திரும்பப் பணம் {refund}',
    'bookingHistory.cancelBooking': 'முன்பதிவை ரத்து செய்',
    'bookingHistory.cancelling': 'ரத்து செய்கிறது…',

    // --- browse vehicles --------------------------------------------------
    'vehicles.title': 'கிடைக்கும் வாகனங்கள்',
    'vehicles.searchPlaceholder': 'ஸ்கூட்டர்களைத் தேடு',
    'vehicles.category.all': 'அனைத்தும்',
    'vehicles.category.scooter': 'ஸ்கூட்டர்',
    'vehicles.category.bike': 'பைக்',
    'vehicles.category.moped': 'மோப்பட்',
    'vehicles.empty.title': 'ஸ்கூட்டர்கள் எதுவும் கிடைக்கவில்லை',
    'vehicles.empty.subtitle': 'வேறு தேடல் அல்லது வகையை முயற்சிக்கவும்.',
    'vehicles.availableScooters': 'கிடைக்கும் ஸ்கூட்டர்கள்',

    // --- status display labels --------------------------------------------
    'status.billingCycle.daily': 'நாள்',
    'status.billingCycle.weekly': 'வாரம்',
    'status.billingCycle.monthly': 'மாதம்',
    'status.billingCycle.yearly': 'ஆண்டு',

    'status.kyc.not_submitted': 'சமர்ப்பிக்கப்படவில்லை',
    'status.kyc.pending': 'நிலுவையில்',
    'status.kyc.partially_verified': 'பகுதி சரிபார்க்கப்பட்டது',
    'status.kyc.verified': 'சரிபார்க்கப்பட்டது',
    'status.kyc.rejected': 'நிராகரிக்கப்பட்டது',

    'status.docType.aadhaar': 'ஆதார்',
    'status.docType.driving_licence': 'ஓட்டுநர் உரிமம்',
    'status.docType.passport': 'பாஸ்போர்ட்',
    'status.docType.voter_id': 'வாக்காளர் அடையாள அட்டை',
    'status.docType.address_proof': 'முகவரிச் சான்று',

    'status.booking.pending_payment': 'கட்டணம் நிலுவையில்',
    'status.booking.confirmed': 'உறுதிசெய்யப்பட்டது',
    'status.booking.fulfilled': 'பெறப்பட்டது',
    'status.booking.completed': 'முடிந்தது',
    'status.booking.cancelled': 'ரத்து செய்யப்பட்டது',
    'status.booking.expired': 'காலாவதியானது',

    'status.rental.active': 'செயலில்',
    'status.rental.completed': 'முடிந்தது',
    'status.rental.force_ended': 'கட்டாயமாக முடிக்கப்பட்டது',

    'status.maintenance.reported': 'புகாரளிக்கப்பட்டது',
    'status.maintenance.triaged': 'மதிப்பீடு செய்யப்பட்டது',
    'status.maintenance.in_progress': 'செயலில் உள்ளது',
    'status.maintenance.resolved': 'தீர்க்கப்பட்டது',
    'status.maintenance.cancelled': 'ரத்து செய்யப்பட்டது',

    'status.support.open': 'திறந்துள்ளது',
    'status.support.in_progress': 'செயலில் உள்ளது',
    'status.support.resolved': 'தீர்க்கப்பட்டது',
    'status.support.closed': 'மூடப்பட்டது',

    'status.refund.pending': 'ஒப்புதலுக்குக் காத்திருக்கிறது',
    'status.refund.processing': 'திரும்பப் பணம் தொடங்கப்பட்டது',
    'status.refund.processed': 'திரும்பப் பணம் அளிக்கப்பட்டது',
    'status.refund.not_required': 'திரும்பப் பணம் தேவையில்லை',
    'status.refund.failed': 'திரும்பப் பணம் தோல்வியடைந்தது',

    'status.deposit.pending': 'நிலுவையில்',
    'status.deposit.held': 'வைக்கப்பட்டுள்ளது',
    'status.deposit.released': 'விடுவிக்கப்பட்டது',
    'status.deposit.forfeited': 'இழக்கப்பட்டது',

    'status.vehicle.available': 'கிடைக்கிறது',
    'status.vehicle.reserved': 'ஒதுக்கப்பட்டது',
    'status.vehicle.assigned': 'ஒதுக்கப்பட்டது',
    'status.vehicle.maintenance': 'பராமரிப்பில்',
    'status.vehicle.retired': 'நீக்கப்பட்டது',

    // --- profile ----------------------------------------------------------
    'profile.profile': 'சுயவிவரம்',
    'profile.rider': 'சவாரி செய்பவர்',
    'profile.changePhoto': 'புகைப்படத்தை மாற்று',
    'profile.changePhotoA11y': 'சுயவிவரப் புகைப்படத்தை மாற்று',
    'profile.uploading': 'பதிவேற்றுகிறது...',
    'profile.uploadFailed': 'பதிவேற்றம் தோல்வியடைந்தது',
    'profile.assignedScooter': 'ஒதுக்கப்பட்ட ஸ்கூட்டர்',
    'profile.currentPlan': 'தற்போதைய திட்டம்',
    'profile.kycStatus': 'KYC நிலை',
    'profile.verifyPrompt': 'ஒரு ஸ்கூட்டரைத் திறக்க உங்கள் அடையாளத்தைச் சரிபார்க்கவும்',
    'profile.viewFullProfile': 'முழு சுயவிவரத்தையும் பார்க்க',
    'profile.menu.kyc': 'KYC சரிபார்ப்பு',
    'profile.menu.support': 'ஆதரவு',
    'profile.menu.privacy': 'தனியுரிமை & தரவு',
    'profile.menu.terms': 'விதிமுறைகள் & நிபந்தனைகள்',
    'profile.menu.howItWorks': 'ஸ்வாப்ங்கோ எப்படி இயங்குகிறது',

    // --- profile setup (first-run) -----------------------------------------
    'profileSetup.title': 'உங்கள் சுயவிவரத்தை முடித்து சவாரிக்குத் தயாராகுங்கள்.',
    'profileSetup.subtitle':
        'உங்கள் கணக்கைச் சரியாக அமைக்க சில விவரங்கள். இவற்றை நீங்கள் பின்னர் எப்போது வேண்டுமானாலும் புதுப்பிக்கலாம்.',
    'profileSetup.fullName': 'முழுப் பெயர்',
    'profileSetup.fullNamePlaceholder': 'முழுப் பெயர்',
    'profileSetup.email': 'மின்னஞ்சல்',
    'profileSetup.emailPlaceholder': 'மின்னஞ்சல்',
    'profileSetup.phone': 'தொலைபேசி',
    'profileSetup.phonePlaceholder': 'தொலைபேசி',
    'profileSetup.phoneHint': 'இந்திய எண்களை +91 இல்லாமல் தட்டச்சு செய்யலாம்.',
    'profileSetup.dob': 'பிறந்த தேதி',
    'profileSetup.dobHint': 'சவாரி செய்ய குறைந்தது 18 வயது இருக்க வேண்டும்.',
    'profileSetup.gender': 'பாலினம்',
    'profileSetup.gender.male': 'ஆண்',
    'profileSetup.gender.female': 'பெண்',
    'profileSetup.gender.other': 'மற்றவை',
    'profileSetup.gender.preferNotToSay': 'சொல்ல விரும்பவில்லை',
    'profileSetup.address': 'முகவரி',
    'profileSetup.addressPlaceholder': 'முகவரி',
    'profileSetup.city': 'நகரம்',
    'profileSetup.cityPlaceholder': 'நகரம்',
    'profileSetup.state': 'மாநிலம்',
    'profileSetup.statePlaceholder': 'மாநிலத்தைத் தேர்ந்தெடுக்கவும்',
    'profileSetup.postalCode': 'அஞ்சல் குறியீடு',
    'profileSetup.postalCodePlaceholder': 'அஞ்சல் குறியீடு',
    'profileSetup.error.fullName': 'உங்கள் முழுப் பெயரை உள்ளிடவும்.',
    'profileSetup.error.fullNameChars':
        'முழுப் பெயரில் எழுத்துகள், இடைவெளிகள், மேற்கோள் குறிகள் மற்றும் இணைப்புக் கோடுகள் மட்டுமே அனுமதிக்கப்படும்.',
    'profileSetup.error.email': 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
    'profileSetup.error.phone': 'சரியான தொலைபேசி எண்ணை உள்ளிடவும், எ.கா. 98765 43210.',
    'profileSetup.error.gender': 'ஒரு பாலினத்தைத் தேர்ந்தெடுக்கவும்.',
    'profileSetup.error.address': 'உங்கள் முழு முகவரியையும் நிரப்பவும்.',
    'profileSetup.error.dob': 'YYYY-MM-DD வடிவத்தைப் பயன்படுத்தவும்; குறைந்தது 18 வயது இருக்க வேண்டும்.',
    'profileSetup.error.save': 'உங்கள் சுயவிவரத்தைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',

    // --- return scooter modal ----------------------------------------------
    'returnReason.plan_ended': 'என் திட்டம் முடிந்தது',
    'returnReason.switching_plan': 'திட்டத்தை மாற்றுகிறேன்',
    'returnReason.scooter_issue': 'ஸ்கூட்டரில் பிரச்சினை',
    'returnReason.moving_away': 'இடம் மாறுகிறேன்',
    'returnReason.too_expensive': 'மிக அதிக விலை',
    'returnReason.other': 'வேறு காரணம்',
    'returnModal.title': 'ஸ்கூட்டரைத் திருப்பு',
    'returnModal.reasonLabel': 'ஏன் திருப்புகிறீர்கள்?',
    'returnModal.feedbackLabel': 'நாங்கள் அறிய வேண்டியது ஏதேனும் உள்ளதா?',
    'returnModal.feedbackPlaceholder': 'சவாரி எப்படி இருந்தது என்று சொல்லுங்கள்',
    'returnModal.ratingLabel': 'உங்கள் சவாரியை மதிப்பிடுங்கள்',
    'returnModal.policyNote':
        'உங்கள் கோரிக்கை எங்கள் திருப்புக் கொள்கையின்படி செயலாக்கப்படும். எங்கள் குழு நிலையத்தில் உண்மையான ஒப்படைப்பை உறுதிப்படுத்தும் வரை வாடகை செயலிலேயே இருக்கும் — ஸ்கூட்டர் உங்களுடையதாகவே இருக்கும். இப்போது எதுவும் வசூலிக்கப்படாது; கட்டணச் சேகரிப்பு பின்னர் ஒரு புதுப்பிப்பில் தொடங்கும். இதன் பிறகு இதை மாற்ற வேண்டுமா? ஆதரவைத் தொடர்பு கொள்ளுங்கள்.',
    'returnModal.submit': 'திருப்பைக் கோரு',
    'returnModal.error.reason': 'ஒரு காரணத்தைத் தேர்ந்தெடுக்கவும்.',
    'returnModal.error.rating': 'உங்கள் சவாரியை மதிப்பிடுங்கள்.',
    'returnModal.error.feedback': 'மேலும் கொஞ்சம் சொல்லுங்கள்.',

    // --- nominee screen ------------------------------------------------------
    'nominee.saved.title': 'வாரிசுதாரர் சேமிக்கப்பட்டார்',
    'nominee.form.name': 'அவர்களின் பெயர்',
    'nominee.form.namePlaceholder': 'முழுப் பெயர்',
    'nominee.form.relationship': 'உங்களுடனான அவர்களின் உறவு',
    'nominee.form.relationshipPlaceholder': 'உறவு',
    'nominee.form.phone': 'அவர்களின் தொலைபேசி எண்',
    'nominee.form.phonePlaceholder': 'தொலைபேசி எண்',
    'nominee.form.email': 'அவர்களின் மின்னஞ்சல் (விருப்பம்)',
    'nominee.form.emailPlaceholder': 'மின்னஞ்சல்',
    'nominee.remove': 'என் வாரிசுதாரரை அகற்று',
    'nominee.removeConfirm.title': 'உங்கள் வாரிசுதாரரை அகற்றவா?',
    'nominee.removeConfirm.message':
        'நீங்கள் வேறு ஒருவரை நியமிக்கும் வரை உங்கள் சார்பாக யாரும் செயல்பட முடியாது.',
    'nominee.removed.title': 'வாரிசுதாரர் அகற்றப்பட்டார்',
    'nominee.error.load': 'உங்கள் வாரிசுதாரரை ஏற்ற முடியவில்லை.',
    'nominee.error.save': 'சேமிக்க முடியவில்லை',
    'nominee.error.remove': 'அகற்ற முடியவில்லை',

    // --- privacy request detail --------------------------------------------
    'requestDetail.loadFailed': 'அந்தக் கோரிக்கையை ஏற்ற முடியவில்லை.',
    'requestDetail.cancelConfirm.message': 'இந்தக் கோரிக்கையில் நாங்கள் தொடர்ந்து பணியாற்ற மாட்டோம்.',
    'requestDetail.error.cancel': 'ரத்து செய்ய முடியவில்லை',
    'requestDetail.status': 'நிலை',
    'requestDetail.raised': 'எழுப்பப்பட்டது',
    'requestDetail.respondBy': 'நாங்கள் பதிலளிக்கும் தேதி',
    'requestDetail.closed': 'மூடப்பட்டது',
    'requestDetail.cancelUntil': 'இந்தத் தேதி வரை நீங்கள் ரத்து செய்யலாம்',
    'requestDetail.whatYouToldUs': 'நீங்கள் எங்களிடம் சொன்னது',
    'requestDetail.whatYouAskedUsToCorrect': 'நீங்கள் திருத்தச் சொன்னது',
    'requestDetail.ourResponse': 'எங்கள் பதில்',
    'requestDetail.whyNot': 'ஏன் இதைச் செய்ய முடியவில்லை',

    'privacy.loadFailed': 'உங்கள் தனியுரிமை அமைப்புகளை ஏற்ற முடியவில்லை.',
    'privacySummary.loadFailed': 'உங்கள் தரவு சுருக்கத்தை ஏற்ற முடியவில்லை.',
    'notice.loadFailed': 'தனியுரிமை அறிவிப்பை ஏற்ற முடியவில்லை.',

    // --- privacy rights requests screen -------------------------------------
    'correctable.full_name': 'என் பெயர்',
    'correctable.date_of_birth': 'என் பிறந்த தேதி',
    'correctable.aadhaar_details': 'என் ஆதார் விவரங்கள்',
    'correctable.driving_licence_details': 'என் உரிம விவரங்கள்',
    'correctable.other': 'வேறு ஏதோ',
    'requestsScreen.whatIsWrong': 'என்ன தவறு?',
    'requestsScreen.whatShouldItBe': 'அது என்னவாக இருக்க வேண்டும்?',
    'requestsScreen.correctPlaceholder': 'சரியான விவரம்',
    'requestsScreen.error.sendFailed': 'உங்கள் கோரிக்கையை அனுப்ப முடியவில்லை',
    'requestsScreen.received.title': 'கோரிக்கை பெறப்பட்டது',

    // --- booking screen ------------------------------------------------------
    'booking.trust.securePayment': 'பாதுகாப்பான கட்டணம்',
    'booking.trust.instantRefunds': 'உடனடி திரும்பப் பணம்',
    'booking.trust.razorpay': 'Razorpay',
    'booking.paymentMethods.title': 'கட்டண முறை',
    'booking.paymentMethods.upi': 'UPI',
    'booking.paymentMethods.upiSubtitle': 'GPay · PhonePe · Paytm',
    'booking.paymentMethods.cards': 'அட்டைகள்',
    'booking.paymentMethods.cardsSubtitle': 'Visa · Mastercard · RuPay',
    'booking.paymentMethods.netBanking': 'நெட் பேங்கிங்',
    'booking.paymentMethods.netBankingSubtitle': 'அனைத்து முக்கிய வங்கிகளும்',
    'booking.paymentMethods.wallets': 'வாலட்கள்',
    'booking.paymentMethods.walletsSubtitle': 'Paytm · PhonePe · Mobikwik',
    'booking.paymentMethods.chooseOnRazorpay': 'பாதுகாப்பான Razorpay திரையில் தேர்ந்தெடுக்கவும்',
    'booking.error.loadModel': 'இந்த ஸ்கூட்டரை ஏற்ற முடியவில்லை.',
    'booking.error.modelNotFound': 'இந்த ஸ்கூட்டரைக் கண்டுபிடிக்க முடியவில்லை.',
    'booking.blocked.findingStation': 'உங்களுக்கு அருகில் ஒரு பிக்கப் நிலையத்தைக் கண்டறிகிறது…',
    'booking.blocked.noneAvailable': 'இப்போது இந்த நிலையத்தில் ஸ்கூட்டர்கள் எதுவும் இல்லை',
    'booking.blocked.noPlans': 'இந்த ஸ்கூட்டருக்கு விற்பனையில் திட்டங்கள் இல்லை',
    'booking.blocked.choosePlan': 'ஒரு வாடகைத் திட்டத்தைத் தேர்ந்தெடுக்கவும்',
    'booking.error.maps.title': 'வரைபடத்தைத் திறக்க முடியவில்லை',
    'booking.error.maps.message': 'இந்தச் சாதனத்தில் வரைபட செயலி எதுவும் கிடைக்கவில்லை.',
    'booking.almostThere': 'கிட்டத்தட்ட முடிந்தது',
    'booking.error.paymentCancelled': 'கட்டணம் ரத்து செய்யப்பட்டது. மீண்டும் முயற்சிக்க பணம் செலுத்து என்பதைத் தட்டவும்.',
    'booking.error.generic': 'ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
    'booking.checkoutDescription': '{plan} — வாடகை + வைப்புத்தொகை',
    'booking.checkoutDescriptionFallback': 'ஸ்கூட்டர் வாடகை',
    'booking.confirmed.title': 'முன்பதிவு உறுதிசெய்யப்பட்டது',
    'booking.confirmed.body':
        'கட்டணம் வெற்றி. உங்கள் திட்டம் இப்போதே தொடங்குகிறது — உங்கள் {scooter}ஐ பெற உடனடியாக {station}க்குச் செல்லுங்கள்.',
    'booking.confirmed.yourPickupStation': 'உங்கள் பிக்கப் நிலையம்',
    'booking.confirmed.yourScooter': 'ஸ்கூட்டர்',
    'booking.confirmed.done': 'முடிந்தது',
    'booking.confirmAndPay': 'உறுதிசெய்து பணம் செலுத்து',
    'booking.bookScooter': '{scooter}ஐ முன்பதிவு செய்',
    'booking.pickupLocation': 'பிக்கப் இடம்',
    'booking.getDirections': 'வழி காட்டு',
    'booking.checkingAvailability': 'கிடைப்பதைச் சரிபார்க்கிறது…',
    'booking.availableHere': 'இங்கே {count} கிடைக்கிறது',
    'booking.unavailable': 'கிடைக்கவில்லை',
    'booking.available': 'கிடைக்கிறது',
    'booking.startsNow.title': 'உங்கள் திட்டம் இப்போதே தொடங்குகிறது',
    'booking.startsNow.body':
        'நீங்கள் பணம் செலுத்திய பிறகு, நேரடியாக பிக்கப் நிலையத்திற்குச் சென்று இன்றே உங்கள் ஸ்கூட்டரைப் பெறுங்கள். பிக்கப் காலை 8 – இரவு 8.',
    'booking.choosePlan': 'ஒரு திட்டத்தைத் தேர்ந்தெடுக்கவும்',
    'booking.choosePlanHint': 'ஸ்கூட்டர் எவ்வளவு காலத்திற்கு வேண்டும் என்பதைத் தேர்ந்தெடுக்கவும்.',
    'booking.noPlansHint': 'இந்த ஸ்கூட்டருக்கு இன்னும் திட்டங்கள் விற்பனையில் இல்லை.',
    'booking.minutesIncluded': '{minutes} நிமிடங்கள் சேர்க்கப்பட்டுள்ளன',
    'booking.dealApplied': 'சலுகை பயன்படுத்தப்பட்டது',
    'booking.youSave': 'இந்த முன்பதிவில் {amount} சேமிக்கிறீர்கள்',
    'booking.paymentSummary': 'கட்டணச் சுருக்கம்',
    'booking.startsToday': 'இன்று',
    'booking.startsOn': '{date} அன்று தொடங்குகிறது',
    'booking.rentalPlanAmount': 'வாடகைத் திட்டத் தொகை',
    'booking.securityDepositRefundable': 'பாதுகாப்பு வைப்புத்தொகை (திரும்பத் தரக்கூடியது)',
    'booking.totalPayable': 'மொத்தம் செலுத்த வேண்டியது',
    'booking.estimatedTotal': 'மதிப்பிடப்பட்ட மொத்தம்',
    'booking.confirmedOnPaymentScreen': 'கட்டணத் திரையில் உறுதிசெய்யப்படும்',
    'booking.cancellationNote':
        'முன்பதிவு செய்த {minutes} நிமிடங்களுக்குள் ரத்து செய்தால் திட்டத் தொகையில் {percent}% பிடித்து வைக்கப்படும்; காத்திருக்கும் நேரம் அதிகரிக்க கட்டணமும் அதிகரிக்கும். உங்கள் பாதுகாப்பு வைப்புத்தொகை எப்போதும் முழுவதுமாகத் திரும்பத் தரப்படும்.',
    'booking.amount': 'தொகை',
    'booking.processing': 'செயலாக்கத்தில்…',
    'booking.continue': 'தொடரவும்',

    // --- battery stations map --------------------------------------------
    'stations.goBack': 'திரும்பிச் செல்',
    'stations.error.load': 'பேட்டரி நிலையங்களை ஏற்ற முடியவில்லை.',
    'stations.dismissLocationNotice': 'இருப்பிட அனுமதி அறிவிப்பை மூடு',
    'stations.locationOff':
        'இருப்பிடம் அணைந்துள்ளது — நிலையங்கள் தோன்றும், ஆனால் தூரங்கள் தோன்றாது. அனுமதிக்க இருப்பிடப் பொத்தானைத் தட்டவும்.',
    'stations.nearest': 'அருகிலுள்ள நிலையம் {name}, {distance} தொலைவில்',
    'stations.nearestLine': 'அருகிலுள்ள நிலையம்: {name} — {distance}',
    'stations.refresh': 'நிலையங்களைப் புதுப்பி',
    'stations.zoomIn': 'பெரிதாக்கு',
    'stations.zoomOut': 'சிறிதாக்கு',
    'stations.empty.title': 'இன்னும் பேட்டரி நிலையங்கள் இல்லை',
    'stations.empty.subtitle': 'உங்கள் நிர்வாகி அவற்றை வெளியிட்ட பிறகு புதுப்பிப்புப் பொத்தானை இழுக்கவும்.',
    'stations.loading': 'பேட்டரி நிலையங்களை ஏற்றுகிறது…',
    'stations.error.noNavApp.title': 'வழிசெலுத்தல் செயலி எதுவும் கிடைக்கவில்லை',
    'stations.error.noNavApp.message': 'ஒரு வரைபடச் செயலியை நிறுவவும், அல்லது ஆயத்தொலைவுகளைப் பயன்படுத்தவும்: {coordinates}',
    'stations.coordinatesCopied': 'ஆயத்தொலைவுகள் நகலெடுக்கப்பட்டன',
    'stations.error.copyFailed': 'நகலெடுக்க முடியவில்லை',

    // --- battery station details -------------------------------------------
    'stationDetail.goBack': 'திரும்பிச் செல்',
    'stationDetail.serialNumber': 'தொடர் எண்',
    'stationDetail.qisIds': 'QIS ஐடி(கள்)',
    'stationDetail.latitude': 'அட்சரேகை',
    'stationDetail.longitude': 'தீர்க்கரேகை',
    'stationDetail.navigate': 'நிலையத்திற்கு வழிசெலுத்து',
    'stationDetail.copyCoordinates': 'ஆயத்தொலைவுகளை நகலெடு',
    'stationDetail.title': 'நிலைய விவரங்கள்',
    'stationDetail.error.loadFailed': 'இந்த நிலையம் இனி கிடைக்கவில்லை.',
    'stationDetail.batteries': '{count} பேட்டரிகள்',
    'stationDetail.coordinatesLabel': 'ஆயத்தொலைவுகள்',
    'stationDetail.navigateTo': '{station} க்கு வழிசெலுத்து',
    'stationDetail.error.noNavApp.title': 'வழிசெலுத்தல் செயலி எதுவும் கிடைக்கவில்லை',
    'stationDetail.error.noNavApp.message': 'ஆயத்தொலைவுகளை நகலெடுத்து ஒரு வரைபடச் செயலியில் திறக்கவும்.',
    'stationDetail.error.copyFailed': 'நகலெடுக்க முடியவில்லை',
    'stationDetail.copied': '{label} நகலெடுக்கப்பட்டது',

    'status.station.working': 'இயங்குகிறது',
    'status.station.not_working': 'இயங்கவில்லை',
    'status.station.maintenance': 'பராமரிப்பில்',
    'status.station.a11yLabel': 'நிலை: {status}',

    // --- station search -----------------------------------------------------
    'stationSearch.backToSearch': 'தேடலுக்குத் திரும்பு',
    'stationSearch.placeholder': 'நிலையம், QIS ஐடி அல்லது பகுதியைத் தேடு',
    'stationSearch.a11yLabel': 'பேட்டரி நிலையங்கள் அல்லது ஒரு பகுதியைத் தேடு',
    'stationSearch.clearSearch': 'தேடலை அழி',
    'stationSearch.stationsNear': '{area} அருகிலுள்ள நிலையங்கள்',
    'stationSearch.noneNear': '{area} அருகில் நிலையங்கள் எதுவும் இல்லை.',
    'stationSearch.stationsHeading': 'நிலையங்கள்',
    'stationSearch.areasHeading': 'பகுதிகள்',
    'stationSearch.showNear': '{area} அருகிலுள்ள நிலையங்களைக் காட்டு',
    'stationSearch.noMatches': '"{query}"க்கு எதுவும் பொருந்தவில்லை.',
    'stationSearch.rowA11y': '{station}, {status}, {trailing}',

    // --- map control buttons -------------------------------------------------
    'mapControl.enableLocation': 'இருப்பிட அணுகலை இயக்கு',
    'mapControl.centreOnMe': 'என் இருப்பிடத்தில் வரைபடத்தை மையப்படுத்து',
    'mapControl.fitAll': 'அனைத்து நிலையங்களையும் திரையில் பொருத்து',
    'mapControl.notConfigured.title': 'வரைபடம் கட்டமைக்கப்படவில்லை',
    'mapControl.notConfigured.detail':
        'apps/mobile/.env-இல் EXPO_PUBLIC_MAP_STYLE_URL-ஐச் சேர்த்து (.env.example பார்க்கவும்) -c உடன் Metro-வை மறுதொடக்கம் செய்யவும்.',
    'mapControl.searchStillWorks': 'தேடலும் நிலைய விவரங்களும் இன்னும் வேலை செய்கின்றன.',
    'mapControl.unavailable.title': 'வரைபடம் கிடைக்கவில்லை',
    'mapControl.unavailable.detail':
        'இந்த பதிப்பில் MapLibre நேட்டிவ் மாட்யூல் இல்லை. டெவலப்மென்ட் கிளையண்டை மீண்டும் உருவாக்கவும் (docs/battery-stations.md §1.4 பார்க்கவும்).',
    'mapControl.yourLocation': 'உங்கள் இருப்பிடம்',

    // --- station details bottom sheet ---------------------------------------
    'stationSheet.stationNumber': 'நிலையம் #{number}',
    'stationSheet.awayFrom': ' · {distance} தொலைவில்',
    'stationSheet.close': 'நிலைய விவரங்களை மூடு',
    'stationSheet.qisIds': 'QIS ஐடி(கள்)',
    'stationSheet.latitude': 'அட்சரேகை',
    'stationSheet.longitude': 'தீர்க்கரேகை',
    'stationSheet.navigate': 'வழிசெலுத்து',
    'stationSheet.navigateTo': '{station} க்கு வழிசெலுத்து',
    'stationSheet.copyCoordinates': 'ஆயத்தொலைவுகளை நகலெடு',
    'stationSheet.openFullDetails': 'முழு நிலைய விவரங்களைத் திற',
    'stationSheet.batteries': '{count} பேட்டரிகள்',

    'status.paymentState.paid': 'செலுத்தப்பட்டது',
    'status.paymentState.partial': 'ஓரளவு செலுத்தப்பட்டது',
    'status.paymentState.overdue': 'நிலுவை',
    'status.paymentState.unpaid': 'நிலுவை',

    'status.paymentMethod.upi': 'UPI',
    'status.paymentMethod.card': 'அட்டை',
    'status.paymentMethod.netbanking': 'நெட் பேங்கிங்',
    'status.paymentMethod.wallet': 'வாலட்',
    'status.paymentMethod.cash': 'பணம்',

    'status.planStatus.active': 'செயலில்',
    'status.planStatus.past_due': 'கடந்த நிலுவை',
    'status.planStatus.paused': 'இடைநிறுத்தப்பட்டது',

    // --- billing screen ------------------------------------------------------
    'billing.title': 'கட்டணம்',
    'billing.purpose.initial': 'திட்டம் & வைப்புத்தொகை',
    'billing.purpose.subscription_period': 'திட்டப் புதுப்பித்தல்',
    'billing.purpose.settlement': 'திருப்பு தீர்வு',
    'billing.purpose.adhoc': 'கட்டணம்',
    'billing.additionalCharge': 'கூடுதல் கட்டணம்',
    'billing.additionalCharges': 'கூடுதல் கட்டணங்கள்',
    'billing.overdueByOne': '1 நாள் தாமதம்',
    'billing.overdueByOther': '{count} நாட்கள் தாமதம்',
    'billing.dueOn': '{date} அன்று செலுத்த வேண்டும்',
    'billing.lateFeeLine': 'தாமத கட்டணம் — {days} நாள் × ₹{rate}',
    'billing.lateFeeLineOther': 'தாமத கட்டணம் — {days} நாட்கள் × ₹{rate}',
    'billing.lateFeeParenOne': 'தாமத கட்டணம் (1 நாள் × ₹{rate}/நாள்)',
    'billing.lateFeeParenOther': 'தாமத கட்டணம் ({days} நாட்கள் × ₹{rate}/நாள்)',
    'billing.noPayments': 'இதுவரை கட்டணங்கள் இல்லை',
    'billing.paymentHistory': 'கட்டண வரலாறு',
    'billing.paymentRequired': 'கட்டணம் தேவை',
    'billing.scooterWontStart': 'இது செலுத்தப்படும் வரை உங்கள் ஸ்கூட்டர் இயங்காது.',
    'billing.totalAcross': '{count} விலைப்பட்டியல்களில் மொத்தம் ₹{total}',
    'billing.rentalPlanAmount': 'வாடகைத் திட்டத் தொகை',
    'billing.alreadyPaid': 'ஏற்கனவே செலுத்தியது',
    'billing.total': 'மொத்தம்',
    'billing.pay': '₹{amount} செலுத்து',
    'billing.processing': 'செயலாக்கத்தில்…',
    'billing.error.paymentFailed': 'கட்டணம் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
    'billing.error.rechargeFailed': 'உங்கள் புதுப்பிப்பு விவரங்களை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'billing.error.rechargeConfirmFailed': 'புதுப்பித்தல் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
    'billing.returnInProgress': 'திருப்பு நடைபெறுகிறது',
    'billing.return.paymentSubmitted': 'உங்கள் கட்டணம் பெறப்பட்டது — நிர்வாக உறுதிப்படுத்தலுக்குக் காத்திருக்கிறது.',
    'billing.return.readyForApproval': 'கட்டணம் சரிபார்க்கப்பட்டது — எங்கள் குழு உங்கள் திருப்பை முடித்துக்கொண்டிருக்கிறது.',
    'billing.return.awaitingReview': 'உங்கள் திருப்பு ஊழியர் மறுஆய்வுக்குக் காத்திருக்கிறது.',
    'billing.planExpired': 'உங்கள் திட்டம் முடிந்துவிட்டது',
    'billing.planEndsToday': 'உங்கள் திட்டம் இன்று முடிகிறது',
    'billing.planEndsOn': 'திட்டம் {date} அன்று முடிகிறது',
    'billing.renewLateNotice': 'இப்போதே புதுப்பிக்கவும் — தாமத கட்டணம் பொருந்தும், செலுத்தும் முன் கீழே காட்டப்படும்.',
    'billing.renewOnTimeNotice':
        'தடையின்றி சவாரி செய்ய இப்போதே புதுப்பிக்கவும். இது முடியும் தருணமே உங்கள் அடுத்த திட்டம் தொடங்கும்.',
    'billing.renewalAmount': 'புதுப்பித்தல் தொகை',
    'billing.lateFeeDaysOne': 'தாமத கட்டணம் (1 நாள் × ₹{rate})',
    'billing.lateFeeDaysOther': 'தாமத கட்டணம் ({days} நாட்கள் × ₹{rate})',
    'billing.totalPayable': 'மொத்தம் செலுத்த வேண்டியது',
    'billing.cancel': 'ரத்து',
    'billing.confirmAndPay': 'உறுதிசெய்து ₹{amount} செலுத்து',
    'billing.loading': 'ஏற்றுகிறது…',
    'billing.reviewAndRenew': 'மறுஆய்வு செய்து புதுப்பி',
    'billing.renewalScheduled': 'புதுப்பித்தல் திட்டமிடப்பட்டது — {date} அன்று தொடங்கும்',
    'billing.currentPlanActiveUntilThen': 'உங்கள் தற்போதைய திட்டம் அதுவரை செயலில் இருக்கும். எந்த நடவடிக்கையும் தேவையில்லை.',
    'billing.allClear': 'அனைத்து கட்டணங்களும் தீர்க்கப்பட்டன — எதுவும் நிலுவையில் இல்லை.',
    'billing.noActivePlan': 'செயலில் திட்டம் இல்லை',
    'billing.bookToSeeDetails': 'உங்கள் கட்டண விவரங்களை இங்கே காண ஒரு ஸ்கூட்டரை முன்பதிவு செய்யுங்கள்.',
    'billing.amountDue': 'நிலுவைத் தொகை',
    'billing.bookingPayment': 'முன்பதிவு கட்டணம்',
    'billing.bookingPaymentNotCompleted':
        'உங்கள் கடைசி கட்டண முயற்சி வெற்றியடையவில்லை. உங்கள் முன்பதிவு இன்னும் வைக்கப்பட்டுள்ளது — உங்கள் முன்பதிவை உறுதிசெய்ய கட்டணத்தை முடிக்கவும்.',
    'billing.securityDeposit': 'பாதுகாப்பு வைப்புத்தொகை',
    'billing.currentPlan': 'தற்போதைய திட்டம்',
    'billing.rentalPlan': 'வாடகைத் திட்டம்',
    'billing.cycleRental': '{cycle} வாடகை',
    'billing.started': 'தொடங்கியது',
    'billing.ends': 'முடிவு',
    'billing.expired': ' · காலாவதியானது',
    'billing.checkoutDescription.weeklyRecharge': 'வார வாடகை — புதுப்பித்தல்',
    'billing.checkoutDescription.scooterBooking': 'ஸ்கூட்டர் முன்பதிவு',

    // --- cancel booking ------------------------------------------------------
    'cancelBooking.refundNote':
        '\n\nஇதை ஒரு விரைவான மறுஆய்வுக்குப் பிறகு உங்கள் அசல் கட்டண முறைக்கு அனுப்புவோம், பொதுவாக அதே நாளில்.',
    'cancelBooking.notPaidYet': 'இந்த முன்பதிவுக்கு இன்னும் கட்டணம் செலுத்தப்படவில்லை, எனவே வசூலிக்கவோ திரும்பத் தரவோ எதுவும் இல்லை.',
    'cancelBooking.withPenalty':
        'இதை {elapsed} முன்பதிவு செய்தீர்கள். இப்போது ரத்து செய்தால் ₹{planPaid} திட்டத் தொகையில் {percent}% (₹{penalty}) பிடித்து வைக்கப்படும், மீதம் ₹{refund} திரும்பத் தரப்படும்{depositNote}.{refundNote}',
    'cancelBooking.depositNote': ' (உங்கள் ₹{amount} வைப்புத்தொகை உட்பட)',
    'cancelBooking.noPenalty':
        'இதை {elapsed} முன்பதிவு செய்தீர்கள், எனவே ரத்துக் கட்டணம் இல்லை. உங்களுக்கு ₹{refund} திரும்பத் தரப்படும்.{refundNote}',
    'cancelBooking.confirm.title': 'முன்பதிவை ரத்து செய்யவா?',
    'cancelBooking.confirm.confirmLabel': 'முன்பதிவை ரத்து செய்',
    'cancelBooking.confirm.cancelLabel': 'முன்பதிவை வைத்திரு',
    'cancelBooking.cancelled.title': 'முன்பதிவு ரத்து செய்யப்பட்டது',
    'cancelBooking.feeApplied': '₹{amount} தாமத ரத்துக் கட்டணம் பயன்படுத்தப்பட்டது. ',
    'cancelBooking.noRefundOwed': 'எந்தத் திரும்பப் பணமும் நிலுவையில் இல்லை.',
    'cancelBooking.refundComplete': 'உங்கள் ₹{amount} திரும்பப் பணம் முடிந்தது.',
    'cancelBooking.refundRequested': 'உங்கள் ₹{amount} திரும்பப் பணம் கோரப்பட்டது — அது ஏற்று அனுப்பப்பட்டவுடன் உங்களுக்குத் தெரிவிப்போம்.',
    'cancelBooking.error.title': 'ரத்து செய்ய முடியவில்லை',
    'cancelBooking.elapsed.justNow': 'இப்போதுதான்',
    'cancelBooking.elapsed.minAgo': '{minutes} நிமிடம் முன்பு',
    'cancelBooking.elapsed.hourAgo': '1 மணி நேரம் முன்பு',
    'cancelBooking.elapsed.hoursAgo': '{hours} மணி நேரம் முன்பு',
    'cancelBooking.elapsed.dayAgo': '1 நாள் முன்பு',
    'cancelBooking.elapsed.daysAgo': '{days} நாட்கள் முன்பு',

    // --- booking gate --------------------------------------------------------
    'bookingGate.alreadyRiding': 'நீங்கள் ஏற்கனவே சவாரி செய்கிறீர்கள்',
    'bookingGate.alreadyBooked': 'உங்களிடம் ஏற்கனவே ஒரு முன்பதிவு உள்ளது',
    'bookingGate.activeRentalNote': 'உங்களிடம் செயலில் வாடகை உள்ளது. மற்றொன்றை முன்பதிவு செய்வதற்கு முன் உங்கள் ஸ்கூட்டரைத் திருப்பவும்.',
    'bookingGate.activeBookingNote': 'உங்களிடம் ஏற்கனவே ஒரு ஸ்கூட்டர் முன்பதிவு செய்யப்பட்டு பிக்கப்புக்குக் காத்திருக்கிறது.',
    'bookingGate.viewMyScooter': 'என் ஸ்கூட்டரைப் பார்',
    'bookingGate.viewBooking': 'முன்பதிவைப் பார்',
    'bookingGate.notNow': 'இப்போது வேண்டாம்',
    'bookingGate.activeRental': 'செயலில் வாடகை',
    'bookingGate.bookingPending': 'முன்பதிவு நிலுவையில்',
    'bookingGate.completeKycToBook': 'முன்பதிவு செய்ய KYC-ஐ முடிக்கவும்',
    'bookingGate.bookNow': 'இப்போது முன்பதிவு செய்',
    'bookingGate.completeKycFirst': 'முதலில் உங்கள் KYC-ஐ முடிக்கவும்',
    'bookingGate.kycNeeded':
        'ஸ்கூட்டரை முன்பதிவு செய்வதற்கு முன் சரிபார்க்கப்பட்ட KYC தேவை. இது சில நிமிடங்களே ஆகும் — ஏற்கப்பட்டவுடன், {scooter}ஐ உடனடியாக முன்பதிவு செய்யலாம்.',
    'bookingGate.thisScooter': 'இந்த ஸ்கூட்டர்',
    'bookingGate.completeKyc': 'KYC-ஐ முடி',

    // --- request return -------------------------------------------------------
    'requestReturn.deadline.todayByMidnight': 'இன்று இரவு 11:59 மணிக்குள்',
    'requestReturn.deadline.dateByMidnight': '{date} இரவு 11:59 மணிக்குள்',
    'requestReturn.deadline.daysAgoOne': '1 நாள் முன்பு',
    'requestReturn.deadline.daysAgoOther': '{days} நாட்கள் முன்பு',
    'requestReturn.requested.title': 'திருப்பு கோரப்பட்டது',
    'requestReturn.requested.message': '{deadline}க்குள் உங்கள் ஸ்கூட்டரைத் திருப்பவும். எங்கள் குழு அதைப் பெற்றவுடன் உறுதிப்படுத்துவோம்.',
    'requestReturn.error.title': 'திருப்பைக் கோர முடியவில்லை',

    // --- file picker -----------------------------------------------------
    'filePicker.error.unsupported.title': 'ஆதரிக்கப்படாத கோப்பு',
    'filePicker.error.unsupported.message': 'JPEG, PNG அல்லது PDF பதிவேற்றவும்.',
    'filePicker.error.tooLarge.title': 'கோப்பு மிகப் பெரியது',
    'filePicker.error.tooLarge.message': 'ஒவ்வொரு ஆவணமும் 10 MB அல்லது அதற்குக் குறைவாக இருக்க வேண்டும்.',
    'filePicker.error.cameraUnavailable.title': 'கேமரா கிடைக்கவில்லை',
    'filePicker.error.cameraUnavailable.message': 'உங்கள் ஆவணத்தைப் புகைப்படம் எடுக்க கேமரா அணுகலை அனுமதிக்கவும்.',
    'filePicker.error.photosUnavailable.title': 'புகைப்படங்கள் கிடைக்கவில்லை',
    'filePicker.error.photosUnavailable.message': 'உங்கள் ஆவணத்தைத் தேர்வுசெய்ய புகைப்பட அணுகலை அனுமதிக்கவும்.',
    'filePicker.web.uploadPdfConfirm': 'PDF கோப்பைப் பதிவேற்றவா? புகைப்படத்தைப் பதிவேற்ற ரத்து செய் என்பதை அழுத்தவும்.',
    'filePicker.web.takePhotoConfirm': 'புதிய புகைப்படம் எடுக்கவா? ஏற்கனவே உள்ள புகைப்படத்தைத் தேர்வுசெய்ய ரத்து செய் என்பதை அழுத்தவும்.',
    'filePicker.web.takePhotoConfirmGallery': 'புதிய புகைப்படம் எடுக்கவா? உங்கள் கோப்புகளிலிருந்து தேர்வுசெய்ய ரத்து செய் என்பதை அழுத்தவும்.',
    'filePicker.addDocument.title': 'ஆவணத்தைச் சேர்',
    'filePicker.addDocument.message': 'இந்த ஆவணத்தை எப்படி வழங்க விரும்புகிறீர்கள்?',
    'filePicker.takePhoto': 'புகைப்படம் எடு',
    'filePicker.choosePhoto': 'புகைப்படத்தைத் தேர்வுசெய்',
    'filePicker.browseFiles': 'கோப்புகளை உலாவு (PDF)',
    'filePicker.addPhoto.title': 'புகைப்படத்தைச் சேர்',
    'filePicker.addPhoto.message': 'உங்கள் புகைப்படத்தை எப்படி வழங்க விரும்புகிறீர்கள்?',
    'filePicker.chooseFromGallery': 'கேலரியிலிருந்து தேர்வுசெய்',

    // --- date picker field -------------------------------------------------
    'datePicker.placeholder': 'YYYY-MM-DD',
    'datePicker.openCalendar': 'நாட்காட்டியைத் திற',
    'datePicker.back': 'பின்செல்',
    'datePicker.close': 'மூடு',
    'datePicker.selectYear': 'ஆண்டைத் தேர்ந்தெடுக்கவும்',

    // --- shared UI chrome --------------------------------------------------
    'ui.dismiss': 'மூடு',
    'ui.searchPlaceholder': 'தேடு...',
    'ui.dismissNotification': 'அறிவிப்பை மூடு',
    'ui.comingSoon': 'விரைவில் வரும்',
    'ui.selectPlaceholder': 'தேர்ந்தெடு...',
    'ui.searchLabelFor': '{field} தேடு',

    // --- vehicle documents card (placeholder) -------------------------------
    'vehicleDocs.title': 'வாகன ஆவணங்கள்',
    'vehicleDocs.rc': 'பதிவுச் சான்றிதழ்',
    'vehicleDocs.rcHint': 'ஸ்கூட்டர் பதிவு செய்யப்பட்டதற்கான சான்று (RC)',
    'vehicleDocs.insurance': 'காப்பீடு',
    'vehicleDocs.insuranceHint': 'செயலில் உள்ள மூன்றாம் தரப்பு காப்பீடு',
    'vehicleDocs.puc': 'PUC சான்றிதழ்',
    'vehicleDocs.pucHint': 'மாசுக் கட்டுப்பாடு',
    'vehicleDocs.footer':
        'எங்கள் குழு பதிவேற்றத்தை முடித்தவுடன் உங்கள் ஸ்கூட்டரின் ஆவணங்களை இங்கே பார்க்கவும் பதிவிறக்கவும் முடியும்.',

    // --- app shell (header + profile sheet) ---------------------------------
    'appShell.goBack': 'பின்செல்',
    'appShell.dayN': 'நாள் {day}',
    'appShell.notificationsUnread': 'அறிவிப்புகள், {count} படிக்காதவை',
    'appShell.notifications': 'அறிவிப்புகள்',
    'appShell.profile': 'சுயவிவரம்',

    // --- root layout: profile load failure ----------------------------------
    'rootLayout.couldNotLoadProfile': 'உங்கள் சுயவிவரத்தை ஏற்ற முடியவில்லை',

    // --- shared error state --------------------------------------------------
    'errorState.offline': 'சேவையகத்தை அடைய முடியவில்லை',
    'errorState.generic': 'ஏதோ தவறு நடந்தது',

    // --- refer & earn (currently unmounted, no schema yet) --------------------
    'referral.title': 'பரிந்துரைத்து சம்பாதி',
    'referral.body': 'உங்கள் குறியீட்டைப் பகிரவும் — உங்கள் நண்பருக்கு அவர்களின் முதல் முன்பதிவில் ₹{amount} தள்ளுபடி கிடைக்கும், அவர்கள் அதை முடித்தவுடன் நீங்கள் ஒரு வெகுமதி பெறுவீர்கள்.',
    'referral.share': 'பகிர்',
    'referral.shareMessage': 'செயலியில் என்னுடன் சேருங்கள், உங்கள் முதல் முன்பதிவில் ₹{amount} தள்ளுபடி பெறுங்கள்! பதிவு செய்யும்போது என் பரிந்துரைக் குறியீடு {code}ஐப் பயன்படுத்துங்கள்.',

    // --- sign in ----------------------------------------------------------
    'auth.tagline': 'சவாரி தொடங்க உங்கள் மொபைல் எண்ணுடன் உள்நுழையவும்.',
    'auth.mobileNumber': 'மொபைல் எண்',
    'auth.mobileNumberPlaceholder': 'மொபைல் எண்',
    'auth.otpHint': '6-இலக்க குறியீட்டை உங்களுக்கு அனுப்புவோம். இந்திய எண்களை +91 இல்லாமல் தட்டச்சு செய்யலாம்.',
    'auth.sendCode': 'குறியீட்டை அனுப்பு',
    'auth.or': 'அல்லது',
    'auth.continueWithGoogle': 'கூகுளுடன் தொடரவும்',
    'auth.openingGoogle': 'கூகுள் உள்நுழைவைத் திறக்கிறது...',
    'auth.googleRecoveryHint': 'உங்கள் எண்ணை மாற்றிவிட்டீர்களா? கணக்கிற்குத் திரும்ப கூகுளைப் பயன்படுத்தவும்.',
    'auth.legalNote': 'தொடர்வதன் மூலம் நீங்கள் எங்கள் விதிமுறைகளை ஏற்று, எங்கள் தனியுரிமைக் கொள்கையை ஒப்புக்கொள்கிறீர்கள்.',
    'auth.error.invalidPhone': 'சரியான மொபைல் எண்ணை உள்ளிடவும்.',
    'auth.error.sendFailed': 'குறியீட்டை அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'auth.error.googleFailed': 'கூகுள் உள்நுழைவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
    'auth.goBack': 'பின்செல்',
    'auth.signOut': 'வெளியேறு',
    'auth.logout': 'வெளியேறு',

    // --- onboarding carousel ----------------------------------------------
    'onboarding.slide1.title': 'உங்கள் EV-ஐக் கண்டறியுங்கள். நொடிகளில் முன்பதிவு செய்யுங்கள்.',
    'onboarding.slide1.body':
        'உங்களுக்கு அருகில் கிடைக்கும் ஸ்வாப்ங்கோ மின்சார ஸ்கூட்டர்களைக் கண்டறியுங்கள், விருப்பமான வாகனத்தைத் தேர்ந்தெடுத்து, செயலியிலிருந்தே நேரடியாக முன்பதிவு செய்யுங்கள்.',
    'onboarding.slide2.title': 'அதிகம் சவாரி செய்யுங்கள். எப்போது வேண்டுமானாலும் மாற்றுங்கள்.',
    'onboarding.slide2.body':
        'சார்ஜிங் பற்றிக் கவலைப்படாமல் சவாரியை அனுபவியுங்கள். பேட்டரி குறையும்போது, அருகிலுள்ள ஸ்வாப்ங்கோ பேட்டரி மாற்று நிலையத்தைக் கண்டறிந்து விரைவாக பேட்டரியை மாற்றிக் கொள்ளுங்கள்.',
    'onboarding.slide3.title': 'ஒரே செயலியில் உங்களுக்குத் தேவையான அனைத்தும்',
    'onboarding.slide3.body':
        'உங்கள் வாடகையை நிர்வகிக்கவும், உங்கள் ஸ்கூட்டரைப் பார்க்கவும், சவாரிகளைக் கண்காணிக்கவும், கட்டணங்களைச் சரிபார்க்கவும், மாற்று நிலையங்களைக் கண்டறியவும், ஆதரவைப் பெறவும் — அனைத்தும் ஒரே செயலியில்.',
    'onboarding.getStarted': 'தொடங்கு',

    // --- KYC intro --------------------------------------------------------
    'kycIntro.title': 'வாகன வாடகையைத் திறக்க உங்கள் அடையாளத்தைச் சரிபார்க்கவும்',
    'kycIntro.body':
        'ஒரு விரைவான அடையாளச் சரிபார்ப்பு உங்களுக்கும் மற்ற சவாரி செய்பவர்களுக்கும் ஒவ்வொரு சவாரியையும் பாதுகாப்பானதாக்குகிறது. உங்கள் புகைப்படம், ஒரு அவசர தொடர்பு, உங்கள் ஆதார் எண் மற்றும் உங்கள் ஓட்டுநர் உரிமம் தேவைப்படும்.',
    'kycIntro.duration': 'சுமார் 5 நிமிடங்கள் ஆகும். உங்கள் முன்னேற்றத்தைச் சேமித்து எப்போது வேண்டுமானாலும் முடிக்கலாம்.',
    'kycIntro.skip': 'இப்போதைக்குத் தவிர்',
    'kycIntro.skipConfirm.title': 'இப்போதைக்கு KYC-ஐத் தவிர்க்கவா?',
    'kycIntro.skipConfirm.message':
        'நீங்கள் இன்னும் செயலியை உலாவலாம், ஆனால் ஸ்கூட்டரை வாடகைக்கு எடுப்பதற்கு முன் KYC-ஐ முடிக்க வேண்டும்.',

    // --- OTP --------------------------------------------------------------
    'otp.title': 'சரிபார்ப்புக் குறியீட்டை உள்ளிடவும்',
    'otp.sentTo': '{phone}க்கு அனுப்பப்பட்டது.',
    'otp.yourNumber': 'உங்கள் எண்',
    'otp.inputLabel': '6 இலக்க சரிபார்ப்புக் குறியீடு',
    'otp.verify': 'சரிபார்',
    'otp.resendIn': '{seconds} வினாடிகளில் மீண்டும் அனுப்பு',
    'otp.resend': 'மீண்டும் அனுப்பு',
    'otp.error.invalid': '6-இலக்க குறியீட்டை உள்ளிடவும்.',
    'otp.error.verifyFailed': 'குறியீட்டைச் சரிபார்க்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'otp.error.resendFailed': 'குறியீட்டை மீண்டும் அனுப்ப முடியவில்லை.',

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
    'consent.confirmDeclaration': 'தனியுரிமை அறிவிப்பைப் படித்து புரிந்துகொண்டேன் என்பதை உறுதிப்படுத்துகிறேன்.',
    'consent.accept': 'ஒப்புக்கொண்டு தொடரவும்',
    'consent.saving': 'உங்கள் தேர்வுகள் சேமிக்கப்படுகின்றன...',
    'consent.error': 'உங்கள் தேர்வுகளைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    'consent.stale':
        'இந்தத் திரையைத் திறந்த பிறகு எங்கள் தனியுரிமை அறிவிப்பு புதுப்பிக்கப்பட்டுள்ளது. மீண்டும் படித்துத் தேர்வு செய்யவும்.',
    'consent.grantedOn': 'அடையாளச் சரிபார்ப்புக்கான சம்மதம் {date} அன்று வழங்கப்பட்டது',
    'consent.manage': 'நிர்வகி',

    // --- Terms & Conditions -----------------------------------------------
    'terms.title': 'விதிமுறைகள் மற்றும் நிபந்தனைகள்',
    'terms.version': 'பதிப்பு {version}, {date} முதல் அமலில்',
    'terms.readTerms': 'முழு விதிமுறைகளையும் நிபந்தனைகளையும் படிக்கவும்',
    'terms.agree': 'விதிமுறைகள் மற்றும் நிபந்தனைகளைப் படித்து ஒப்புக்கொள்கிறேன்.',
    'terms.openFirst': 'ஒப்புக்கொள்வதற்கு முன் மேலே உள்ள விதிமுறைகளைத் திறந்து படிக்கவும்.',
    'terms.acceptedOn': 'பதிப்பு {version} ஐ {date} அன்று நீங்கள் ஏற்றுக்கொண்டீர்கள்.',
    'terms.englishOnly':
        'ஆங்கிலத்தில் காட்டப்படுகிறது. மதிப்பாய்வு செய்யப்பட்ட தமிழ் மொழிபெயர்ப்பு இன்னும் கிடைக்கவில்லை — ஏதேனும் தெளிவில்லை என்றால் எங்கள் ஆதரவுக் குழுவைக் கேட்கவும்.',
    'terms.stale':
        'இந்தத் திரையைத் திறந்ததிலிருந்து எங்கள் விதிமுறைகள் புதுப்பிக்கப்பட்டுள்ளன. மீண்டும் படித்து ஏற்கவும்.',

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
    'privacy.summary': 'உங்களைப் பற்றி நாங்கள் அறிந்தவை',
    'privacy.summary.help':
        'உங்களைப் பற்றி நாங்கள் வைத்திருக்கும் தரவு, அதை எவ்வளவு காலம் வைத்திருக்கிறோம், வேறு யாருக்கு அது செல்கிறது என்பதன் சுருக்கம்.',
    'privacy.summary.identity': 'உங்கள் விவரங்கள்',
    'privacy.summary.name': 'பெயர்',
    'privacy.summary.phone': 'தொலைபேசி',
    'privacy.summary.email': 'மின்னஞ்சல்',
    'privacy.summary.dob': 'பிறந்த தேதி',
    'privacy.summary.address': 'முகவரி',
    'privacy.summary.correctCta': 'இதில் ஏதேனும் தவறா? திருத்தச் சொல்லுங்கள்',
    'privacy.summary.categories': 'நாங்கள் வைத்திருப்பவை',
    'privacy.summary.records': '{count} பதிவுகள்',
    'privacy.summary.none': 'இதுவரை எதுவும் இல்லை',
    'privacy.summary.consents': 'உங்கள் தேர்வுகள்',
    'privacy.summary.shared': 'உங்கள் தரவைப் பெறும் மற்றவர்கள்',
    'privacy.summary.notHeld': 'நாங்கள் வைத்திருக்காதவை',
    'privacy.summary.generated': '{date} நிலவரப்படி',
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
