
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "appointment_status_history": {
                  Row: {
                    "appointment_id": string,"changed_at": string,"changed_by": string | null,"id": number,"new_status": string,"old_status": string | null
                  }
                  Insert: {
                    "appointment_id": string,"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new_status": string,"old_status"?: string | null
                  }
                  Update: {
                    "appointment_id"?: string,"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new_status"?: string,"old_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_status_history_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "access_token_hash": string | null,"appointment_date": string,"created_at": string,"customer_name": string,"customer_phone": string,"customer_phone_digits": string,"end_time": string,"id": string,"legacy_id": string | null,"notes": string,"payment_method": string,"price_cents": number | null,"price_label": string | null,"public_code": string,"service_id": string | null,"service_name": string,"source": string,"start_time": string,"status": string,"time_range": unknown,"updated_at": string
                  }
                  Insert: {
                    "access_token_hash"?: string | null,"appointment_date": string,"created_at"?: string,"customer_name": string,"customer_phone": string,"customer_phone_digits": string,"end_time": string,"id"?: string,"legacy_id"?: string | null,"notes"?: string,"payment_method": string,"price_cents"?: number | null,"price_label"?: string | null,"public_code": string,"service_id"?: string | null,"service_name": string,"source"?: string,"start_time": string,"status"?: string,"time_range"?: never,"updated_at"?: string
                  }
                  Update: {
                    "access_token_hash"?: string | null,"appointment_date"?: string,"created_at"?: string,"customer_name"?: string,"customer_phone"?: string,"customer_phone_digits"?: string,"end_time"?: string,"id"?: string,"legacy_id"?: string | null,"notes"?: string,"payment_method"?: string,"price_cents"?: number | null,"price_label"?: string | null,"public_code"?: string,"service_id"?: string | null,"service_name"?: string,"source"?: string,"start_time"?: string,"status"?: string,"time_range"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"blocked_dates": {
                  Row: {
                    "all_day": boolean,"created_at": string,"end_date": string,"end_time": string,"id": string,"legacy_id": string | null,"reason": string,"start_date": string,"start_time": string,"updated_at": string
                  }
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"end_date": string,"end_time"?: string,"id"?: string,"legacy_id"?: string | null,"reason"?: string,"start_date": string,"start_time"?: string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"end_date"?: string,"end_time"?: string,"id"?: string,"legacy_id"?: string | null,"reason"?: string,"start_date"?: string,"start_time"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"business_hours": {
                  Row: {
                    "close_time": string,"is_open": boolean,"open_time": string,"updated_at": string,"weekday": number
                  }
                  Insert: {
                    "close_time"?: string,"is_open"?: boolean,"open_time"?: string,"updated_at"?: string,"weekday": number
                  }
                  Update: {
                    "close_time"?: string,"is_open"?: boolean,"open_time"?: string,"updated_at"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"business_settings": {
                  Row: {
                    "address_line": string,"booking_channel": string,"booking_channel_url": string,"city": string,"free_end": string,"free_schedule": boolean,"free_start": string,"id": boolean,"instagram_url": string,"lunch_enabled": boolean,"lunch_end": string,"lunch_start": string,"max_active_bookings_per_phone": number | null,"name": string,"neighborhood": string,"phone_display": string,"phone_e164": string,"postal_code": string,"rating_display": string,"review_count": number,"schedule_configured": boolean,"slot_interval_minutes": number,"timezone": string,"updated_at": string,"whatsapp_number": string
                  }
                  Insert: {
                    "address_line"?: string,"booking_channel"?: string,"booking_channel_url"?: string,"city"?: string,"free_end"?: string,"free_schedule"?: boolean,"free_start"?: string,"id"?: boolean,"instagram_url"?: string,"lunch_enabled"?: boolean,"lunch_end"?: string,"lunch_start"?: string,"max_active_bookings_per_phone"?: number | null,"name"?: string,"neighborhood"?: string,"phone_display"?: string,"phone_e164"?: string,"postal_code"?: string,"rating_display"?: string,"review_count"?: number,"schedule_configured"?: boolean,"slot_interval_minutes"?: number,"timezone"?: string,"updated_at"?: string,"whatsapp_number"?: string
                  }
                  Update: {
                    "address_line"?: string,"booking_channel"?: string,"booking_channel_url"?: string,"city"?: string,"free_end"?: string,"free_schedule"?: boolean,"free_start"?: string,"id"?: boolean,"instagram_url"?: string,"lunch_enabled"?: boolean,"lunch_end"?: string,"lunch_start"?: string,"max_active_bookings_per_phone"?: number | null,"name"?: string,"neighborhood"?: string,"phone_display"?: string,"phone_e164"?: string,"postal_code"?: string,"rating_display"?: string,"review_count"?: number,"schedule_configured"?: boolean,"slot_interval_minutes"?: number,"timezone"?: string,"updated_at"?: string,"whatsapp_number"?: string
                  }
                  Relationships: [
                    
                  ]
                },"portfolio": {
                  Row: {
                    "active": boolean,"caption": string,"created_at": string,"id": string,"image_url": string,"instagram_url": string,"legacy_id": string | null,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"caption"?: string,"created_at"?: string,"id"?: string,"image_url": string,"instagram_url"?: string,"legacy_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"caption"?: string,"created_at"?: string,"id"?: string,"image_url"?: string,"instagram_url"?: string,"legacy_id"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "active": boolean,"author_name": string | null,"body": string,"created_at": string,"id": string,"legacy_index": number | null,"rating": number | null,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"author_name"?: string | null,"body": string,"created_at"?: string,"id"?: string,"legacy_index"?: number | null,"rating"?: number | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"author_name"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"legacy_index"?: number | null,"rating"?: number | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string,"duration_minutes": number | null,"id": string,"legacy_id": string | null,"name": string,"price_cents": number | null,"price_label": string | null,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string,"duration_minutes"?: number | null,"id"?: string,"legacy_id"?: string | null,"name": string,"price_cents"?: number | null,"price_label"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string,"duration_minutes"?: number | null,"id"?: string,"legacy_id"?: string | null,"name"?: string,"price_cents"?: number | null,"price_label"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_set_appointment_status":
{ Args: { "p_appointment_id": string,"p_status": string }; Returns: {
              "access_token_hash": string | null,
"appointment_date": string,
"created_at": string,
"customer_name": string,
"customer_phone": string,
"customer_phone_digits": string,
"end_time": string,
"id": string,
"legacy_id": string | null,
"notes": string,
"payment_method": string,
"price_cents": number | null,
"price_label": string | null,
"public_code": string,
"service_id": string | null,
"service_name": string,
"source": string,
"start_time": string,
"status": string,
"time_range": unknown,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "appointments"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_client_appointment":
{ Args: { "p_customer_phone"?: string,"p_device_token"?: string,"p_public_code": string }; Returns: Json
                           },
"create_appointment":
{ Args: { "p_customer_name": string,"p_customer_phone": string,"p_date": string,"p_device_token"?: string,"p_notes"?: string,"p_payment_method": string,"p_service_id": string,"p_start_time": string }; Returns: Json
                           },
"current_user_is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"get_busy_intervals":
{ Args: { "p_date": string }; Returns: {
              "end_time": string,"start_time": string
            }[]
                           },
"get_client_appointment_by_code":
{ Args: { "p_customer_phone": string,"p_public_code": string }; Returns: {
              "appointment_date": string,"customer_name": string,"customer_phone": string,"end_time": string,"notes": string,"payment_method": string,"price_cents": number,"price_label": string,"public_code": string,"service_name": string,"start_time": string,"status": string
            }[]
                           },
"get_client_appointments":
{ Args: { "p_device_token": string }; Returns: {
              "appointment_date": string,"customer_name": string,"customer_phone": string,"end_time": string,"notes": string,"payment_method": string,"price_cents": number,"price_label": string,"public_code": string,"service_name": string,"start_time": string,"status": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

