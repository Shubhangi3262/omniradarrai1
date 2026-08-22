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
      agent_spans: {
        Row: {
          attributes: Json
          completion_tokens: number
          cost_usd: number
          created_at: string
          duration_ms: number
          error: string | null
          events: Json
          id: string
          kind: string
          model: string | null
          name: string
          parent_span_id: string | null
          prompt_tokens: number
          span_id: string
          start_offset_ms: number
          status: string
          trace_id: string
        }
        Insert: {
          attributes?: Json
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          events?: Json
          id?: string
          kind: string
          model?: string | null
          name: string
          parent_span_id?: string | null
          prompt_tokens?: number
          span_id: string
          start_offset_ms?: number
          status?: string
          trace_id: string
        }
        Update: {
          attributes?: Json
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          events?: Json
          id?: string
          kind?: string
          model?: string | null
          name?: string
          parent_span_id?: string | null
          prompt_tokens?: number
          span_id?: string
          start_offset_ms?: number
          status?: string
          trace_id?: string
        }
        Relationships: []
      }
      agent_traces: {
        Row: {
          chaos: Json
          completion_tokens: number
          confidence: number
          cost_usd: number
          created_at: string
          diagnosis: Json | null
          duration_ms: number
          ended_at: string | null
          error_count: number
          experiment_id: string | null
          fallbacks: number
          id: string
          model_calls: number
          optimizations: Json
          prompt_tokens: number
          retries: number
          started_at: string
          status: string
          success: boolean
          summary: Json
          task_score: number
          tool_calls: number
          tool_failures: number
          topic: string
          total_tokens: number
          trace_id: string
          variant: string
        }
        Insert: {
          chaos?: Json
          completion_tokens?: number
          confidence?: number
          cost_usd?: number
          created_at?: string
          diagnosis?: Json | null
          duration_ms?: number
          ended_at?: string | null
          error_count?: number
          experiment_id?: string | null
          fallbacks?: number
          id?: string
          model_calls?: number
          optimizations?: Json
          prompt_tokens?: number
          retries?: number
          started_at?: string
          status?: string
          success?: boolean
          summary?: Json
          task_score?: number
          tool_calls?: number
          tool_failures?: number
          topic: string
          total_tokens?: number
          trace_id: string
          variant?: string
        }
        Update: {
          chaos?: Json
          completion_tokens?: number
          confidence?: number
          cost_usd?: number
          created_at?: string
          diagnosis?: Json | null
          duration_ms?: number
          ended_at?: string | null
          error_count?: number
          experiment_id?: string | null
          fallbacks?: number
          id?: string
          model_calls?: number
          optimizations?: Json
          prompt_tokens?: number
          retries?: number
          started_at?: string
          status?: string
          success?: boolean
          summary?: Json
          task_score?: number
          tool_calls?: number
          tool_failures?: number
          topic?: string
          total_tokens?: number
          trace_id?: string
          variant?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
