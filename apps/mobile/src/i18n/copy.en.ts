/**
 * Every rider-facing string in the app.
 *
 * This file is the SOURCE OF TRUTH: `CopyKey` is `keyof typeof en`, so
 * copy.ta.ts and copy.hi.ts — both typed `Record<CopyKey, string>` — fail to
 * compile the moment a key added here is missing there. Add English first,
 * always.
 *
 * Two things deliberately do NOT live here:
 *
 *  - The privacy NOTICE and the Terms themselves. Those come from the API
 *    (consent_notices.body_en/body_ta, legal_documents.body_en/body_ta), so
 *    publishing a corrected document does not need an app-store release and
 *    consent_records.notice_version always resolves to the exact text the
 *    rider saw. This file holds only the chrome around them.
 *
 *  - Backend enum values. `BOOKED`, `RETURN_REQUESTED`, `pending_payment` and
 *    friends stay machine-readable everywhere; what is translated is their
 *    DISPLAY LABEL, under the `status.*` keys near the bottom.
 *
 * Keys are flat and dotted rather than nested objects. That is what makes
 * `Record<CopyKey, string>` a total, checkable contract — a nested shape can
 * only be checked with a recursive mapped type that stops catching mistakes
 * as soon as one branch is widened to `string`.
 */
export const en = {
    // --- language ---------------------------------------------------------
    'lang.label': 'Language',
    'language.title': 'Choose your language',
    'language.subtitle': 'You can change this later in your profile.',
    'language.settingsTitle': 'Choose Language',
    'language.continue': 'Continue',
    'language.done': 'Done',
    'language.changed': 'Language updated',
    // Read out by TalkBack. {language} is the English name of the language,
    // not its endonym — see LANG_ACCESSIBLE_NAMES in types.ts.
    'language.a11y.selected': '{language}, selected',
    'language.a11y.notSelected': '{language}, not selected',
    'language.a11y.hint': 'Switches the app to this language',
    'language.offlineNote': 'Your choice is saved on this device and synced when you are back online.',

    // --- common -----------------------------------------------------------
    'common.confirm': 'Confirm',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.ok': 'OK',
    'common.gotIt': 'Got it',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.continue': 'Continue',
    'common.done': 'Done',
    'common.skip': 'Skip',
    'common.notNow': 'Not now',
    'common.submit': 'Submit',
    'common.share': 'Share',
    'common.seeAll': 'See All',
    'common.viewAll': 'View all',
    'common.remove': 'Remove',
    'common.edit': 'Edit',
    'common.refresh': 'Refresh',
    'common.search': 'Search',
    'common.none': 'None',
    'common.dash': '—',
    'common.total': 'Total',
    // Title form (a dialog heading) and full-sentence form (body text). Kept
    // apart because Tamil and Hindi cannot make one serve as the other by
    // dropping a clause the way English can.
    'common.somethingWentWrong': 'Something went wrong',
    'common.genericError': 'Something went wrong. Please try again.',
    'common.tryAgain': 'Try Again',
    'common.noMatches': 'No matches.',
    'common.pleaseTryAgain': 'Please try again.',

    // --- navigation -------------------------------------------------------
    'navigation.home': 'Home',
    'navigation.scooter': 'Scooter',
    'navigation.billing': 'Plan & Billing',
    'navigation.stations': 'Stations',
    'navigation.profile': 'Profile',
    'navigation.notifications': 'Notifications',
    'navigation.support': 'Support',

    // --- settings / profile menu ------------------------------------------
    'settings.settings': 'Settings',
    'settings.language': 'Language',
    'settings.chooseLanguage': 'Choose Language',
    'settings.account': 'Account',

    // --- my scooter / rental ----------------------------------------------
    'scooter.title': 'My Scooter',
    'scooter.registrationNumber': 'Registration Number',
    'scooter.plan': 'Plan',
    'scooter.onRentSince': 'On rent since',
    // "05 Sep 2026 · Day 12". The date comes from the device's regional
    // format; only the "Day N" half is translated.
    'scooter.sinceValue': '{date} · Day {day}',
    'scooter.planEnded': 'Plan ended',
    'scooter.renewsOn': 'Renews on',
    'scooter.nextServiceDue': 'Next service due',
    'scooter.pickedUpAt': 'Picked Up At',
    'scooter.pickupStation': 'Pickup Station',
    'scooter.renewPlan': 'Renew Plan',
    'scooter.returnScooter': 'Return Scooter',
    'scooter.returnAfter': 'You can return once your current plan period ends on {date}.',
    'scooter.reportProblem': 'Report a problem',
    'scooter.notAssigned': 'Vehicle not yet assigned',
    'scooter.empty.title': 'No active rental',
    'scooter.empty.subtitle':
        'Book a scooter to see it here — once picked up, its details will show up on this screen.',
    'rental.activePlan': 'Active Plan',
    'rental.unlimitedKms': 'Unlimited Kms',
    'rental.myPlan': 'My Plan',
    'rental.yourPlan': 'Your plan',
    'rental.assigned': 'Assigned',
    'rental.viewPlanDetails': 'View Plan Details',
    'rental.renewPlanNow': 'Renew Plan Now',
    'rental.lastDay': 'Last day',
    // Two forms because English pluralises and Tamil/Hindi do not agree on
    // where the number sits — one key each beats a suffixed "s".
    'rental.daysRemaining.one': '1 day remaining',
    'rental.daysRemaining.other': '{count} days remaining',
    'rental.dayOf': 'Day {day} of {total}',
    // "05 Sep 2026  —  12 Sep 2026". The dash spacing is part of the layout.
    'rental.periodRange': '{start}  —  {end}',

    // --- scooter status card (Home alert strip) ---------------------------
    'scooterStatus.paymentRequired': 'Payment Required',
    'scooterStatus.paymentRequired.body': 'Complete the payment to finish your scooter return.',
    'scooterStatus.pay': 'Pay {amount}',
    'scooterStatus.paymentReceived': 'Payment Received',
    'scooterStatus.paymentReceived.body': 'Awaiting admin confirmation before your return can be completed.',
    'scooterStatus.verificationPending': 'Return Verification Pending',
    'scooterStatus.verificationPending.body': 'Your payment is verified — our team is completing the handover.',
    'scooterStatus.returnRequested': 'Return Requested',
    'scooterStatus.returnRequested.body':
        'Your scooter is waiting for staff confirmation. It stays yours until then.',
    'scooterStatus.recoveryRequired': 'Vehicle Recovery Required',
    'scooterStatus.recoveryRequired.body':
        'A {amount} late fee applies. Please make your scooter available for pickup.',
    'scooterStatus.renewalScheduled': 'Renewal Scheduled',
    'scooterStatus.renewalScheduled.starts': 'Starts {date}.',
    'scooterStatus.renewalScheduled.body': 'Your current plan stays active until then.',
    // Singular and plural as separate keys — see the note on
    // rental.daysRemaining above.
    'scooterStatus.expired.overdueOne': 'Plan expired · overdue by 1 day',
    'scooterStatus.expired.overdueOther': 'Plan expired · overdue by {count} days',
    'scooterStatus.expired.renewToday': 'Plan expired · renew today',
    'scooterStatus.lateFeeBuilt': 'A {amount} late fee has built up and grows each day.',
    'scooterStatus.renewToClear': 'Renew your plan below to clear it and keep riding.',
    'scooterStatus.returnAsap': 'Return your scooter as soon as possible.',
    'scooterStatus.renewFreeToday': 'Renew below today and you owe no late fee — {rate}/day starts tomorrow.',
    'scooterStatus.renewToKeepRiding': 'Renew your plan below to keep riding.',
    'scooterStatus.planExpired': 'Plan Expired',
    'scooterStatus.planEndsOn': 'Plan ends {date}',
    'scooterStatus.planEndsOnWithLeft': 'Plan ends {date} · {remaining}',
    'scooterStatus.planStatus': 'Plan Status',
    'scooterStatus.daysLeftOne': '1 day left',
    'scooterStatus.daysLeftOther': '{count} days left',
    'scooterStatus.renewLateFeeApplies': 'Renew below — a late fee applies, shown before you pay.',
    'scooterStatus.renewAnyTime': 'Renew any time before your plan ends.',
    'scooterStatus.active': 'Scooter Active',
    'scooterStatus.allGood': 'Everything looks good.',

    // --- return status card -----------------------------------------------
    'returnStatus.overdueOne': 'Overdue by 1 day',
    'returnStatus.overdueOther': 'Overdue by {count} days',
    'returnStatus.returnRequested': 'Return requested',
    'returnStatus.recoveryBody.one':
        'A {amount} late fee applies (capped at 1 day) and our team is on the way to collect the scooter. Please make it available for pickup.',
    'returnStatus.recoveryBody.other':
        'A {amount} late fee applies (capped at {days} days) and our team is on the way to collect the scooter. Please make it available for pickup.',
    'returnStatus.overdueBody':
        'A {amount} late fee has built up so far, and will be charged when our team confirms the handover.',
    'returnStatus.handInBy':
        'Hand your scooter in by {deadline}. Our team will confirm the handover — the scooter stays yours until then.',
    'returnStatus.stagePrefix': 'Return Status: {stage}',
    'returnStatus.stage.payment_required': 'Payment Required',
    'returnStatus.stage.payment_submitted': 'Payment Submitted',
    'returnStatus.stage.ready_for_approval': 'Payment Verified — Ready for Approval',
    'returnStatus.stage.return_completed': 'Return Completed',
    'returnStatus.stageBody.paymentRequired':
        'An additional {amount} was found during inspection (damage/other charges). Pay it above to continue your return.',
    'returnStatus.stageBody.paymentSubmitted':
        'Payment Status: Paid – Awaiting Admin Verification. Your payment has been received. The admin will verify it and complete your vehicle return.',
    'returnStatus.stageBody.readyForApproval':
        'Your payment has been verified. Awaiting return completion — our team will finish processing the handover shortly.',
    'returnStatus.stageBody.completed': 'Your vehicle has been successfully returned.',

    // --- return lock ------------------------------------------------------
    'returnLock.title': 'Return requested',
    'returnLock.body':
        "You've asked to return this scooter, so your plan can't be changed while our team completes the handover. Your scooter stays yours until they confirm it.",
    'returnLock.blockedHint':
        'Need to keep riding instead? Contact support and we can cancel the return for you.',
    'returnLock.supportHint': 'You can still contact support — including about this return.',
    'returnLock.continueToSupport': 'Continue to support',

    // --- late fee policy explainer ----------------------------------------
    'lateFee.title': 'How your late fee is counted',
    'lateFee.lastDay.heading': 'The last day of your plan is yours',
    'lateFee.lastDay.body':
        'Your plan covers its final day in full. The late fee only begins the day AFTER your plan ends.',
    'lateFee.renewing.heading': 'Renewing pays for today',
    'lateFee.renewing.body':
        'When you renew, your new plan starts today — so today is charged as plan time, not as a penalty. Renew on the very first day after your plan ends and you owe no late fee at all.',
    'lateFee.returning.heading': 'Returning uses up today',
    'lateFee.returning.body':
        'When you hand the scooter back, you have already ridden it through today, so today is counted. That is why returning always shows one day more than renewing on the same date.',
    'lateFee.oneFee.heading': 'It is one fee, paid once',
    'lateFee.oneFee.withRate':
        'The rate is {rate} per day either way. Whichever way you clear it — renewing or paying before a return — it is the same debt, and paying it once settles it for this cycle.',
    'lateFee.oneFee.noRate':
        'The rate is the same either way. Whichever way you clear it — renewing or paying before a return — it is the same debt, and paying it once settles it for this cycle.',
    'lateFee.example.intro': 'Say your plan ended on the 1st and today is the 4th:',
    'lateFee.example.renew': '· Renew today → 2 days (the 2nd and 3rd){amount}',
    'lateFee.example.return': '· Return today → 3 days (the 2nd, 3rd and 4th){amount}',
    // The " = ₹668" tail. Its own key because the equals sign and spacing are
    // typography, not arithmetic, and a language may want them differently.
    'lateFee.example.equals': ' = {amount}',

    // --- settlement card --------------------------------------------------
    'settlement.status.pending_refund': 'Refund Pending',
    'settlement.status.refund_processing': 'Refund Processing',
    'settlement.status.refund_completed': 'Refund Completed',
    'settlement.status.no_refund_required': 'No Refund Required',
    'settlement.status.amount_due': 'Amount Due',
    'settlement.status.settlement_completed': 'Settlement Completed',
    'settlement.returnSettlement': 'Scooter Return Settlement',
    'settlement.additionalDue': 'Additional amount due — please pay this to complete your return process.',
    'settlement.processing': 'Processing…',
    'settlement.returnedSuccessfully': 'Scooter Returned Successfully',
    'settlement.dismiss': 'Dismiss',
    'settlement.securityDeposit': 'Security Deposit',
    'settlement.lateFee': 'Late Fee',
    'settlement.damageFee': 'Damage Fee',
    'settlement.refundAmount': 'Refund Amount',
    // Razorpay's own checkout sheet shows this. Sent to the gateway rather
    // than rendered by us, but it IS rider-facing, so it is translated.
    'settlement.checkoutDescription': 'Return Settlement',
    'payment.failed': 'Payment failed. Please try again.',

    // --- late fee payment gate --------------------------------------------
    'lateFeeGate.title': 'Late Fee Payment Required',
    'lateFeeGate.planExpired': 'Plan Expired',
    'lateFeeGate.body':
        'Your plan has expired and a late fee is pending. Please complete the late fee payment before returning the scooter.',
    'lateFeeGate.rider': 'Rider',
    'lateFeeGate.vehicle': 'Vehicle',
    'lateFeeGate.planEnded': 'Plan Ended',
    'lateFeeGate.overdue': 'Overdue',
    'lateFeeGate.overdueDays.one': '1 day',
    'lateFeeGate.overdueDays.other': '{count} days',
    'lateFeeGate.lateFee': 'Late Fee',
    'lateFeeGate.amountDue': 'Amount Due',
    'lateFeeGate.payButton': 'Pay Late Fee — {amount}',
    'lateFeeGate.checkoutDescription': 'Overdue Plan — Late Fee',
    'lateFeeGate.error':
        'Your late fee payment was not completed. Please try again to continue the return process.',

    // --- KYC wizard -------------------------------------------------------
    'kyc.title': 'KYC Verification',
    'kyc.loading': 'Loading your verification...',
    'kyc.loadFailed': 'Could not load your KYC.',
    'kyc.step.photo': 'Photo',
    'kyc.step.emergency': 'Emergency Contact',
    'kyc.step.aadhaar': 'Aadhaar',
    'kyc.step.licence': 'Licence',
    'kyc.step.review': 'Review',
    'kyc.header.title': 'Identity Verification',
    'kyc.header.percent': '{percent}% complete',
    'kyc.header.rejected': 'A document was rejected. Fix it below and resubmit.',
    'kyc.header.pending': 'Your documents are being reviewed. Nothing more to do for now.',
    'kyc.verified.title': "You're verified",
    'kyc.verified.body':
        "Your documents are approved and your scooter can be unlocked. If a document expires you'll be asked to upload a current one.",
    'kyc.skipForNow': 'Skip for Now',
    'kyc.skipConfirm.title': 'Skip KYC for now?',
    'kyc.skipConfirm.message':
        'Your progress is saved. You can finish anytime from Home, but you will not be able to rent a scooter until KYC is complete.',
    'kyc.skipConfirm.keepGoing': 'Keep going',

    'kyc.photo.title': 'Profile Photo',
    'kyc.photo.intro': 'Before you take your photo:',
    'kyc.photo.tip.faceCamera': 'Face the camera directly',
    'kyc.photo.tip.lighting': 'Use good, even lighting',
    'kyc.photo.tip.noSunglasses': 'Remove sunglasses or hats',
    'kyc.photo.tip.plainBackground': 'Stand against a plain background',
    'kyc.photo.tip.wholeFace': 'Make sure your entire face is visible',
    'kyc.photo.onFile': 'Photo already on file',
    'kyc.photo.retake': 'Retake or choose another',
    'kyc.photo.take': 'Take or choose a photo',
    'kyc.photo.save': 'Save Photo',

    'kyc.emergency.title': 'Emergency Contact',
    'kyc.emergency.body': "We'll only use this number if we're unable to reach you during a ride.",
    'kyc.emergency.name': 'Contact Name',
    'kyc.emergency.namePlaceholder': 'Full name',
    'kyc.emergency.phone': 'Alternate Phone Number',
    'kyc.emergency.phonePlaceholder': 'Alternate phone number',
    'kyc.emergency.saveContinue': 'Save & Continue',
    'kyc.emergency.error.name':
        'Contact name can only contain letters, spaces, apostrophes and hyphens.',
    'kyc.emergency.error.phone': 'Enter a valid phone number, e.g. +919876543210.',
    'kyc.emergency.error.save': 'Could not save. Please try again.',

    'kyc.doc.rejected': 'Rejected',
    'kyc.doc.removeReupload': 'Remove & re-upload',
    'kyc.doc.aadhaarNumber': 'Aadhaar Number',
    'kyc.doc.documentNumber': 'Document Number',
    // Example numbers, not translated text — the FORMAT is what the rider is
    // being shown, and it does not change with language.
    'kyc.doc.aadhaarPlaceholder': 'e.g. 2345 6789 0123',
    'kyc.doc.licencePlaceholder': 'e.g. TN0120110012345',
    'kyc.doc.aadhaarHint': 'Manual entry today — OCR auto-fill is planned for a future release.',
    'kyc.doc.expiryDate': 'Expiry Date',
    'kyc.doc.expiryHint': 'An expired licence cannot be verified.',
    'kyc.doc.front': 'Front',
    'kyc.doc.back': 'Back',
    'kyc.doc.removeSide': 'Remove {side}',
    'kyc.doc.addPhotoOrPdf': 'Add photo or PDF',
    'kyc.doc.upload': 'Upload Document',
    'kyc.doc.resubmit': 'Resubmit Document',
    'kyc.doc.expiresOn': ' • expires {date}',
    'kyc.doc.expired': 'Expired — upload a current one',
    'kyc.doc.preview': 'Preview document',
    'kyc.doc.closePreview': 'Close preview',
    'kyc.doc.pdfTitle': 'PDF document',
    'kyc.doc.pdfBody':
        "PDFs can't be shown inline yet. The signed link expires in a few minutes and is never saved to your device.",

    'kyc.review.title': 'Review & Declare',
    'kyc.review.fullName': 'Full Name',
    'kyc.review.dob': 'Date of Birth',
    'kyc.review.phone': 'Phone',
    'kyc.review.profilePhoto': 'Profile Photo',
    'kyc.review.uploaded': 'Uploaded',
    'kyc.review.notUploaded': 'Not uploaded',
    'kyc.review.emergencyContact': 'Emergency Contact',
    'kyc.review.declaration':
        'I declare the information and documents provided are true and belong to me.',
    'kyc.review.submit': 'Submit for Review',
    'kyc.stillNeeded': 'Still needed: {documents}',
    'kyc.consentGiven': 'Consent for identity verification given on {date}.',
    'kyc.consentMissing': 'We do not have your consent to verify your identity yet.',
    'kyc.giveConsent': 'Give consent',

    'kyc.error.docNumber.title': 'Document number required',
    'kyc.error.docNumber.message': 'Enter the number printed on the document.',
    'kyc.error.front.title': 'Front image required',
    'kyc.error.front.message': 'Add a photo or PDF of the front of the document.',
    'kyc.error.back.title': 'Back image required',
    'kyc.error.back.message': 'Add a photo or PDF of the back of the document.',
    'kyc.error.expiry.title': 'Expiry date required',
    'kyc.error.expiry.message': 'A driving licence must include its expiry date.',
    'kyc.error.date.title': 'Invalid date',
    'kyc.error.date.message': 'Use the format YYYY-MM-DD.',
    'kyc.error.aadhaar.title': 'Invalid Aadhaar number',
    'kyc.error.aadhaar.message': 'Enter your 12-digit Aadhaar number.',
    'kyc.error.uploadFailed': 'Upload failed',
    'kyc.error.removeFailed': 'Could not remove',
    'kyc.error.previewUnavailable': 'Preview unavailable',
    'kyc.error.submitFailed': 'Could not submit',
    'kyc.error.declare.title': 'Confirmation needed',
    'kyc.error.declare.message': 'Confirm your details are true to submit your KYC.',
    'kyc.removeConfirm.title': 'Remove document',
    'kyc.removeConfirm.message': 'Remove your {document}?',
    'kyc.submitted.title': 'Submitted',
    'kyc.submitted.message': 'Your documents are with our team. We will notify you once reviewed.',

    // --- KYC banner (Home) ------------------------------------------------
    'kycBanner.rejected': 'A document needs fixing to unlock all features',
    'kycBanner.inReview': "Your profile is under review — we'll notify you",
    'kycBanner.incomplete': 'Complete your profile to unlock all features',

    // --- maintenance notice (Home) ----------------------------------------
    'maintenance.inspecting': "Your scooter is being inspected. We'll update you shortly.",
    'maintenance.beingRepaired': 'Your Scooter Is Being Repaired',
    'maintenance.expectedReady': 'Expected ready by {time}.',
    'maintenance.inMaintenance': 'Your Scooter Is In Maintenance',
    'maintenance.useTempVehicle': "Use this temporary vehicle until it's ready.",

    // --- Home hero card ---------------------------------------------------
    'hero.kycRequired.heading': 'One step to your first ride',
    'hero.kycRequired.body': 'Complete your KYC to unlock unlimited-km EV scooter rentals.',
    'hero.kycRequired.cta': 'Complete KYC',
    'hero.kycInReview.heading': "You're almost there",
    'hero.kycInReview.body': 'Your KYC is under review. Rentals unlock as soon as it is approved.',
    'hero.kycInReview.cta': 'KYC under review',
    'hero.readyToBook.heading': 'Go Green. Go Unlimited.',
    'hero.readyToBook.body': 'Unlimited kilometres on your EV scooter, one simple weekly plan.',
    'hero.readyToBook.cta': 'Book a Scooter',
    'hero.rentalCompleted.heading': 'Ready for your next ride?',
    'hero.rentalCompleted.body': 'Pick a plan and get back on an EV scooter in minutes.',
    'hero.rentalCompleted.cta': 'Book a Scooter',

    // --- Home quick links -------------------------------------------------
    'quickLinks.nearbyScooters': 'Nearby scooters',
    'quickLinks.myBookings': 'My bookings',
    'quickLinks.myPlan': 'My plan',
    'quickLinks.lockedHint': 'Unavailable while your return is being completed',

    // --- home -------------------------------------------------------------
    'home.title': 'Home',
    'home.paymentPending': 'Payment Pending',
    'home.pickupScheduled': 'Pickup Scheduled',
    'home.yourScooter': 'Your scooter',
    'home.notConfirmed': 'This booking is not confirmed yet — complete payment to secure it.',
    // Appended to the line above. Kept separate so the countdown can be
    // dropped once the hold lapses without leaving a dangling clause.
    'home.heldFor': 'Held for {duration}.',
    'home.reserved': 'Your scooter is reserved — staff will hand it over at pickup.',
    'home.willNotify': "We'll notify you the day before — staff will assign your scooter at pickup.",
    'home.completePayment': 'Complete Payment',
    'home.getDirections': 'Get Directions to Pickup',
    'home.readyToRide': 'Ready to ride?',
    'home.error.maps.title': "Can't open maps",
    'home.error.maps.message': 'No maps app could be found on this device.',
    // "24 min" / "1 hr 5 min" — assembled from parts rather than written as
    // one string, because the unit order and spacing differ by language.
    'home.duration.minutes': '{minutes} min',
    'home.duration.hoursMinutes': '{hours} hr {minutes} min',

    // --- support ----------------------------------------------------------
    'support.title': 'Support',
    'support.heading': 'How can we help?',
    'support.subheading': 'Reach our support team directly, or send us a message below.',
    'support.callSupport': 'Call Support',
    'support.emailUs': 'Email Us',
    'support.sendMessage': 'Send us a message',
    'support.subject': 'Subject',
    'support.subjectPlaceholder': "What's this about?",
    'support.description': 'Description',
    'support.descriptionPlaceholder': "Tell us what's going on...",
    'support.submitRequest': 'Submit Request',
    'support.submitted': 'Request submitted',
    'support.submittedHelp': "We'll get back to you soon — you can track its status below.",
    'support.sendAnother': 'Send another',
    'support.yourRequests': 'Your Requests',
    'support.noRequests': "You haven't submitted any requests yet.",
    'support.error.subject': 'Give your request a short subject.',
    'support.error.description': 'Tell us a bit more — at least 10 characters.',
    'support.error.submitFailed': 'Could not submit your request. Please try again.',
    'support.error.cannotOpen.title': "Can't do that",
    'support.error.cannotOpen.message': 'No app on this device can handle that action.',
    'support.needHelp': 'Need help?',
    'support.available247': "We're here to help you 24/7.",
    'support.getSupport': 'Get Support',
    'support.contactSupport': 'Contact Support',

    // --- notifications ----------------------------------------------------
    'notifications.title': 'Notifications',
    'notifications.unreadCount': '{count} unread',
    'notifications.markAllRead': 'Mark all read',
    'notifications.empty.title': 'No notifications yet',
    'notifications.empty.subtitle': "We'll let you know when something needs your attention.",
    // Fallback only, for a malformed payload. The title and body of a real
    // notification are composed by the backend and are NOT translated here —
    // see the note in src/app/notifications.tsx.
    'notifications.fallbackTitle': 'Notification',

    // --- booking history --------------------------------------------------
    'bookingHistory.title': 'Booking History',
    'bookingHistory.empty.title': 'No bookings yet',
    'bookingHistory.empty.subtitle': 'Your booking history will show up here.',
    'bookingHistory.loadFailed': 'Could not load your booking history.',
    'bookingHistory.scooterFallback': 'Scooter',
    'bookingHistory.cancelledOn': 'Cancelled {date}',
    'bookingHistory.refundLine': 'Cancellation fee {fee} · Refund {refund}',
    'bookingHistory.cancelBooking': 'Cancel Booking',
    'bookingHistory.cancelling': 'Cancelling…',

    // --- browse vehicles --------------------------------------------------
    'vehicles.title': 'Available Vehicles',
    'vehicles.searchPlaceholder': 'Search scooters',
    'vehicles.category.all': 'All',
    'vehicles.category.scooter': 'Scooter',
    'vehicles.category.bike': 'Bike',
    'vehicles.category.moped': 'Moped',
    'vehicles.empty.title': 'No scooters found',
    'vehicles.empty.subtitle': 'Try a different search or category.',
    'vehicles.availableScooters': 'Available Scooters',

    // --- status display labels --------------------------------------------
    //
    // The ENUM VALUES themselves (`pending_payment`, `RETURN_REQUESTED`,
    // `verified`, …) are machine-readable contract with the API and are never
    // translated, compared against a translated string, or round-tripped
    // through this file. These are only what a human reads in their place —
    // see constants/status.ts, which maps one to the other.
    'status.billingCycle.daily': 'Day',
    'status.billingCycle.weekly': 'Week',
    'status.billingCycle.monthly': 'Month',
    'status.billingCycle.yearly': 'Year',

    'status.kyc.not_submitted': 'Not Submitted',
    'status.kyc.pending': 'Pending',
    'status.kyc.partially_verified': 'Partly Verified',
    'status.kyc.verified': 'Verified',
    'status.kyc.rejected': 'Rejected',

    'status.docType.aadhaar': 'Aadhaar',
    'status.docType.driving_licence': 'Driving Licence',
    'status.docType.passport': 'Passport',
    'status.docType.voter_id': 'Voter ID',
    'status.docType.address_proof': 'Address Proof',

    'status.booking.pending_payment': 'Pending Payment',
    'status.booking.confirmed': 'Confirmed',
    'status.booking.fulfilled': 'Picked Up',
    'status.booking.completed': 'Completed',
    'status.booking.cancelled': 'Cancelled',
    'status.booking.expired': 'Expired',

    'status.rental.active': 'Active',
    'status.rental.completed': 'Completed',
    'status.rental.force_ended': 'Force Ended',

    'status.maintenance.reported': 'Reported',
    'status.maintenance.triaged': 'Triaged',
    'status.maintenance.in_progress': 'In Progress',
    'status.maintenance.resolved': 'Resolved',
    'status.maintenance.cancelled': 'Cancelled',

    'status.support.open': 'Open',
    'status.support.in_progress': 'In Progress',
    'status.support.resolved': 'Resolved',
    'status.support.closed': 'Closed',

    'status.refund.pending': 'Awaiting Approval',
    'status.refund.processing': 'Refund Initiated',
    'status.refund.processed': 'Refunded',
    'status.refund.not_required': 'No Refund Due',
    'status.refund.failed': 'Refund Failed',

    'status.deposit.pending': 'Pending',
    'status.deposit.held': 'Held',
    'status.deposit.released': 'Released',
    'status.deposit.forfeited': 'Forfeited',

    'status.vehicle.available': 'Available',
    'status.vehicle.reserved': 'Reserved',
    'status.vehicle.assigned': 'Assigned',
    'status.vehicle.maintenance': 'In Maintenance',
    'status.vehicle.retired': 'Retired',

    'status.station.working': 'Working',
    'status.station.not_working': 'Not working',
    'status.station.maintenance': 'Maintenance',

    'status.paymentState.paid': 'Paid',
    'status.paymentState.partial': 'Partially Paid',
    'status.paymentState.overdue': 'Due',
    'status.paymentState.unpaid': 'Due',

    'status.paymentMethod.upi': 'UPI',
    'status.paymentMethod.card': 'Card',
    'status.paymentMethod.netbanking': 'Net Banking',
    'status.paymentMethod.wallet': 'Wallet',
    'status.paymentMethod.cash': 'Cash',

    'status.planStatus.active': 'Active',
    'status.planStatus.past_due': 'Past Due',
    'status.planStatus.paused': 'Paused',
    'status.station.a11yLabel': 'Status: {status}',

    // --- station search -----------------------------------------------------
    'stationSearch.backToSearch': 'Back to search',
    'stationSearch.placeholder': 'Search station, QIS ID or area',
    'stationSearch.a11yLabel': 'Search battery stations or an area',
    'stationSearch.clearSearch': 'Clear search',
    'stationSearch.stationsNear': 'Stations near {area}',
    'stationSearch.noneNear': 'No stations found near {area}.',
    'stationSearch.stationsHeading': 'Stations',
    'stationSearch.areasHeading': 'Areas',
    'stationSearch.showNear': 'Show stations near {area}',
    'stationSearch.noMatches': 'Nothing matches "{query}".',
    'stationSearch.rowA11y': '{station}, {status}, {trailing}',

    // --- map control buttons -------------------------------------------------
    'mapControl.enableLocation': 'Enable location access',
    'mapControl.centreOnMe': 'Centre the map on my location',
    'mapControl.fitAll': 'Fit all stations on screen',
    'mapControl.notConfigured.title': 'Map not configured',
    'mapControl.notConfigured.detail':
        'Add EXPO_PUBLIC_MAP_STYLE_URL to apps/mobile/.env (see .env.example) and restart Metro with -c.',
    'mapControl.searchStillWorks': 'Search and station details still work.',
    'mapControl.unavailable.title': 'Map unavailable',
    'mapControl.unavailable.detail':
        'This build is missing the MapLibre native module. Rebuild the development client (see docs/battery-stations.md §1.4).',
    'mapControl.yourLocation': 'Your location',

    // --- station details bottom sheet ---------------------------------------
    'stationSheet.stationNumber': 'Station #{number}',
    'stationSheet.awayFrom': ' · {distance} away',
    'stationSheet.close': 'Close station details',
    'stationSheet.qisIds': 'QIS ID(s)',
    'stationSheet.latitude': 'Latitude',
    'stationSheet.longitude': 'Longitude',
    'stationSheet.navigate': 'Navigate',
    'stationSheet.navigateTo': 'Navigate to {station}',
    'stationSheet.copyCoordinates': 'Copy coordinates',
    'stationSheet.openFullDetails': 'Open full station details',
    'stationSheet.batteries': '{count} BATTERIES',

    // --- billing screen ------------------------------------------------------
    'billing.title': 'Billing',
    'billing.purpose.initial': 'Plan & Deposit',
    'billing.purpose.subscription_period': 'Plan Renewal',
    'billing.purpose.settlement': 'Return Settlement',
    'billing.purpose.adhoc': 'Payment',
    'billing.additionalCharge': 'Additional charge',
    'billing.additionalCharges': 'Additional charges',
    'billing.overdueByOne': 'Overdue by 1 day',
    'billing.overdueByOther': 'Overdue by {count} days',
    'billing.dueOn': 'Due {date}',
    'billing.lateFeeLine': 'Late fee — {days} day × ₹{rate}',
    'billing.lateFeeLineOther': 'Late fee — {days} days × ₹{rate}',
    'billing.lateFeeParenOne': 'Late fee (1 day × ₹{rate}/day)',
    'billing.lateFeeParenOther': 'Late fee ({days} days × ₹{rate}/day)',
    'billing.noPayments': 'No payments yet',
    'billing.paymentHistory': 'Payment History',
    'billing.paymentRequired': 'Payment required',
    'billing.scooterWontStart': "Your scooter won't start until this is paid.",
    'billing.totalAcross': '₹{total} total across {count} invoices',
    'billing.rentalPlanAmount': 'Rental plan amount',
    'billing.alreadyPaid': 'Already paid',
    'billing.total': 'Total',
    'billing.pay': 'Pay ₹{amount}',
    'billing.processing': 'Processing…',
    'billing.error.paymentFailed': 'Payment failed. Please try again.',
    'billing.error.rechargeFailed': 'Could not load your recharge details. Please try again.',
    'billing.error.rechargeConfirmFailed': 'Recharge failed. Please try again.',
    'billing.returnInProgress': 'Return in Progress',
    'billing.return.paymentSubmitted': 'Your payment was received — awaiting admin confirmation.',
    'billing.return.readyForApproval': 'Payment verified — our team is completing your return.',
    'billing.return.awaitingReview': 'Your return is awaiting staff review.',
    'billing.planExpired': 'Your plan has expired',
    'billing.planEndsToday': 'Your plan ends today',
    'billing.planEndsOn': 'Plan ends {date}',
    'billing.renewLateNotice': 'Renew now — a late fee applies, shown below before you pay.',
    'billing.renewOnTimeNotice': 'Renew now to keep riding without interruption. Your next plan starts the moment this one ends.',
    'billing.renewalAmount': 'Renewal amount',
    'billing.lateFeeDaysOne': 'Late fee (1 day × ₹{rate})',
    'billing.lateFeeDaysOther': 'Late fee ({days} days × ₹{rate})',
    'billing.totalPayable': 'Total payable',
    'billing.cancel': 'Cancel',
    'billing.confirmAndPay': 'Confirm & Pay ₹{amount}',
    'billing.loading': 'Loading…',
    'billing.reviewAndRenew': 'Review & Renew',
    'billing.renewalScheduled': 'Renewal scheduled — starts {date}',
    'billing.currentPlanActiveUntilThen': 'Your current plan stays active until then. No action needed.',
    'billing.allClear': 'All payments are clear — no amount due.',
    'billing.noActivePlan': 'No active plan',
    'billing.bookToSeeDetails': 'Book a scooter to see your billing details here.',
    'billing.amountDue': 'Amount Due',
    'billing.bookingPayment': 'Booking Payment',
    'billing.bookingPaymentNotCompleted':
        "Your last payment attempt didn't go through. Your reservation is still held — complete the payment to confirm your booking.",
    'billing.securityDeposit': 'Security deposit',
    'billing.currentPlan': 'Current Plan',
    'billing.rentalPlan': 'Rental Plan',
    'billing.cycleRental': '{cycle} rental',
    'billing.started': 'Started',
    'billing.ends': 'Ends',
    'billing.expired': ' · expired',
    'billing.checkoutDescription.weeklyRecharge': 'Weekly Rental — Recharge',
    'billing.checkoutDescription.scooterBooking': 'Scooter Booking',

    // --- cancel booking ------------------------------------------------------
    'cancelBooking.refundNote': "\n\nWe'll send this back to your original payment method after a quick review, generally the same day.",
    'cancelBooking.notPaidYet': "This booking hasn't been paid for yet, so there's nothing to charge or refund.",
    'cancelBooking.withPenalty':
        'You booked this {elapsed}. Cancelling now keeps back {percent}% (₹{penalty}) of the ₹{planPaid} plan amount, leaving a refund of ₹{refund}{depositNote}.{refundNote}',
    'cancelBooking.depositNote': ' (includes your ₹{amount} deposit)',
    'cancelBooking.noPenalty':
        "You booked this {elapsed}, so there's no cancellation fee. You'll be refunded ₹{refund}.{refundNote}",
    'cancelBooking.confirm.title': 'Cancel Booking?',
    'cancelBooking.confirm.confirmLabel': 'Cancel Booking',
    'cancelBooking.confirm.cancelLabel': 'Keep Booking',
    'cancelBooking.cancelled.title': 'Booking Cancelled',
    'cancelBooking.feeApplied': 'A late-cancellation fee of ₹{amount} was applied. ',
    'cancelBooking.noRefundOwed': 'No refund is owed.',
    'cancelBooking.refundComplete': 'Your refund of ₹{amount} is complete.',
    'cancelBooking.refundRequested': "Your refund of ₹{amount} has been requested — we'll notify you once it's approved and sent.",
    'cancelBooking.error.title': 'Could not cancel',
    'cancelBooking.elapsed.justNow': 'just now',
    'cancelBooking.elapsed.minAgo': '{minutes} min ago',
    'cancelBooking.elapsed.hourAgo': '1 hour ago',
    'cancelBooking.elapsed.hoursAgo': '{hours} hours ago',
    'cancelBooking.elapsed.dayAgo': '1 day ago',
    'cancelBooking.elapsed.daysAgo': '{days} days ago',

    // --- booking gate --------------------------------------------------------
    'bookingGate.alreadyRiding': "You're already on a ride",
    'bookingGate.alreadyBooked': 'You already have a booking',
    'bookingGate.activeRentalNote': 'You have an active rental. Return your scooter before booking another one.',
    'bookingGate.activeBookingNote': 'You already have a scooter booked and awaiting pickup.',
    'bookingGate.viewMyScooter': 'View My Scooter',
    'bookingGate.viewBooking': 'View Booking',
    'bookingGate.notNow': 'Not now',
    'bookingGate.activeRental': 'Active Rental',
    'bookingGate.bookingPending': 'Booking Pending',
    'bookingGate.completeKycToBook': 'Complete KYC to Book',
    'bookingGate.bookNow': 'Book Now',
    'bookingGate.completeKycFirst': 'Complete Your KYC First',
    'bookingGate.kycNeeded':
        "You need a verified KYC before you can book a scooter. It only takes a few minutes — once approved, you'll be able to book {scooter} right away.",
    'bookingGate.thisScooter': 'this scooter',
    'bookingGate.completeKyc': 'Complete KYC',

    // --- request return -------------------------------------------------------
    'requestReturn.deadline.todayByMidnight': 'today by 11:59 PM',
    'requestReturn.deadline.dateByMidnight': '{date} by 11:59 PM',
    'requestReturn.deadline.daysAgoOne': '1 day ago',
    'requestReturn.deadline.daysAgoOther': '{days} days ago',
    'requestReturn.requested.title': 'Return Requested',
    'requestReturn.requested.message': "Hand your scooter in by {deadline}. We'll confirm once our team receives it.",
    'requestReturn.error.title': 'Could not request return',

    // --- file picker -----------------------------------------------------
    'filePicker.error.unsupported.title': 'Unsupported file',
    'filePicker.error.unsupported.message': 'Upload a JPEG, PNG or PDF.',
    'filePicker.error.tooLarge.title': 'File too large',
    'filePicker.error.tooLarge.message': 'Each document must be 10 MB or smaller.',
    'filePicker.error.cameraUnavailable.title': 'Camera unavailable',
    'filePicker.error.cameraUnavailable.message': 'Allow camera access to photograph your document.',
    'filePicker.error.photosUnavailable.title': 'Photos unavailable',
    'filePicker.error.photosUnavailable.message': 'Allow photo access to pick your document.',
    'filePicker.web.uploadPdfConfirm': 'Upload a PDF file? Press Cancel to upload a photo instead.',
    'filePicker.web.takePhotoConfirm': 'Take a new photo? Press Cancel to choose an existing photo instead.',
    'filePicker.web.takePhotoConfirmGallery': 'Take a new photo? Press Cancel to choose from your files instead.',
    'filePicker.addDocument.title': 'Add document',
    'filePicker.addDocument.message': 'How would you like to provide this document?',
    'filePicker.takePhoto': 'Take Photo',
    'filePicker.choosePhoto': 'Choose Photo',
    'filePicker.browseFiles': 'Browse Files (PDF)',
    'filePicker.addPhoto.title': 'Add photo',
    'filePicker.addPhoto.message': 'How would you like to provide your photo?',
    'filePicker.chooseFromGallery': 'Choose from Gallery',

    // --- date picker field -------------------------------------------------
    'datePicker.placeholder': 'YYYY-MM-DD',
    'datePicker.openCalendar': 'Open calendar',
    'datePicker.back': 'Back',
    'datePicker.close': 'Close',
    'datePicker.selectYear': 'Select Year',

    // --- shared UI chrome --------------------------------------------------
    'ui.dismiss': 'Dismiss',
    'ui.searchPlaceholder': 'Search...',
    'ui.dismissNotification': 'Dismiss notification',
    'ui.comingSoon': 'Coming soon',
    'ui.selectPlaceholder': 'Select...',
    'ui.searchLabelFor': 'Search {field}',

    // --- vehicle documents card (placeholder) -------------------------------
    'vehicleDocs.title': 'Vehicle Documents',
    'vehicleDocs.rc': 'Registration Certificate',
    'vehicleDocs.rcHint': 'Proof the scooter is registered (RC)',
    'vehicleDocs.insurance': 'Insurance',
    'vehicleDocs.insuranceHint': 'Active third-party cover',
    'vehicleDocs.puc': 'PUC Certificate',
    'vehicleDocs.pucHint': 'Pollution Under Control',
    'vehicleDocs.footer':
        "You'll be able to view and download your scooter's documents here once our team finishes uploading them.",

    // --- app shell (header + profile sheet) ---------------------------------
    'appShell.goBack': 'Go back',
    'appShell.dayN': 'Day {day}',
    'appShell.notificationsUnread': 'Notifications, {count} unread',
    'appShell.notifications': 'Notifications',
    'appShell.profile': 'Profile',

    // --- root layout: profile load failure ----------------------------------
    'rootLayout.couldNotLoadProfile': "Couldn't load your profile",

    // --- shared error state --------------------------------------------------
    'errorState.offline': "Can't reach the server",
    'errorState.generic': 'Something went wrong',

    // --- refer & earn (currently unmounted, no schema yet) --------------------
    'referral.title': 'Refer & Earn',
    'referral.body': 'Share your code — your friend gets ₹{amount} off their first booking, and you earn a reward once they complete it.',
    'referral.share': 'Share',
    'referral.shareMessage': 'Join me on the app and get ₹{amount} off your first booking! Use my referral code {code} when you sign up.',

    // --- profile ----------------------------------------------------------
    'profile.profile': 'Profile',
    'profile.rider': 'Rider',
    'profile.changePhoto': 'Change Photo',
    'profile.changePhotoA11y': 'Change profile photo',
    'profile.uploading': 'Uploading...',
    'profile.uploadFailed': 'Upload failed',
    'profile.assignedScooter': 'Assigned Scooter',
    'profile.currentPlan': 'Current Plan',
    'profile.kycStatus': 'KYC Status',
    'profile.verifyPrompt': 'Verify your identity to unlock a scooter',
    'profile.viewFullProfile': 'View full profile',
    'profile.menu.kyc': 'KYC Verification',
    'profile.menu.support': 'Support',
    'profile.menu.privacy': 'Privacy & Data',
    'profile.menu.terms': 'Terms & Conditions',
    'profile.menu.howItWorks': 'How Swapngo Works',

    // --- profile setup (first-run) -----------------------------------------
    'profileSetup.title': 'Complete your profile and get ready to ride.',
    'profileSetup.subtitle': 'A few details so we can set your account up properly. You can always update these later.',
    'profileSetup.fullName': 'Full Name',
    'profileSetup.fullNamePlaceholder': 'Full name',
    'profileSetup.email': 'Email',
    'profileSetup.emailPlaceholder': 'Email',
    'profileSetup.phone': 'Phone',
    'profileSetup.phonePlaceholder': 'Phone',
    'profileSetup.phoneHint': 'Indian numbers can be typed without +91.',
    'profileSetup.dob': 'Date of Birth',
    'profileSetup.dobHint': 'You must be at least 18 to ride.',
    'profileSetup.gender': 'Gender',
    'profileSetup.gender.male': 'Male',
    'profileSetup.gender.female': 'Female',
    'profileSetup.gender.other': 'Other',
    'profileSetup.gender.preferNotToSay': 'Prefer not to say',
    'profileSetup.address': 'Address',
    'profileSetup.addressPlaceholder': 'Address',
    'profileSetup.city': 'City',
    'profileSetup.cityPlaceholder': 'City',
    'profileSetup.state': 'State',
    'profileSetup.statePlaceholder': 'Select state',
    'profileSetup.postalCode': 'Postal Code',
    'profileSetup.postalCodePlaceholder': 'Postal code',
    'profileSetup.error.fullName': 'Please enter your full name.',
    'profileSetup.error.fullNameChars':
        'Full name can only contain letters, spaces, apostrophes and hyphens.',
    'profileSetup.error.email': 'Enter a valid email address.',
    'profileSetup.error.phone': 'Enter a valid phone number, e.g. 98765 43210.',
    'profileSetup.error.gender': 'Select a gender.',
    'profileSetup.error.address': 'Fill in your full address.',
    'profileSetup.error.dob': 'Use YYYY-MM-DD; you must be at least 18.',
    'profileSetup.error.save': 'Could not save your profile. Please try again.',

    // --- return scooter modal ----------------------------------------------
    'returnReason.plan_ended': 'My plan ended',
    'returnReason.switching_plan': 'Switching plan',
    'returnReason.scooter_issue': 'Problem with the scooter',
    'returnReason.moving_away': 'Moving away',
    'returnReason.too_expensive': 'Too expensive',
    'returnReason.other': 'Something else',
    'returnModal.title': 'Return Scooter',
    'returnModal.reasonLabel': 'Why are you returning?',
    'returnModal.feedbackLabel': "Anything you'd like us to know?",
    'returnModal.feedbackPlaceholder': 'Tell us how the ride went',
    'returnModal.ratingLabel': 'Rate your ride',
    'returnModal.policyNote':
        'Your request will be processed as per our return policy. The rental stays active — and the scooter stays yours — until our team confirms the physical handover at the station. Nothing is charged now; payment collection goes live in a later update. Need to change this afterwards? Contact support.',
    'returnModal.submit': 'Request Return',
    'returnModal.error.reason': 'Pick a reason.',
    'returnModal.error.rating': 'Rate your ride.',
    'returnModal.error.feedback': 'Tell us a bit more.',

    // --- nominee screen ------------------------------------------------------
    'nominee.saved.title': 'Nominee saved',
    'nominee.form.name': 'Their name',
    'nominee.form.namePlaceholder': 'Full name',
    'nominee.form.relationship': 'Their relationship to you',
    'nominee.form.relationshipPlaceholder': 'Relationship',
    'nominee.form.phone': 'Their phone number',
    'nominee.form.phonePlaceholder': 'Phone number',
    'nominee.form.email': 'Their email (optional)',
    'nominee.form.emailPlaceholder': 'Email',
    'nominee.remove': 'Remove my nominee',
    'nominee.removeConfirm.title': 'Remove your nominee?',
    'nominee.removeConfirm.message': 'Nobody will be able to act on your behalf until you name someone else.',
    'nominee.removed.title': 'Nominee removed',
    'nominee.error.load': 'Could not load your nominee.',
    'nominee.error.save': 'Could not save',
    'nominee.error.remove': 'Could not remove',

    // --- privacy request detail --------------------------------------------
    'requestDetail.loadFailed': 'Could not load that request.',
    'requestDetail.cancelConfirm.message': 'We will stop working on this request.',
    'requestDetail.error.cancel': 'Could not cancel',
    'requestDetail.status': 'Status',
    'requestDetail.raised': 'Raised',
    'requestDetail.respondBy': 'We will respond by',
    'requestDetail.closed': 'Closed',
    'requestDetail.cancelUntil': 'You can still cancel until',
    'requestDetail.whatYouToldUs': 'What you told us',
    'requestDetail.whatYouAskedUsToCorrect': 'What you asked us to correct',
    'requestDetail.ourResponse': 'Our response',
    'requestDetail.whyNot': 'Why we could not do this',

    // --- sign in ----------------------------------------------------------
    'auth.tagline': 'Sign in with your mobile number to start riding.',
    'auth.mobileNumber': 'Mobile Number',
    'auth.mobileNumberPlaceholder': 'Mobile number',
    'auth.otpHint': "We'll text you a 6-digit code. Indian numbers can be typed without +91.",
    'auth.sendCode': 'Send Code',
    'auth.or': 'or',
    'auth.continueWithGoogle': 'Continue with Google',
    'auth.openingGoogle': 'Opening Google sign-in...',
    'auth.googleRecoveryHint': 'Changed your number? Use Google to get back into your account.',
    'auth.legalNote': 'By continuing you agree to our Terms and acknowledge our Privacy Policy.',
    'auth.error.invalidPhone': 'Enter a valid mobile number.',
    'auth.error.sendFailed': 'Could not send the code. Please try again.',
    'auth.error.googleFailed': 'Google sign-in failed. Please try again.',
    'auth.goBack': 'Go back',
    'auth.signOut': 'Sign out',
    'auth.logout': 'Logout',

    // --- onboarding carousel ----------------------------------------------
    'onboarding.slide1.title': 'Find Your EV. Book in Seconds.',
    'onboarding.slide1.body':
        'Discover available Swapngo electric scooters near you, choose your preferred vehicle, and book it directly from the app.',
    'onboarding.slide2.title': 'Ride More. Swap Anytime.',
    'onboarding.slide2.body':
        'Enjoy your ride without worrying about charging. When the battery is low, find a nearby Swapngo battery swapping station and swap the battery quickly.',
    'onboarding.slide3.title': 'Everything You Need in One App',
    'onboarding.slide3.body':
        'Manage your rental, view your scooter, track your rides, check payments, find swap stations, and get support — all from one app.',
    'onboarding.getStarted': 'Get Started',

    // --- KYC intro --------------------------------------------------------
    'kycIntro.title': 'Verify your identity to unlock vehicle rentals',
    'kycIntro.body':
        'A quick identity check keeps every ride safer for you and other riders. You will need a photo of yourself, an emergency contact, your Aadhaar number and your driving licence.',
    'kycIntro.duration': 'Takes about 5 minutes. You can save your progress and finish it anytime.',
    'kycIntro.skip': 'Skip for Now',
    'kycIntro.skipConfirm.title': 'Skip KYC for now?',
    'kycIntro.skipConfirm.message':
        'You can still browse the app, but you will need to complete KYC before renting a scooter.',

    // --- OTP --------------------------------------------------------------
    'otp.title': 'Enter verification code',
    'otp.sentTo': 'Sent to {phone}.',
    'otp.yourNumber': 'your number',
    'otp.inputLabel': '6 digit verification code',
    'otp.verify': 'Verify',
    'otp.resendIn': 'Resend code in {seconds}s',
    'otp.resend': 'Resend code',
    'otp.error.invalid': 'Enter the 6-digit code.',
    'otp.error.verifyFailed': 'Could not verify the code. Please try again.',
    'otp.error.resendFailed': 'Could not resend the code.',

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
    // Reworded to cover the privacy notice ONLY. It previously said "the terms
    // and conditions", which the app neither showed the rider nor recorded —
    // a declaration about a document that did not exist on any screen. The
    // Terms now have their own document, their own checkbox below, and their
    // own acceptance record.
    'consent.confirmDeclaration': 'I confirm that I have read and understood the privacy notice.',
    'consent.accept': 'Agree & Continue',
    'consent.saving': 'Saving your choices...',
    'consent.error': 'We could not save your choices. Please try again.',
    'consent.stale':
        'Our privacy notice has been updated since you opened this screen. Please read it again and choose.',
    'consent.grantedOn': 'Consent for identity verification given on {date}',
    'consent.manage': 'Manage',

    // --- Terms & Conditions -----------------------------------------------
    // A separate legal act from consent above: consent is the lawful basis
    // for processing data, these form the rental contract that makes a late
    // fee, damage charge or deposit deduction collectable.
    'terms.title': 'Terms & Conditions',
    'terms.version': 'Version {version}, effective {date}',
    'terms.readTerms': 'Read the full Terms & Conditions',
    'terms.agree': 'I have read and agree to the Terms & Conditions.',
    // Shown until the rider has actually opened the document. The checkbox
    // stays disabled until then, so "I have read" is not a claim the app
    // invited them to make without ever showing them anything.
    'terms.openFirst': 'Open the Terms & Conditions above before you agree.',
    'terms.acceptedOn': 'You accepted version {version} on {date}.',
    'terms.englishOnly':
        'Shown in English. A reviewed Tamil translation is not available yet — ask our support team if anything is unclear.',
    'terms.stale':
        'Our Terms have been updated since you opened this screen. Please read them again and accept.',

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
    'privacy.loadFailed': 'Could not load your privacy settings.',
    'privacySummary.loadFailed': 'Could not load your data summary.',
    'notice.loadFailed': 'Could not load the privacy notice.',

    // --- privacy rights requests screen -------------------------------------
    'correctable.full_name': 'My name',
    'correctable.date_of_birth': 'My date of birth',
    'correctable.aadhaar_details': 'My Aadhaar details',
    'correctable.driving_licence_details': 'My licence details',
    'correctable.other': 'Something else',
    'requestsScreen.whatIsWrong': 'What is wrong?',
    'requestsScreen.whatShouldItBe': 'What should it be?',
    'requestsScreen.correctPlaceholder': 'The correct detail',
    'requestsScreen.error.sendFailed': 'Could not send your request',
    'requestsScreen.received.title': 'Request received',

    // --- booking screen ------------------------------------------------------
    'booking.trust.securePayment': 'Secure payment',
    'booking.trust.instantRefunds': 'Instant refunds',
    'booking.trust.razorpay': 'Razorpay',
    'booking.paymentMethods.title': 'Payment method',
    'booking.paymentMethods.upi': 'UPI',
    'booking.paymentMethods.upiSubtitle': 'GPay · PhonePe · Paytm',
    'booking.paymentMethods.cards': 'Cards',
    'booking.paymentMethods.cardsSubtitle': 'Visa · Mastercard · RuPay',
    'booking.paymentMethods.netBanking': 'Net Banking',
    'booking.paymentMethods.netBankingSubtitle': 'All major banks',
    'booking.paymentMethods.wallets': 'Wallets',
    'booking.paymentMethods.walletsSubtitle': 'Paytm · PhonePe · Mobikwik',
    'booking.paymentMethods.chooseOnRazorpay': 'Choose on the secure Razorpay screen',
    'booking.error.loadModel': 'Could not load this scooter.',
    'booking.error.modelNotFound': 'This scooter could not be found.',
    'booking.blocked.findingStation': 'Finding a pickup station near you…',
    'booking.blocked.noneAvailable': 'No scooters free at this station right now',
    'booking.blocked.noPlans': 'No plans on sale for this scooter',
    'booking.blocked.choosePlan': 'Choose a rental plan',
    'booking.error.maps.title': "Can't open maps",
    'booking.error.maps.message': 'No maps app could be found on this device.',
    'booking.almostThere': 'Almost there',
    'booking.error.paymentCancelled': 'Payment cancelled. Tap Pay to try again.',
    'booking.error.generic': 'Something went wrong. Please try again.',
    'booking.checkoutDescription': '{plan} — rental + deposit',
    'booking.checkoutDescriptionFallback': 'Scooter rental',
    'booking.confirmed.title': 'Booking Confirmed',
    'booking.confirmed.body':
        'Payment successful. Your plan starts now — head to {station} right away to collect your {scooter}.',
    'booking.confirmed.yourPickupStation': 'your pickup station',
    'booking.confirmed.yourScooter': 'scooter',
    'booking.confirmed.done': 'Done',
    'booking.confirmAndPay': 'Confirm & Pay',
    'booking.bookScooter': 'Book {scooter}',
    'booking.pickupLocation': 'Pickup location',
    'booking.getDirections': 'Get directions',
    'booking.checkingAvailability': 'Checking availability…',
    'booking.availableHere': '{count} available here',
    'booking.unavailable': 'Unavailable',
    'booking.available': 'Available',
    'booking.startsNow.title': 'Your plan starts right now',
    'booking.startsNow.body':
        'Once you pay, head straight to the pickup station and collect your scooter today. Pickup 8 AM – 8 PM.',
    'booking.choosePlan': 'Choose a plan',
    'booking.choosePlanHint': 'Pick how long you want the scooter for.',
    'booking.noPlansHint': 'No plans are on sale for this scooter yet.',
    'booking.minutesIncluded': '{minutes} minutes included',
    'booking.dealApplied': 'Deal applied',
    'booking.youSave': 'You save {amount} on this booking',
    'booking.paymentSummary': 'Payment summary',
    'booking.startsToday': 'today',
    'booking.startsOn': 'Starts {date}',
    'booking.rentalPlanAmount': 'Rental plan amount',
    'booking.securityDepositRefundable': 'Security deposit (refundable)',
    'booking.totalPayable': 'Total Payable',
    'booking.estimatedTotal': 'Estimated Total',
    'booking.confirmedOnPaymentScreen': 'Confirmed on the payment screen',
    'booking.cancellationNote':
        'Cancel within {minutes} min of booking and {percent}% of the plan amount is kept back; the fee rises the longer you wait. Your security deposit is always refunded in full.',
    'booking.amount': 'Amount',
    'booking.processing': 'Processing…',
    'booking.continue': 'Continue',

    // --- battery stations map --------------------------------------------
    'stations.goBack': 'Go back',
    'stations.error.load': 'Could not load battery stations.',
    'stations.dismissLocationNotice': 'Dismiss location permission notice',
    'stations.locationOff':
        "Location is off — stations still show, but distances don't. Tap the location button to allow it.",
    'stations.nearest': 'Nearest station {name} — {distance} away',
    'stations.nearestLine': 'Nearest station: {name} — {distance}',
    'stations.refresh': 'Refresh stations',
    'stations.zoomIn': 'Zoom in',
    'stations.zoomOut': 'Zoom out',
    'stations.empty.title': 'No battery stations available yet',
    'stations.empty.subtitle': 'Pull the refresh button once your admin publishes them.',
    'stations.loading': 'Loading battery stations…',
    'stations.error.noNavApp.title': 'No navigation app found',
    'stations.error.noNavApp.message': 'Install a maps app, or use the coordinates: {coordinates}',
    'stations.coordinatesCopied': 'Coordinates copied',
    'stations.error.copyFailed': 'Could not copy',

    // --- battery station details -------------------------------------------
    'stationDetail.goBack': 'Go back',
    'stationDetail.serialNumber': 'Serial number',
    'stationDetail.qisIds': 'QIS ID(s)',
    'stationDetail.latitude': 'Latitude',
    'stationDetail.longitude': 'Longitude',
    'stationDetail.navigate': 'Navigate to station',
    'stationDetail.copyCoordinates': 'Copy coordinates',
    'stationDetail.title': 'Station details',
    'stationDetail.error.loadFailed': 'This station is no longer available.',
    'stationDetail.batteries': '{count} BATTERIES',
    'stationDetail.coordinatesLabel': 'Coordinates',
    'stationDetail.navigateTo': 'Navigate to {station}',
    'stationDetail.error.noNavApp.title': 'No navigation app found',
    'stationDetail.error.noNavApp.message': 'Copy the coordinates and open them in a maps app.',
    'stationDetail.error.copyFailed': 'Could not copy',
    'stationDetail.copied': '{label} copied',

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
