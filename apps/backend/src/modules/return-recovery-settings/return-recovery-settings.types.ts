export interface ReturnRecoverySettingsRow {
    id: string;
    max_late_fee_days: number;
    updated_at: string | null;
}

export interface UpdateReturnRecoverySettingsInput {
    max_late_fee_days: number;
}
