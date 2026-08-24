export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          request_context: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          request_context?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          request_context?: Json | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_cancellations: {
        Row: {
          booking_id: string
          cancelled_at: string
          cancelled_by_user_id: string | null
          created_at: string
          penalty_amount: number
          reason: string | null
          refund_id: string | null
        }
        Insert: {
          booking_id: string
          cancelled_at?: string
          cancelled_by_user_id?: string | null
          created_at?: string
          penalty_amount?: number
          reason?: string | null
          refund_id?: string | null
        }
        Update: {
          booking_id?: string
          cancelled_at?: string
          cancelled_by_user_id?: string | null
          created_at?: string
          penalty_amount?: number
          reason?: string | null
          refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          deposit_amount_snapshot: number
          duration_days_snapshot: number
          held_vehicle_id: string | null
          hold_expires_at: string | null
          hub_id: string
          id: string
          plan_id: string
          plan_price_snapshot: number
          requested_start_on: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deposit_amount_snapshot: number
          duration_days_snapshot: number
          held_vehicle_id?: string | null
          hold_expires_at?: string | null
          hub_id: string
          id?: string
          plan_id: string
          plan_price_snapshot: number
          requested_start_on: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deposit_amount_snapshot?: number
          duration_days_snapshot?: number
          held_vehicle_id?: string | null
          hold_expires_at?: string | null
          hub_id?: string
          id?: string
          plan_id?: string
          plan_price_snapshot?: number
          requested_start_on?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_held_vehicle_id_fkey"
            columns: ["held_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_notices: {
        Row: {
          body_en: string
          body_sha256: string
          body_ta: string
          created_at: string
          created_by_user_id: string | null
          effective_from: string
          id: string
          purposes: Database["public"]["Enums"]["consent_purpose"][]
          retired_at: string | null
          version: string
        }
        Insert: {
          body_en: string
          body_sha256: string
          body_ta: string
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string
          id?: string
          purposes: Database["public"]["Enums"]["consent_purpose"][]
          retired_at?: string | null
          version: string
        }
        Update: {
          body_en?: string
          body_sha256?: string
          body_ta?: string
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string
          id?: string
          purposes?: Database["public"]["Enums"]["consent_purpose"][]
          retired_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_notices_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"]
          actor_user_id: string | null
          consent_notice_id: string
          created_at: string
          device_id: string | null
          id: string
          ip_address: unknown
          language: string
          notice_version_snapshot: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          source: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["consent_action"]
          actor_user_id?: string | null
          consent_notice_id: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          language?: string
          notice_version_snapshot: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          source?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["consent_action"]
          actor_user_id?: string | null
          consent_notice_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          language?: string
          notice_version_snapshot?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          source?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_consent_notice_id_fkey"
            columns: ["consent_notice_id"]
            isOneToOne: false
            referencedRelation: "consent_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_disputes: {
        Row: {
          amount_held: number
          created_at: string
          damage_id: string
          outcome: Database["public"]["Enums"]["dispute_outcome"] | null
          raised_at: string
          raised_by_user_id: string | null
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount_held: number
          created_at?: string
          damage_id: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"] | null
          raised_at?: string
          raised_by_user_id?: string | null
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_held?: number
          created_at?: string
          damage_id?: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"] | null
          raised_at?: string
          raised_by_user_id?: string | null
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_disputes_damage_id_fkey"
            columns: ["damage_id"]
            isOneToOne: true
            referencedRelation: "damages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_disputes_raised_by_user_id_fkey"
            columns: ["raised_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_disputes_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      damages: {
        Row: {
          assessed_amount: number
          assessed_at: string
          assessed_by_user_id: string | null
          created_at: string
          id: string
          incident_id: string
          notes: string | null
          status: Database["public"]["Enums"]["damage_status"]
          updated_at: string | null
        }
        Insert: {
          assessed_amount: number
          assessed_at?: string
          assessed_by_user_id?: string | null
          created_at?: string
          id?: string
          incident_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["damage_status"]
          updated_at?: string | null
        }
        Update: {
          assessed_amount?: number
          assessed_at?: string
          assessed_by_user_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["damage_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damages_assessed_by_user_id_fkey"
            columns: ["assessed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      data_principal_requests: {
        Row: {
          assigned_to_user_id: string | null
          channel: string
          completed_at: string | null
          created_at: string
          details: string | null
          export_storage_path: string | null
          grace_ends_at: string | null
          id: string
          reference: string
          rejection_reason: string | null
          request_type: Database["public"]["Enums"]["dp_request_type"]
          requested_changes: Json | null
          resolution_notes: string | null
          sla_due_at: string
          status: Database["public"]["Enums"]["dp_request_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          details?: string | null
          export_storage_path?: string | null
          grace_ends_at?: string | null
          id?: string
          reference: string
          rejection_reason?: string | null
          request_type: Database["public"]["Enums"]["dp_request_type"]
          requested_changes?: Json | null
          resolution_notes?: string | null
          sla_due_at: string
          status?: Database["public"]["Enums"]["dp_request_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          details?: string | null
          export_storage_path?: string | null
          grace_ends_at?: string | null
          id?: string
          reference?: string
          rejection_reason?: string | null
          request_type?: Database["public"]["Enums"]["dp_request_type"]
          requested_changes?: Json | null
          resolution_notes?: string | null
          sla_due_at?: string
          status?: Database["public"]["Enums"]["dp_request_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_principal_requests_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_principal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          created_at: string
          forfeit_reason: string | null
          forfeited_at: string | null
          held_at: string | null
          id: string
          refund_eligible_on: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          forfeit_reason?: string | null
          forfeited_at?: string | null
          held_at?: string | null
          id?: string
          refund_eligible_on?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          forfeit_reason?: string | null
          forfeited_at?: string | null
          held_at?: string | null
          id?: string
          refund_eligible_on?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: true
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: true
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          description: string | null
          holiday_date: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          holiday_date: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          holiday_date?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hubs: {
        Row: {
          address_line: string | null
          city: string | null
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          latitude: number | null
          location: unknown
          longitude: number | null
          name: string
          postal_code: string | null
          updated_at: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location: unknown
          longitude?: number | null
          name: string
          postal_code?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name?: string
          postal_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          created_at: string
          description: string
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          occurred_at: string | null
          photo_paths: string[]
          rental_id: string | null
          reported_at: string
          reported_by_user_id: string | null
          status: Database["public"]["Enums"]["incident_status"]
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          occurred_at?: string | null
          photo_paths?: string[]
          rental_id?: string | null
          reported_at?: string
          reported_by_user_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          occurred_at?: string | null
          photo_paths?: string[]
          rental_id?: string | null
          reported_at?: string
          reported_by_user_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_user_id_fkey"
            columns: ["reported_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          line_number: number
          quantity: number
          subscription_adjustment_id: string | null
          unit_amount: number
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          line_number: number
          quantity?: number
          subscription_adjustment_id?: string | null
          unit_amount: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          line_number?: number
          quantity?: number
          subscription_adjustment_id?: string | null
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_subscription_adjustment_id_fkey"
            columns: ["subscription_adjustment_id"]
            isOneToOne: false
            referencedRelation: "subscription_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          code: string
          created_at: string
          financial_year: string
          is_active: boolean
          last_number: number
          prefix: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          financial_year: string
          is_active?: boolean
          last_number?: number
          prefix: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          financial_year?: string
          is_active?: boolean
          last_number?: number
          prefix?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          due_on: string | null
          id: string
          invoice_number: string
          invoice_series_code: string
          issued_on: string | null
          purpose: Database["public"]["Enums"]["invoice_purpose"]
          rental_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          subscription_period_id: string | null
          subtotal_amount: number
          total_amount: number
          updated_at: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          invoice_number: string
          invoice_series_code: string
          issued_on?: string | null
          purpose: Database["public"]["Enums"]["invoice_purpose"]
          rental_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string
          subscription_period_id?: string | null
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          invoice_number?: string
          invoice_series_code?: string
          issued_on?: string | null
          purpose?: Database["public"]["Enums"]["invoice_purpose"]
          rental_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string
          subscription_period_id?: string | null
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_invoice_series_code_fkey"
            columns: ["invoice_series_code"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invoices_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "invoices_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "subscription_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_period_id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          back_storage_path: string | null
          created_at: string
          document_number_encrypted: string | null
          document_number_hmac: string | null
          document_number_last4: string | null
          document_type: Database["public"]["Enums"]["kyc_document_type"]
          encryption_key_version: number | null
          expires_on: string | null
          front_storage_path: string
          id: string
          issued_on: string | null
          rejection_reason: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          back_storage_path?: string | null
          created_at?: string
          document_number_encrypted?: string | null
          document_number_hmac?: string | null
          document_number_last4?: string | null
          document_type: Database["public"]["Enums"]["kyc_document_type"]
          encryption_key_version?: number | null
          expires_on?: string | null
          front_storage_path: string
          id?: string
          issued_on?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          back_storage_path?: string | null
          created_at?: string
          document_number_encrypted?: string | null
          document_number_hmac?: string | null
          document_number_last4?: string | null
          document_type?: Database["public"]["Enums"]["kyc_document_type"]
          encryption_key_version?: number | null
          expires_on?: string | null
          front_storage_path?: string
          id?: string
          issued_on?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_verified_by_user_id_fkey"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days: number
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_quota_days: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          annual_quota_days: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          annual_quota_days?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_tickets: {
        Row: {
          cost_amount: number | null
          created_at: string
          description: string
          expected_ready_at: string | null
          id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          outcome: Database["public"]["Enums"]["maintenance_outcome"] | null
          reported_at: string
          reported_by_user_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          triaged_at: string | null
          triaged_by_user_id: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          cost_amount?: number | null
          created_at?: string
          description: string
          expected_ready_at?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          outcome?: Database["public"]["Enums"]["maintenance_outcome"] | null
          reported_at?: string
          reported_by_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          triaged_at?: string | null
          triaged_by_user_id?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          cost_amount?: number | null
          created_at?: string
          description?: string
          expected_ready_at?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          outcome?: Database["public"]["Enums"]["maintenance_outcome"] | null
          reported_at?: string
          reported_by_user_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          triaged_at?: string | null
          triaged_by_user_id?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_reported_by_user_id_fkey"
            columns: ["reported_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_triaged_by_user_id_fkey"
            columns: ["triaged_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error: string | null
          id: string
          notification_message_id: string
          provider: string | null
          provider_ref: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          notification_message_id: string
          provider?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          notification_message_id?: string
          provider?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_message_id_fkey"
            columns: ["notification_message_id"]
            isOneToOne: false
            referencedRelation: "notification_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          created_at: string
          id: string
          notification_type_code: string
          occurred_at: string
          payload: Json | null
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_type_code: string
          occurred_at?: string
          payload?: Json | null
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_type_code?: string
          occurred_at?: string
          payload?: Json | null
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_notification_type_code_fkey"
            columns: ["notification_type_code"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
        ]
      }
      notification_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          notification_event_id: string
          notification_type_code: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          notification_event_id: string
          notification_type_code: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          notification_event_id?: string
          notification_type_code?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_messages_notification_event_id_fkey"
            columns: ["notification_event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_messages_notification_type_code_fkey"
            columns: ["notification_type_code"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "notification_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscribers: {
        Row: {
          created_at: string
          notification_type_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notification_type_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          notification_type_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscribers_notification_type_code_fkey"
            columns: ["notification_type_code"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "notification_subscribers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_types: {
        Row: {
          action_path: string | null
          code: string
          created_at: string
          default_audience: Database["public"]["Enums"]["notification_audience"]
          description: string | null
          is_enabled: boolean
          label: string
          requires_action: boolean
          send_email: boolean
          send_in_app: boolean
          send_push: boolean
          updated_at: string | null
        }
        Insert: {
          action_path?: string | null
          code: string
          created_at?: string
          default_audience?: Database["public"]["Enums"]["notification_audience"]
          description?: string | null
          is_enabled?: boolean
          label: string
          requires_action?: boolean
          send_email?: boolean
          send_in_app?: boolean
          send_push?: boolean
          updated_at?: string | null
        }
        Update: {
          action_path?: string | null
          code?: string
          created_at?: string
          default_audience?: Database["public"]["Enums"]["notification_audience"]
          description?: string | null
          is_enabled?: boolean
          label?: string
          requires_action?: boolean
          send_email?: boolean
          send_in_app?: boolean
          send_push?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          allocated_at: string
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_transaction_id: string
        }
        Insert: {
          allocated_at?: string
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_transaction_id: string
        }
        Update: {
          allocated_at?: string
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount: number
          created_at: string
          currency: string
          expires_at: string | null
          gateway: string
          gateway_order_id: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          status: Database["public"]["Enums"]["payment_order_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          gateway?: string
          gateway_order_id?: string | null
          id?: string
          idempotency_key: string
          invoice_id: string
          status?: Database["public"]["Enums"]["payment_order_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          gateway?: string
          gateway_order_id?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string
          status?: Database["public"]["Enums"]["payment_order_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          captured_at: string | null
          created_at: string
          failure_code: string | null
          failure_reason: string | null
          gateway_payment_id: string
          gateway_signature: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          payment_order_id: string
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          captured_at?: string | null
          created_at?: string
          failure_code?: string | null
          failure_reason?: string | null
          gateway_payment_id: string
          gateway_signature?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          payment_order_id: string
          raw_payload?: Json | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          captured_at?: string | null
          created_at?: string
          failure_code?: string | null
          failure_reason?: string | null
          gateway_payment_id?: string
          gateway_signature?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          payment_order_id?: string
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          event_type: string
          gateway: string
          gateway_event_id: string
          id: string
          is_signature_valid: boolean
          payload: Json
          processed_at: string | null
          processing_attempts: number
          processing_error: string | null
          received_at: string
        }
        Insert: {
          event_type: string
          gateway?: string
          gateway_event_id: string
          id?: string
          is_signature_valid: boolean
          payload: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          event_type?: string
          gateway?: string
          gateway_event_id?: string
          id?: string
          is_signature_valid?: boolean
          payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      permission_profile_permissions: {
        Row: {
          created_at: string
          permission_id: string
          permission_profile_code: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          permission_profile_code: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          permission_profile_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_profile_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_profile_permissions_permission_profile_code_fkey"
            columns: ["permission_profile_code"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["code"]
          },
        ]
      }
      permission_profiles: {
        Row: {
          code: string
          created_at: string
          description: string
          is_system: boolean
          label: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          is_system?: boolean
          label: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          is_system?: boolean
          label?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          is_enforced: boolean
          label: string
          module_key: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          is_enforced?: boolean
          label: string
          module_key: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enforced?: boolean
          label?: string
          module_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      pii_access_log: {
        Row: {
          actor_role_snapshot: Database["public"]["Enums"]["user_role"]
          actor_user_id: string | null
          context_ref: string | null
          created_at: string
          fields: string[] | null
          id: string
          ip_address: unknown
          reason: Database["public"]["Enums"]["pii_access_reason"]
          request_path: string | null
          resource: string
          resource_id: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_role_snapshot: Database["public"]["Enums"]["user_role"]
          actor_user_id?: string | null
          context_ref?: string | null
          created_at?: string
          fields?: string[] | null
          id?: string
          ip_address?: unknown
          reason?: Database["public"]["Enums"]["pii_access_reason"]
          request_path?: string | null
          resource: string
          resource_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_role_snapshot?: Database["public"]["Enums"]["user_role"]
          actor_user_id?: string | null
          context_ref?: string | null
          created_at?: string
          fields?: string[] | null
          id?: string
          ip_address?: unknown
          reason?: Database["public"]["Enums"]["pii_access_reason"]
          request_path?: string | null
          resource?: string
          resource_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_access_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pii_access_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: Database["public"]["Enums"]["billing_period"]
          created_at: string
          deleted_at: string | null
          deposit_amount: number
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price_amount: number
          updated_at: string | null
          vehicle_model_id: string
        }
        Insert: {
          billing_period: Database["public"]["Enums"]["billing_period"]
          created_at?: string
          deleted_at?: string | null
          deposit_amount: number
          duration_days: number
          id?: string
          is_active?: boolean
          name: string
          price_amount: number
          updated_at?: string | null
          vehicle_model_id: string
        }
        Update: {
          billing_period?: Database["public"]["Enums"]["billing_period"]
          created_at?: string
          deleted_at?: string | null
          deposit_amount?: number
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price_amount?: number
          updated_at?: string | null
          vehicle_model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          amount: number
          amount_type: Database["public"]["Enums"]["amount_type"]
          auto_apply: boolean
          code: string
          created_at: string
          created_by_user_id: string | null
          description: string | null
          effective_from: string
          effective_to: string | null
          frequency: Database["public"]["Enums"]["rule_frequency"]
          frequency_n: number | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["pricing_rule_kind"]
          name: string
          scope: Database["public"]["Enums"]["rule_scope"]
          scope_ref_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          amount_type?: Database["public"]["Enums"]["amount_type"]
          auto_apply?: boolean
          code: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          frequency: Database["public"]["Enums"]["rule_frequency"]
          frequency_n?: number | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["pricing_rule_kind"]
          name: string
          scope?: Database["public"]["Enums"]["rule_scope"]
          scope_ref_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          amount_type?: Database["public"]["Enums"]["amount_type"]
          auto_apply?: boolean
          code?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          frequency?: Database["public"]["Enums"]["rule_frequency"]
          frequency_n?: number | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["pricing_rule_kind"]
          name?: string
          scope?: Database["public"]["Enums"]["rule_scope"]
          scope_ref_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          attempt_count: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          gateway_refund_id: string | null
          id: string
          initiated_at: string
          last_attempted_at: string | null
          payment_transaction_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          gateway_refund_id?: string | null
          id?: string
          initiated_at?: string
          last_attempted_at?: string | null
          payment_transaction_id: string
          reason: Database["public"]["Enums"]["refund_reason"]
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          gateway_refund_id?: string | null
          id?: string
          initiated_at?: string
          last_attempted_at?: string | null
          payment_transaction_id?: string
          reason?: Database["public"]["Enums"]["refund_reason"]
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_feedback: {
        Row: {
          comment: string | null
          created_at: string
          rating: number
          rental_id: string
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          rating: number
          rental_id: string
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          rating?: number
          rental_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_feedback_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: true
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_returns: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          created_at: string
          due_back_at: string
          inspected_at: string | null
          inspected_by_user_id: string | null
          inspection_notes: string | null
          rejected_at: string | null
          rejected_by_user_id: string | null
          rejection_reason: string | null
          rental_id: string
          requested_at: string
          requested_reason: string | null
          rider_notes: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          due_back_at: string
          inspected_at?: string | null
          inspected_by_user_id?: string | null
          inspection_notes?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          rejection_reason?: string | null
          rental_id: string
          requested_at?: string
          requested_reason?: string | null
          rider_notes?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          due_back_at?: string
          inspected_at?: string | null
          inspected_by_user_id?: string | null
          inspection_notes?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          rejection_reason?: string | null
          rental_id?: string
          requested_at?: string
          requested_reason?: string | null
          rider_notes?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_returns_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_returns_inspected_by_user_id_fkey"
            columns: ["inspected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_returns_rejected_by_user_id_fkey"
            columns: ["rejected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_returns_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: true
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_settlements: {
        Row: {
          created_at: string
          damage_amount: number
          deposit_amount_snapshot: number
          invoice_id: string | null
          late_fee_amount: number
          net_amount: number
          other_charges_amount: number
          outcome: Database["public"]["Enums"]["settlement_outcome"]
          refund_id: string | null
          rental_id: string
          settled_at: string
          settled_by_user_id: string | null
          total_charges_amount: number
        }
        Insert: {
          created_at?: string
          damage_amount?: number
          deposit_amount_snapshot: number
          invoice_id?: string | null
          late_fee_amount?: number
          net_amount: number
          other_charges_amount?: number
          outcome: Database["public"]["Enums"]["settlement_outcome"]
          refund_id?: string | null
          rental_id: string
          settled_at?: string
          settled_by_user_id?: string | null
          total_charges_amount: number
        }
        Update: {
          created_at?: string
          damage_amount?: number
          deposit_amount_snapshot?: number
          invoice_id?: string | null
          late_fee_amount?: number
          net_amount?: number
          other_charges_amount?: number
          outcome?: Database["public"]["Enums"]["settlement_outcome"]
          refund_id?: string | null
          rental_id?: string
          settled_at?: string
          settled_by_user_id?: string | null
          total_charges_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_settlements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "rental_settlements_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: true
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_settlements_settled_by_user_id_fkey"
            columns: ["settled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_vehicle_assignments: {
        Row: {
          assigned_at: string
          assigned_hub_id: string | null
          created_at: string
          id: string
          maintenance_ticket_id: string | null
          reason: Database["public"]["Enums"]["assignment_reason"]
          released_at: string | null
          released_hub_id: string | null
          rental_id: string
          vehicle_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_hub_id?: string | null
          created_at?: string
          id?: string
          maintenance_ticket_id?: string | null
          reason?: Database["public"]["Enums"]["assignment_reason"]
          released_at?: string | null
          released_hub_id?: string | null
          rental_id: string
          vehicle_id: string
        }
        Update: {
          assigned_at?: string
          assigned_hub_id?: string | null
          created_at?: string
          id?: string
          maintenance_ticket_id?: string | null
          reason?: Database["public"]["Enums"]["assignment_reason"]
          released_at?: string | null
          released_hub_id?: string | null
          rental_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_vehicle_assignments_assigned_hub_id_fkey"
            columns: ["assigned_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_maintenance_ticket_id_fkey"
            columns: ["maintenance_ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_released_hub_id_fkey"
            columns: ["released_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          created_at: string
          due_back_at: string
          end_reason: string | null
          id: string
          picked_up_at: string
          recovery_flagged_at: string | null
          returned_at: string | null
          status: Database["public"]["Enums"]["rental_status"]
          subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          due_back_at: string
          end_reason?: string | null
          id?: string
          picked_up_at?: string
          recovery_flagged_at?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          due_back_at?: string
          end_reason?: string | null
          id?: string
          picked_up_at?: string
          recovery_flagged_at?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "rentals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          action: string
          category: string
          created_at: string
          description: string
          is_enabled: boolean
          legal_basis: string
          retain_days: number
          updated_at: string | null
        }
        Insert: {
          action: string
          category: string
          created_at?: string
          description: string
          is_enabled?: boolean
          legal_basis: string
          retain_days: number
          updated_at?: string | null
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          description?: string
          is_enabled?: boolean
          legal_basis?: string
          retain_days?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      retention_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          retention_policy_category: string
          rows_affected: number | null
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          retention_policy_category: string
          rows_affected?: number | null
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          retention_policy_category?: string
          rows_affected?: number | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_runs_retention_policy_category_fkey"
            columns: ["retention_policy_category"]
            isOneToOne: false
            referencedRelation: "retention_policies"
            referencedColumns: ["category"]
          },
        ]
      }
      return_recovery_settings: {
        Row: {
          created_at: string
          id: string
          max_late_fee_days: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_late_fee_days?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_late_fee_days?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      rider_profiles: {
        Row: {
          created_at: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          onboarding_completed_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          onboarding_completed_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          onboarding_completed_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          joined_on: string | null
          must_change_password: boolean
          staff_code: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          joined_on?: string | null
          must_change_password?: boolean
          staff_code: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          joined_on?: string | null
          must_change_password?: boolean
          staff_code?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_adjustments: {
        Row: {
          amount: number
          code_snapshot: string
          created_at: string
          damage_id: string | null
          id: string
          kind: Database["public"]["Enums"]["pricing_rule_kind"]
          name_snapshot: string
          pricing_rule_id: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          subscription_id: string
          subscription_period_id: string | null
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          amount: number
          code_snapshot: string
          created_at?: string
          damage_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["pricing_rule_kind"]
          name_snapshot: string
          pricing_rule_id?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          subscription_id: string
          subscription_period_id?: string | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          amount?: number
          code_snapshot?: string
          created_at?: string
          damage_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["pricing_rule_kind"]
          name_snapshot?: string
          pricing_rule_id?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          subscription_id?: string
          subscription_period_id?: string | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_adjustments_damage_id_fkey"
            columns: ["damage_id"]
            isOneToOne: false
            referencedRelation: "damages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_adjustments_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_adjustments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_adjustments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "subscription_adjustments_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "subscription_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_adjustments_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_period_id"]
          },
          {
            foreignKeyName: "subscription_adjustments_voided_by_user_id_fkey"
            columns: ["voided_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_pauses: {
        Row: {
          created_at: string
          days_paused: number | null
          id: string
          maintenance_ticket_id: string | null
          paused_at: string
          reason: Database["public"]["Enums"]["pause_reason"]
          resumed_at: string | null
          subscription_id: string
        }
        Insert: {
          created_at?: string
          days_paused?: number | null
          id?: string
          maintenance_ticket_id?: string | null
          paused_at?: string
          reason: Database["public"]["Enums"]["pause_reason"]
          resumed_at?: string | null
          subscription_id: string
        }
        Update: {
          created_at?: string
          days_paused?: number | null
          id?: string
          maintenance_ticket_id?: string | null
          paused_at?: string
          reason?: Database["public"]["Enums"]["pause_reason"]
          resumed_at?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_pauses_maintenance_ticket_id_fkey"
            columns: ["maintenance_ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_pauses_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_pauses_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      subscription_periods: {
        Row: {
          base_amount_snapshot: number
          created_at: string
          due_on: string
          ends_on: string
          id: string
          sequence_number: number
          starts_on: string
          status: Database["public"]["Enums"]["period_status"]
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          base_amount_snapshot: number
          created_at?: string
          due_on: string
          ends_on: string
          id?: string
          sequence_number: number
          starts_on: string
          status?: Database["public"]["Enums"]["period_status"]
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          base_amount_snapshot?: number
          created_at?: string
          due_on?: string
          ends_on?: string
          id?: string
          sequence_number?: number
          starts_on?: string
          status?: Database["public"]["Enums"]["period_status"]
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_periods_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_periods_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_period_snapshot: Database["public"]["Enums"]["billing_period"]
          booking_id: string
          created_at: string
          deposit_amount_snapshot: number
          duration_days_snapshot: number
          ended_at: string | null
          id: string
          plan_id: string
          plan_price_snapshot: number
          started_on: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_period_snapshot: Database["public"]["Enums"]["billing_period"]
          booking_id: string
          created_at?: string
          deposit_amount_snapshot: number
          duration_days_snapshot: number
          ended_at?: string | null
          id?: string
          plan_id: string
          plan_price_snapshot: number
          started_on?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_period_snapshot?: Database["public"]["Enums"]["billing_period"]
          booking_id?: string
          created_at?: string
          deposit_amount_snapshot?: number
          duration_days_snapshot?: number
          ended_at?: string | null
          id?: string
          plan_id?: string
          plan_price_snapshot?: number
          started_on?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          support_ticket_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          support_ticket_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          support_ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_support_ticket_id_fkey"
            columns: ["support_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to_user_id: string | null
          category: Database["public"]["Enums"]["support_category"]
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["support_priority"]
          rental_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: Database["public"]["Enums"]["support_category"]
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["support_priority"]
          rental_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: Database["public"]["Enums"]["support_category"]
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["support_priority"]
          rental_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_status"]
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_station_qis_ids: {
        Row: {
          created_at: string
          qis_id: string
          swap_station_id: string
        }
        Insert: {
          created_at?: string
          qis_id: string
          swap_station_id: string
        }
        Update: {
          created_at?: string
          qis_id?: string
          swap_station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_station_qis_ids_swap_station_id_fkey"
            columns: ["swap_station_id"]
            isOneToOne: false
            referencedRelation: "swap_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_stations: {
        Row: {
          battery_count: number
          code: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          is_rider_visible: boolean
          latitude: number | null
          location: unknown
          longitude: number | null
          name: string
          serial_number: number
          status: Database["public"]["Enums"]["swap_station_status"]
          updated_at: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          battery_count?: number
          code: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_rider_visible?: boolean
          latitude?: number | null
          location: unknown
          longitude?: number | null
          name: string
          serial_number: number
          status?: Database["public"]["Enums"]["swap_station_status"]
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          battery_count?: number
          code?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_rider_visible?: boolean
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          name?: string
          serial_number?: number
          status?: Database["public"]["Enums"]["swap_station_status"]
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swap_stations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_stations_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          address_type: Database["public"]["Enums"]["address_type"]
          city: string
          country: string
          created_at: string
          id: string
          is_primary: boolean
          line_1: string
          line_2: string | null
          postal_code: string
          state: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_type?: Database["public"]["Enums"]["address_type"]
          city: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line_1: string
          line_2?: string | null
          postal_code: string
          state: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_type?: Database["public"]["Enums"]["address_type"]
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          line_1?: string
          line_2?: string | null
          postal_code?: string
          state?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          platform: Database["public"]["Enums"]["device_platform"]
          push_token: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform: Database["public"]["Enums"]["device_platform"]
          push_token: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform?: Database["public"]["Enums"]["device_platform"]
          push_token?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          granted_by_user_id: string | null
          is_granted: boolean
          permission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by_user_id?: string | null
          is_granted: boolean
          permission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by_user_id?: string | null
          is_granted?: boolean
          permission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_related_persons: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          person_role: Database["public"]["Enums"]["related_person_role"]
          phone: string | null
          relationship: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          person_role: Database["public"]["Enums"]["related_person_role"]
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          person_role?: Database["public"]["Enums"]["related_person_role"]
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_related_persons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          erased_at: string | null
          full_name: string
          gender: string | null
          id: string
          phone: string | null
          photo_storage_path: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          status_changed_at: string | null
          status_reason: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          erased_at?: string | null
          full_name: string
          gender?: string | null
          id: string
          phone?: string | null
          photo_storage_path?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          erased_at?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          photo_storage_path?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vehicle_disposals: {
        Row: {
          approved_by_user_id: string | null
          created_at: string
          disposed_on: string
          reason: string
          salvage_amount: number | null
          vehicle_id: string
        }
        Insert: {
          approved_by_user_id?: string | null
          created_at?: string
          disposed_on?: string
          reason: string
          salvage_amount?: number | null
          vehicle_id: string
        }
        Update: {
          approved_by_user_id?: string | null
          created_at?: string
          disposed_on?: string
          reason?: string
          salvage_amount?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_disposals_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_disposals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          document_number: string
          document_type: Database["public"]["Enums"]["vehicle_document_type"]
          expires_on: string
          id: string
          issued_on: string | null
          storage_path: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          document_number: string
          document_type: Database["public"]["Enums"]["vehicle_document_type"]
          expires_on: string
          id?: string
          issued_on?: string | null
          storage_path?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          document_number?: string
          document_type?: Database["public"]["Enums"]["vehicle_document_type"]
          expires_on?: string
          id?: string
          issued_on?: string | null
          storage_path?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_model_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          sort_order: number
          storage_path: string
          vehicle_model_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          sort_order?: number
          storage_path: string
          vehicle_model_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          sort_order?: number
          storage_path?: string
          vehicle_model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_model_media_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_models: {
        Row: {
          battery_capacity: string | null
          battery_range_km: number | null
          category: Database["public"]["Enums"]["vehicle_category"]
          charging_time_hours: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          motor_power_watts: number | null
          name: string
          safety_features: Json
          sort_order: number
          tagline: string | null
          top_speed_kmph: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          battery_capacity?: string | null
          battery_range_km?: number | null
          category?: Database["public"]["Enums"]["vehicle_category"]
          charging_time_hours?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          motor_power_watts?: number | null
          name: string
          safety_features?: Json
          sort_order?: number
          tagline?: string | null
          top_speed_kmph?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          battery_capacity?: string | null
          battery_range_km?: number | null
          category?: Database["public"]["Enums"]["vehicle_category"]
          charging_time_hours?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          motor_power_watts?: number | null
          name?: string
          safety_features?: Json
          sort_order?: number
          tagline?: string | null
          top_speed_kmph?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          batch_number: string | null
          colour: string | null
          created_at: string
          display_name: string | null
          hub_id: string | null
          id: string
          imei: string | null
          purchased_on: string | null
          qr_code: string | null
          registration_number: string
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string | null
          vehicle_model_id: string
          vin: string
        }
        Insert: {
          batch_number?: string | null
          colour?: string | null
          created_at?: string
          display_name?: string | null
          hub_id?: string | null
          id?: string
          imei?: string | null
          purchased_on?: string | null
          qr_code?: string | null
          registration_number: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string | null
          vehicle_model_id: string
          vin: string
        }
        Update: {
          batch_number?: string | null
          colour?: string | null
          created_at?: string
          display_name?: string | null
          hub_id?: string | null
          id?: string
          imei?: string | null
          purchased_on?: string | null
          qr_code?: string | null
          registration_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string | null
          vehicle_model_id?: string
          vin?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          logo_storage_path: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_storage_path?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          logo_storage_path?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_current_consents: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"] | null
          consent_notice_id: string | null
          decided_at: string | null
          language: string | null
          notice_version_snapshot: string | null
          purpose: Database["public"]["Enums"]["consent_purpose"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_consent_notice_id_fkey"
            columns: ["consent_notice_id"]
            isOneToOne: false
            referencedRelation: "consent_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_balances: {
        Row: {
          allocated_amount: number | null
          balance_amount: number | null
          invoice_id: string | null
          is_overdue: boolean | null
          is_paid: boolean | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subscription_id: string | null
          total_amount: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rental_current_vehicle: {
        Row: {
          assigned_at: string | null
          assigned_hub_id: string | null
          reason: Database["public"]["Enums"]["assignment_reason"] | null
          rental_id: string | null
          subscription_id: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_vehicle_assignments_assigned_hub_id_fkey"
            columns: ["assigned_hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_current_period"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "rentals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_subscription_current_period: {
        Row: {
          due_on: string | null
          ends_on: string | null
          scheduled_ends_on: string | null
          sequence_number: number | null
          starts_on: string | null
          subscription_id: string | null
          subscription_period_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_effective_permissions: {
        Row: {
          action: string | null
          module_key: string | null
          permission_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_vehicle_availability: {
        Row: {
          hub_id: string | null
          status: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_count: number | null
          vehicle_model_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allocate_vehicle_for_booking: {
        Args: { p_booking_id: string }
        Returns: string
      }
      anonymise_user: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: undefined
      }
      apply_period_adjustments: {
        Args: { p_subscription_period_id: string }
        Returns: {
          amount: number
          code_snapshot: string
          created_at: string
          damage_id: string | null
          id: string
          kind: Database["public"]["Enums"]["pricing_rule_kind"]
          name_snapshot: string
          pricing_rule_id: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          subscription_id: string
          subscription_period_id: string | null
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "subscription_adjustments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      business_today: { Args: never; Returns: string }
      compute_kyc_status: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["kyc_status"]
      }
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      expire_stale_payment_orders: { Args: never; Returns: number }
      generate_period_invoice: {
        Args: { p_subscription_period_id: string }
        Returns: string
      }
      inactive_user_ids: {
        Args: { p_cutoff: string }
        Returns: {
          user_id: string
        }[]
      }
      invoke_edge_function: { Args: { p_name: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_financial_audit_action: {
        Args: { p_action: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      kyc_abandoned_user_ids: {
        Args: { p_cutoff: string }
        Returns: {
          user_id: string
        }[]
      }
      mandatory_kyc_doc_types: {
        Args: never
        Returns: Database["public"]["Enums"]["kyc_document_type"][]
      }
      nearest_hub: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          code: string
          distance_km: number
          id: string
          latitude: number
          longitude: number
          name: string
        }[]
      }
      purge_audit_logs: {
        Args: { p_cutoff: string; p_financial: boolean }
        Returns: number
      }
      purge_consent_records: { Args: { p_cutoff: string }; Returns: number }
      purge_pii_access_log: { Args: { p_cutoff: string }; Returns: number }
      recompute_vehicle_status: {
        Args: { p_vehicle_id: string }
        Returns: undefined
      }
    }
    Enums: {
      address_type: "home" | "billing" | "proof_of_address"
      adjustment_status: "pending" | "invoiced" | "settled" | "voided"
      amount_type: "fixed" | "percentage"
      assignment_reason: "initial" | "temp_swap" | "replacement"
      billing_period: "daily" | "weekly" | "monthly"
      booking_status:
        | "pending_payment"
        | "confirmed"
        | "cancelled"
        | "expired"
        | "fulfilled"
      consent_action: "granted" | "withdrawn"
      consent_purpose:
        | "kyc_identity_verification"
        | "service_delivery"
        | "payments_and_billing"
        | "safety_and_incident"
        | "service_communications"
        | "marketing_communications"
        | "location_services"
      damage_status: "assessed" | "disputed" | "settled" | "waived"
      delivery_status: "pending" | "sent" | "failed"
      deposit_status: "pending" | "held" | "released" | "forfeited"
      device_platform: "ios" | "android"
      dispute_outcome: "upheld" | "rejected" | "partially_upheld"
      dp_request_status:
        | "open"
        | "in_progress"
        | "awaiting_principal"
        | "completed"
        | "rejected"
        | "withdrawn"
      dp_request_type:
        | "access_export"
        | "correction"
        | "erasure"
        | "grievance"
        | "nominee_update"
      incident_status: "open" | "investigating" | "closed"
      incident_type:
        | "damage"
        | "accident"
        | "theft"
        | "vandalism"
        | "breakdown"
        | "other"
      invoice_item_type: "plan_fee" | "adjustment" | "deposit"
      invoice_purpose:
        | "initial"
        | "subscription_period"
        | "settlement"
        | "adhoc"
      invoice_status: "draft" | "issued" | "void"
      kyc_document_type:
        | "aadhaar"
        | "driving_licence"
        | "passport"
        | "voter_id"
        | "address_proof"
      kyc_status:
        | "not_submitted"
        | "pending"
        | "partially_verified"
        | "verified"
        | "rejected"
      leave_request_status: "pending" | "approved" | "rejected" | "cancelled"
      maintenance_outcome:
        | "quick_fix"
        | "temp_vehicle"
        | "replacement"
        | "not_repairable"
      maintenance_status:
        | "reported"
        | "triaged"
        | "in_progress"
        | "resolved"
        | "cancelled"
      maintenance_type: "corrective" | "preventive"
      notification_audience: "rider" | "staff" | "both"
      notification_channel: "push" | "email" | "sms"
      pause_reason: "vehicle_breakdown" | "rider_request" | "admin"
      payment_method: "card" | "wallet" | "upi" | "netbanking" | "cash"
      payment_order_status:
        | "created"
        | "attempted"
        | "paid"
        | "failed"
        | "expired"
      payment_status: "pending" | "processing" | "succeeded" | "failed"
      period_status: "scheduled" | "current" | "closed"
      pii_access_reason:
        | "kyc_review"
        | "support_ticket"
        | "fraud_investigation"
        | "rights_request"
        | "legal_request"
        | "rider_self"
        | "other"
      pricing_rule_kind: "charge" | "discount"
      refund_reason:
        | "deposit_release"
        | "booking_cancellation"
        | "settlement"
        | "goodwill"
      refund_status: "pending" | "processing" | "succeeded" | "failed"
      related_person_role: "nominee" | "emergency_contact"
      rental_status: "active" | "completed" | "force_ended"
      return_status: "requested" | "inspected" | "approved" | "rejected"
      rule_frequency:
        | "one_time"
        | "every_period"
        | "every_n_periods"
        | "first_n_periods"
        | "per_day"
      rule_scope:
        | "global"
        | "plan"
        | "vehicle_model"
        | "vehicle"
        | "subscription"
      settlement_outcome: "refund_due" | "amount_due" | "balanced"
      subscription_status:
        | "active"
        | "paused"
        | "past_due"
        | "ended"
        | "cancelled"
      support_category: "booking" | "payment" | "vehicle" | "account" | "other"
      support_priority: "low" | "medium" | "high" | "urgent"
      support_status: "open" | "in_progress" | "resolved" | "closed"
      swap_station_status: "working" | "not_working" | "maintenance"
      user_role: "rider" | "staff" | "admin"
      user_status: "active" | "inactive" | "suspended"
      vehicle_category: "scooter" | "bike" | "moped"
      vehicle_document_type:
        | "registration"
        | "insurance"
        | "puc"
        | "fitness"
        | "permit"
      vehicle_status:
        | "available"
        | "reserved"
        | "assigned"
        | "maintenance"
        | "retired"
      verification_status: "pending" | "verified" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      address_type: ["home", "billing", "proof_of_address"],
      adjustment_status: ["pending", "invoiced", "settled", "voided"],
      amount_type: ["fixed", "percentage"],
      assignment_reason: ["initial", "temp_swap", "replacement"],
      billing_period: ["daily", "weekly", "monthly"],
      booking_status: [
        "pending_payment",
        "confirmed",
        "cancelled",
        "expired",
        "fulfilled",
      ],
      consent_action: ["granted", "withdrawn"],
      consent_purpose: [
        "kyc_identity_verification",
        "service_delivery",
        "payments_and_billing",
        "safety_and_incident",
        "service_communications",
        "marketing_communications",
        "location_services",
      ],
      damage_status: ["assessed", "disputed", "settled", "waived"],
      delivery_status: ["pending", "sent", "failed"],
      deposit_status: ["pending", "held", "released", "forfeited"],
      device_platform: ["ios", "android"],
      dispute_outcome: ["upheld", "rejected", "partially_upheld"],
      dp_request_status: [
        "open",
        "in_progress",
        "awaiting_principal",
        "completed",
        "rejected",
        "withdrawn",
      ],
      dp_request_type: [
        "access_export",
        "correction",
        "erasure",
        "grievance",
        "nominee_update",
      ],
      incident_status: ["open", "investigating", "closed"],
      incident_type: [
        "damage",
        "accident",
        "theft",
        "vandalism",
        "breakdown",
        "other",
      ],
      invoice_item_type: ["plan_fee", "adjustment", "deposit"],
      invoice_purpose: [
        "initial",
        "subscription_period",
        "settlement",
        "adhoc",
      ],
      invoice_status: ["draft", "issued", "void"],
      kyc_document_type: [
        "aadhaar",
        "driving_licence",
        "passport",
        "voter_id",
        "address_proof",
      ],
      kyc_status: [
        "not_submitted",
        "pending",
        "partially_verified",
        "verified",
        "rejected",
      ],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      maintenance_outcome: [
        "quick_fix",
        "temp_vehicle",
        "replacement",
        "not_repairable",
      ],
      maintenance_status: [
        "reported",
        "triaged",
        "in_progress",
        "resolved",
        "cancelled",
      ],
      maintenance_type: ["corrective", "preventive"],
      notification_audience: ["rider", "staff", "both"],
      notification_channel: ["push", "email", "sms"],
      pause_reason: ["vehicle_breakdown", "rider_request", "admin"],
      payment_method: ["card", "wallet", "upi", "netbanking", "cash"],
      payment_order_status: [
        "created",
        "attempted",
        "paid",
        "failed",
        "expired",
      ],
      payment_status: ["pending", "processing", "succeeded", "failed"],
      period_status: ["scheduled", "current", "closed"],
      pii_access_reason: [
        "kyc_review",
        "support_ticket",
        "fraud_investigation",
        "rights_request",
        "legal_request",
        "rider_self",
        "other",
      ],
      pricing_rule_kind: ["charge", "discount"],
      refund_reason: [
        "deposit_release",
        "booking_cancellation",
        "settlement",
        "goodwill",
      ],
      refund_status: ["pending", "processing", "succeeded", "failed"],
      related_person_role: ["nominee", "emergency_contact"],
      rental_status: ["active", "completed", "force_ended"],
      return_status: ["requested", "inspected", "approved", "rejected"],
      rule_frequency: [
        "one_time",
        "every_period",
        "every_n_periods",
        "first_n_periods",
        "per_day",
      ],
      rule_scope: [
        "global",
        "plan",
        "vehicle_model",
        "vehicle",
        "subscription",
      ],
      settlement_outcome: ["refund_due", "amount_due", "balanced"],
      subscription_status: [
        "active",
        "paused",
        "past_due",
        "ended",
        "cancelled",
      ],
      support_category: ["booking", "payment", "vehicle", "account", "other"],
      support_priority: ["low", "medium", "high", "urgent"],
      support_status: ["open", "in_progress", "resolved", "closed"],
      swap_station_status: ["working", "not_working", "maintenance"],
      user_role: ["rider", "staff", "admin"],
      user_status: ["active", "inactive", "suspended"],
      vehicle_category: ["scooter", "bike", "moped"],
      vehicle_document_type: [
        "registration",
        "insurance",
        "puc",
        "fitness",
        "permit",
      ],
      vehicle_status: [
        "available",
        "reserved",
        "assigned",
        "maintenance",
        "retired",
      ],
      verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const
