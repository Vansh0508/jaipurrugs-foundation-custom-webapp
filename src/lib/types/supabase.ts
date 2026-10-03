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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          tool_trace: Json
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          tool_trace?: Json
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tool_trace?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          phone_number: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          phone_number: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          phone_number?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      form_answers: {
        Row: {
          created_at: string
          field_id: string
          field_snapshot: Json
          id: string
          submission_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          field_id: string
          field_snapshot: Json
          id?: string
          submission_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          field_id?: string
          field_snapshot?: Json
          id?: string
          submission_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          form_id: string
          id: string
          label: string | null
          logic: Json
          placeholder: string | null
          position: number
          required: boolean
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at: string
          validation: Json
        }
        Insert: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          form_id: string
          id?: string
          label?: string | null
          logic?: Json
          placeholder?: string | null
          position: number
          required?: boolean
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          form_id?: string
          id?: string
          label?: string | null
          logic?: Json
          placeholder?: string | null
          position?: number
          required?: boolean
          type?: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_lead_mappings: {
        Row: {
          attribute_map: Json
          created_at: string
          enabled: boolean
          form_id: string
          list_ids: string[]
          name_field_id: string | null
          phone_field_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attribute_map?: Json
          created_at?: string
          enabled?: boolean
          form_id: string
          list_ids?: string[]
          name_field_id?: string | null
          phone_field_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attribute_map?: Json
          created_at?: string
          enabled?: boolean
          form_id?: string
          list_ids?: string[]
          name_field_id?: string | null
          phone_field_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_lead_mappings_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_mappings_name_field_id_fkey"
            columns: ["name_field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_mappings_phone_field_id_fkey"
            columns: ["phone_field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          completed_at: string | null
          created_at: string
          form_id: string
          id: string
          metadata: Json
          status: Database["public"]["Enums"]["submission_status"]
          submitter_token: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          form_id: string
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["submission_status"]
          submitter_token: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          form_id?: string
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["submission_status"]
          submitter_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          settings: Json
          share_token: string
          slug: string
          status: Database["public"]["Enums"]["form_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          settings?: Json
          share_token?: string
          slug?: string
          status?: Database["public"]["Enums"]["form_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          settings?: Json
          share_token?: string
          slug?: string
          status?: Database["public"]["Enums"]["form_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_settings: {
        Row: {
          auto_reply_enabled: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_reply_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_reply_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      knowledge_base_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          search_vector: unknown
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          search_vector?: unknown
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          search_vector?: unknown
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_attributes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          options: string[]
          type: Database["public"]["Enums"]["lead_attribute_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          options?: string[]
          type?: Database["public"]["Enums"]["lead_attribute_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          options?: string[]
          type?: Database["public"]["Enums"]["lead_attribute_type"]
          updated_at?: string
        }
        Relationships: []
      }
      lead_list_members: {
        Row: {
          added_at: string
          lead_id: string
          list_id: string
        }
        Insert: {
          added_at?: string
          lead_id: string
          list_id: string
        }
        Update: {
          added_at?: string
          lead_id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_list_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_memories: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          source: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          source: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_memories_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          name: string | null
          phone: string
          phone_normalized: string | null
          source: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          name?: string | null
          phone: string
          phone_normalized?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
          phone_normalized?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          email: string
          id: string
          status: Database["public"]["Enums"]["team_member_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          status?: Database["public"]["Enums"]["team_member_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          status?: Database["public"]["Enums"]["team_member_status"]
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          ai_enabled: boolean
          contact_bsuid: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_phone_normalized: string | null
          created_at: string
          handoff_reason: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          needs_human: boolean
          unread_count: number
          updated_at: string
          zernio_account_id: string
          zernio_conversation_id: string
        }
        Insert: {
          ai_enabled?: boolean
          contact_bsuid?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_phone_normalized?: string | null
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          needs_human?: boolean
          unread_count?: number
          updated_at?: string
          zernio_account_id: string
          zernio_conversation_id: string
        }
        Update: {
          ai_enabled?: boolean
          contact_bsuid?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_phone_normalized?: string | null
          created_at?: string
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          needs_human?: boolean
          unread_count?: number
          updated_at?: string
          zernio_account_id?: string
          zernio_conversation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          attachments: Json
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          kind: string
          platform_message_id: string | null
          sender_type: string
          sent_at: string
          sent_by: string | null
          status: string
          template_language: string | null
          template_name: string | null
          tool_trace: Json
          zernio_message_id: string | null
        }
        Insert: {
          attachments?: Json
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          kind?: string
          platform_message_id?: string | null
          sender_type: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          tool_trace?: Json
          zernio_message_id?: string | null
        }
        Update: {
          attachments?: Json
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          kind?: string
          platform_message_id?: string | null
          sender_type?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          tool_trace?: Json
          zernio_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_bindings: {
        Row: {
          created_at: string
          language: string
          template_name: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          created_at?: string
          language: string
          template_name: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          created_at?: string
          language?: string
          template_name?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      zernio_webhook_events: {
        Row: {
          error: string | null
          event: string
          event_id: string
          processed_at: string | null
          received_at: string
        }
        Insert: {
          error?: string | null
          event: string
          event_id: string
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          error?: string | null
          event?: string
          event_id?: string
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_submissions_for_phone: {
        Args: { p_limit?: number; p_phone: string }
        Returns: {
          answers: Json
          completed_at: string
          created_at: string
          form_id: string
          form_title: string
          status: Database["public"]["Enums"]["submission_status"]
          submission_id: string
        }[]
      }
      agent_upsert_lead: {
        Args: { p_attributes: Json; p_name: string; p_phone: string }
        Returns: Json
      }
      answer_to_text: { Args: { p_value: Json }; Returns: string }
      hook_restrict_signup_to_active_team_members: {
        Args: { event: Json }
        Returns: Json
      }
      is_active_team_member: { Args: never; Returns: boolean }
      kb_tags_to_text: { Args: { p_tags: string[] }; Returns: string }
      lead_attribute_value: {
        Args: {
          p_options: string[]
          p_raw: string
          p_type: Database["public"]["Enums"]["lead_attribute_type"]
        }
        Returns: Json
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      search_knowledge_base: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          category: string
          excerpt: string
          id: string
          rank: number
          tags: string[]
          title: string
        }[]
      }
      sync_form_leads: { Args: { p_form_id: string }; Returns: number }
    }
    Enums: {
      form_field_type:
        | "short_text"
        | "long_text"
        | "number"
        | "email"
        | "phone"
        | "date"
        | "multiple_choice"
        | "checkboxes"
        | "dropdown"
        | "rating"
        | "linear_scale"
        | "file_upload"
        | "section"
      form_status: "draft" | "published" | "archived"
      lead_attribute_type: "text" | "number" | "date" | "select"
      submission_status: "in_progress" | "completed"
      team_member_status: "active" | "inactive"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      form_field_type: [
        "short_text",
        "long_text",
        "number",
        "email",
        "phone",
        "date",
        "multiple_choice",
        "checkboxes",
        "dropdown",
        "rating",
        "linear_scale",
        "file_upload",
        "section",
      ],
      form_status: ["draft", "published", "archived"],
      lead_attribute_type: ["text", "number", "date", "select"],
      submission_status: ["in_progress", "completed"],
      team_member_status: ["active", "inactive"],
    },
  },
} as const
