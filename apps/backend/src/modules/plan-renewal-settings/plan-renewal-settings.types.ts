export interface PlanRenewalSettingsRow {
    id: string;
    late_fee_enabled: boolean;
    late_fee_amount: number;
    updated_at: string | null;
}

export interface UpdatePlanRenewalSettingsInput {
    late_fee_enabled: boolean;
    late_fee_amount: number;
}
