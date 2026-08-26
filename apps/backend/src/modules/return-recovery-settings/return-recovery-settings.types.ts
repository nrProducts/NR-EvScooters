export interface ReturnRecoverySettingsRow {
    id: string;
    max_late_fee_days: number;
    /** Resolved live from the same global late-fee rate as renewals — see returns-recovery-settings.service.ts. Not admin-settable here. */
    late_fee_per_day: number;
    updated_at: string | null;
}

export interface UpdateReturnRecoverySettingsInput {
    max_late_fee_days: number;
}
