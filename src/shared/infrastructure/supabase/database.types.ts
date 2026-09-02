export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      concept_tags: {
        Row: {
          concept_id: string
          created_at: string
          owner_id: string
          tag_id: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          owner_id: string
          tag_id: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          owner_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_tags_concept_owner_fk"
            columns: ["concept_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "concept_tags_tag_owner_fk"
            columns: ["tag_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      concepts: {
        Row: {
          archived_at: string | null
          canonical_key: string | null
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          course_id: string
          created_at: string
          example: string | null
          explanation: string | null
          id: string
          kind: Database["public"]["Enums"]["concept_kind"]
          metadata: Json
          owner_id: string
          source_reference: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          canonical_key?: string | null
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          course_id: string
          created_at?: string
          example?: string | null
          explanation?: string | null
          id?: string
          kind: Database["public"]["Enums"]["concept_kind"]
          metadata?: Json
          owner_id: string
          source_reference?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          canonical_key?: string | null
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          course_id?: string
          created_at?: string
          example?: string | null
          explanation?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["concept_kind"]
          metadata?: Json
          owner_id?: string
          source_reference?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_course_owner_fk"
            columns: ["course_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      course_settings: {
        Row: {
          course_id: string
          created_at: string
          daily_new_limit: number
          maximum_reviews_per_day: number | null
          requested_retention: number | null
          scheduler_config_version: number
          show_interval_preview: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          daily_new_limit?: number
          maximum_reviews_per_day?: number | null
          requested_retention?: number | null
          scheduler_config_version?: number
          show_interval_preview?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          daily_new_limit?: number
          maximum_reviews_per_day?: number | null
          requested_retention?: number | null
          scheduler_config_version?: number
          show_interval_preview?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_settings_course_owner_fk"
            columns: ["course_id", "user_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      courses: {
        Row: {
          active: boolean
          created_at: string
          declared_level: Database["public"]["Enums"]["cefr_level"] | null
          id: string
          owner_id: string
          source_language_id: string
          start_level: Database["public"]["Enums"]["cefr_level"] | null
          target_language_id: string
          target_locale: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          declared_level?: Database["public"]["Enums"]["cefr_level"] | null
          id?: string
          owner_id: string
          source_language_id: string
          start_level?: Database["public"]["Enums"]["cefr_level"] | null
          target_language_id: string
          target_locale?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          declared_level?: Database["public"]["Enums"]["cefr_level"] | null
          id?: string
          owner_id?: string
          source_language_id?: string
          start_level?: Database["public"]["Enums"]["cefr_level"] | null
          target_language_id?: string
          target_locale?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_source_language_id_fkey"
            columns: ["source_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_target_language_id_fkey"
            columns: ["target_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_concepts: {
        Row: {
          concept_id: string
          created_at: string
          deck_id: string
          owner_id: string
          position: number | null
          updated_at: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          deck_id: string
          owner_id: string
          position?: number | null
          updated_at?: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          deck_id?: string
          owner_id?: string
          position?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_concepts_concept_owner_fk"
            columns: ["concept_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "deck_concepts_deck_owner_fk"
            columns: ["deck_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      decks: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["deck_category"] | null
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          course_id: string
          created_at: string
          description: string | null
          id: string
          owner_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["deck_category"] | null
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["deck_category"] | null
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_course_owner_fk"
            columns: ["course_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      languages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          locale: string
          name_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          locale: string
          name_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          locale?: string
          name_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_items: {
        Row: {
          answer_text: string
          archived_at: string | null
          concept_id: string
          config: Json
          created_at: string
          enabled: boolean
          hint_text: string | null
          id: string
          mode: Database["public"]["Enums"]["practice_mode"]
          owner_id: string
          prompt_text: string
          updated_at: string
        }
        Insert: {
          answer_text: string
          archived_at?: string | null
          concept_id: string
          config: Json
          created_at?: string
          enabled?: boolean
          hint_text?: string | null
          id?: string
          mode: Database["public"]["Enums"]["practice_mode"]
          owner_id: string
          prompt_text: string
          updated_at?: string
        }
        Update: {
          answer_text?: string
          archived_at?: string | null
          concept_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          hint_text?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["practice_mode"]
          owner_id?: string
          prompt_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_items_concept_owner_fk"
            columns: ["concept_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_course_id: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed_at: string | null
          timezone: string
          ui_locale: Database["public"]["Enums"]["ui_locale"]
          updated_at: string
        }
        Insert: {
          active_course_id?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          timezone?: string
          ui_locale?: Database["public"]["Enums"]["ui_locale"]
          updated_at?: string
        }
        Update: {
          active_course_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          timezone?: string
          ui_locale?: Database["public"]["Enums"]["ui_locale"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_course_fk"
            columns: ["active_course_id", "id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      tags: {
        Row: {
          course_id: string
          created_at: string
          display_name: string
          id: string
          normalized_name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          display_name: string
          id?: string
          normalized_name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          display_name?: string
          id?: string
          normalized_name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_course_owner_fk"
            columns: ["course_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_onboarding: {
        Args: {
          p_daily_new_limit: number
          p_declared_level: Database["public"]["Enums"]["cefr_level"]
          p_start_level: Database["public"]["Enums"]["cefr_level"]
          p_ui_locale: Database["public"]["Enums"]["ui_locale"]
        }
        Returns: string
      }
    }
    Enums: {
      cefr_level: "A1" | "A2" | "B1" | "B2"
      concept_kind:
        | "vocabulary"
        | "collocation"
        | "phrase"
        | "grammar"
        | "communicative_function"
        | "pronunciation"
        | "other"
      deck_category:
        | "vocabulary"
        | "grammar"
        | "communicative_function"
        | "pronunciation"
        | "professional"
        | "mixed"
      practice_mode:
        | "basic_recognition"
        | "basic_recall"
        | "cloze"
        | "listening_dictation"
        | "guided_production"
        | "free_production"
        | "pronunciation"
      ui_locale: "es" | "en"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cefr_level: ["A1", "A2", "B1", "B2"],
      concept_kind: [
        "vocabulary",
        "collocation",
        "phrase",
        "grammar",
        "communicative_function",
        "pronunciation",
        "other",
      ],
      deck_category: [
        "vocabulary",
        "grammar",
        "communicative_function",
        "pronunciation",
        "professional",
        "mixed",
      ],
      practice_mode: [
        "basic_recognition",
        "basic_recall",
        "cloze",
        "listening_dictation",
        "guided_production",
        "free_production",
        "pronunciation",
      ],
      ui_locale: ["es", "en"],
    },
  },
} as const

