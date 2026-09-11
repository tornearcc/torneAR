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
      app_feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      app_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          level: string
          message: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          level: string
          message: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      app_versions: {
        Row: {
          latest_version: string
          min_required_version: string
          platform: string
          update_url: string
          updated_at: string
        }
        Insert: {
          latest_version: string
          min_required_version: string
          platform: string
          update_url: string
          updated_at?: string
        }
        Update: {
          latest_version?: string
          min_required_version?: string
          platform?: string
          update_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      apple_credentials: {
        Row: {
          auth_user_id: string
          created_at: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          criteria_description: string | null
          description: string | null
          entity_type: string
          icon_url: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          criteria_description?: string | null
          description?: string | null
          entity_type?: string
          icon_url?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          criteria_description?: string | null
          description?: string | null
          entity_type?: string
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cancellation_requests: {
        Row: {
          created_at: string
          id: string
          is_late: boolean
          match_id: string
          notes: string | null
          reason: string
          requested_by_team_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_late?: boolean
          match_id: string
          notes?: string | null
          reason: string
          requested_by_team_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_late?: boolean
          match_id?: string
          notes?: string | null
          reason?: string
          requested_by_team_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_team_id_fkey"
            columns: ["requested_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_team_id_fkey"
            columns: ["requested_by_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          created_by: string
          from_team_id: string
          id: string
          match_type: Database["public"]["Enums"]["match_type"] | null
          status: Database["public"]["Enums"]["challenge_status"]
          to_team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_team_id: string
          id?: string
          match_type?: Database["public"]["Enums"]["match_type"] | null
          status?: Database["public"]["Enums"]["challenge_status"]
          to_team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_team_id?: string
          id?: string
          match_type?: Database["public"]["Enums"]["match_type"] | null
          status?: Database["public"]["Enums"]["challenge_status"]
          to_team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "challenges_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_entity_id: string
          reported_entity_type: Database["public"]["Enums"]["report_entity_type"]
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_entity_id: string
          reported_entity_type: Database["public"]["Enums"]["report_entity_type"]
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_entity_id?: string
          reported_entity_type?: Database["public"]["Enums"]["report_entity_type"]
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          player_id: string | null
          team_id: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          player_id?: string | null
          team_id?: string | null
          type: Database["public"]["Enums"]["conversation_type"]
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          player_id?: string | null
          team_id?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_history: {
        Row: {
          created_at: string
          delta: number
          elo_after: number
          elo_before: number
          id: string
          match_id: string
          season_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          elo_after: number
          elo_before: number
          id?: string
          match_id: string
          season_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          elo_after?: number
          elo_before?: number
          id?: string
          match_id?: string
          season_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elo_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      format_rules: {
        Row: {
          format: Database["public"]["Enums"]["team_format"]
          max_squad_size: number
          min_players_to_start: number
          players_on_field: number
          updated_at: string
        }
        Insert: {
          format: Database["public"]["Enums"]["team_format"]
          max_squad_size: number
          min_players_to_start: number
          players_on_field: number
          updated_at?: string
        }
        Update: {
          format?: Database["public"]["Enums"]["team_format"]
          max_squad_size?: number
          min_players_to_start?: number
          players_on_field?: number
          updated_at?: string
        }
        Relationships: []
      }
      market_player_post_applications: {
        Row: {
          applicant_profile_id: string
          created_at: string
          id: string
          post_id: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          applicant_profile_id: string
          created_at?: string
          id?: string
          post_id: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          applicant_profile_id?: string
          created_at?: string
          id?: string
          post_id?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_player_post_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "market_player_post_applications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "market_player_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_post_applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      market_player_posts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          position: Database["public"]["Enums"]["player_position"]
          post_type: Database["public"]["Enums"]["market_post_type"]
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["player_position"]
          post_type: Database["public"]["Enums"]["market_post_type"]
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["player_position"]
          post_type?: Database["public"]["Enums"]["market_post_type"]
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_player_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_player_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      market_team_post_applications: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_team_post_applications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "market_team_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_post_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_post_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_post_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      market_team_posts: {
        Row: {
          complex: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          match_date: string | null
          match_time: string | null
          pitch_type: string | null
          position_wanted: Database["public"]["Enums"]["player_position"]
          team_id: string
          updated_at: string
          venue_id: string | null
          zone: string | null
        }
        Insert: {
          complex?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_date?: string | null
          match_time?: string | null
          pitch_type?: string | null
          position_wanted?: Database["public"]["Enums"]["player_position"]
          team_id: string
          updated_at?: string
          venue_id?: string | null
          zone?: string | null
        }
        Update: {
          complex?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_date?: string | null
          match_time?: string | null
          pitch_type?: string | null
          position_wanted?: Database["public"]["Enums"]["player_position"]
          team_id?: string
          updated_at?: string
          venue_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_team_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "market_team_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_team_posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      match_dispute_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          profile_id: string
          voted_team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          profile_id: string
          voted_team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          profile_id?: string
          voted_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_dispute_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_dispute_votes_voted_team_id_fkey"
            columns: ["voted_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dispute_votes_voted_team_id_fkey"
            columns: ["voted_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_goals: {
        Row: {
          created_at: string
          goals_count: number
          id: string
          match_id: string
          player_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          goals_count: number
          id?: string
          match_id: string
          player_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          goals_count?: number
          id?: string
          match_id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_goals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          checkin_at: string | null
          did_checkin: boolean
          id: string
          is_guest: boolean
          is_result_loader: boolean
          lineup_role: Database["public"]["Enums"]["lineup_role"]
          match_id: string
          profile_id: string
          team_id: string
        }
        Insert: {
          checkin_at?: string | null
          did_checkin?: boolean
          id?: string
          is_guest?: boolean
          is_result_loader?: boolean
          lineup_role?: Database["public"]["Enums"]["lineup_role"]
          match_id: string
          profile_id: string
          team_id: string
        }
        Update: {
          checkin_at?: string | null
          did_checkin?: boolean
          id?: string
          is_guest?: boolean
          is_result_loader?: boolean
          lineup_role?: Database["public"]["Enums"]["lineup_role"]
          match_id?: string
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      match_proposals: {
        Row: {
          created_at: string
          duration_minutes: number
          format: Database["public"]["Enums"]["team_format"]
          from_team_id: string
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposed_by: string
          scheduled_at: string
          signal_amount: number | null
          status: Database["public"]["Enums"]["proposal_status"]
          total_cost: number | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          format: Database["public"]["Enums"]["team_format"]
          from_team_id: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposed_by: string
          scheduled_at: string
          signal_amount?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
          total_cost?: number | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          format?: Database["public"]["Enums"]["team_format"]
          from_team_id?: string
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_id?: string
          match_type?: Database["public"]["Enums"]["match_type"]
          proposed_by?: string
          scheduled_at?: string
          signal_amount?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
          total_cost?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_proposals_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_proposals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_proposals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          goals_against: number
          goals_scored: number
          id: string
          match_id: string
          mvp_id: string | null
          scorers: Json
          status: Database["public"]["Enums"]["result_status"]
          submitted_at: string
          submitted_by: string
          team_id: string
        }
        Insert: {
          goals_against: number
          goals_scored: number
          id?: string
          match_id: string
          mvp_id?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["result_status"]
          submitted_at?: string
          submitted_by: string
          team_id: string
        }
        Update: {
          goals_against?: number
          goals_scored?: number
          id?: string
          match_id?: string
          mvp_id?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["result_status"]
          submitted_at?: string
          submitted_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          challenge_id: string | null
          checkin_team_a_at: string | null
          checkin_team_b_at: string | null
          created_at: string
          disputed_at: string | null
          duration_minutes: number | null
          finished_at: string | null
          format: Database["public"]["Enums"]["team_format"] | null
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          match_type: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at: string | null
          scheduled_at: string | null
          season_id: string | null
          signal_amount: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          team_a_id: string
          team_b_id: string
          total_cost: number | null
          unique_code: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          checkin_team_a_at?: string | null
          checkin_team_b_at?: string | null
          created_at?: string
          disputed_at?: string | null
          duration_minutes?: number | null
          finished_at?: string | null
          format?: Database["public"]["Enums"]["team_format"] | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_type?: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          signal_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team_a_id: string
          team_b_id: string
          total_cost?: number | null
          unique_code?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          checkin_team_a_at?: string | null
          checkin_team_b_at?: string | null
          created_at?: string
          disputed_at?: string | null
          duration_minutes?: number | null
          finished_at?: string | null
          format?: Database["public"]["Enums"]["team_format"] | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_type?: Database["public"]["Enums"]["match_type"]
          reminder_24h_sent_at?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          signal_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          team_a_id?: string
          team_b_id?: string
          total_cost?: number | null
          unique_code?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          message_type: string
          sender_profile_id: string
          sender_team_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          sender_profile_id: string
          sender_team_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          sender_profile_id?: string
          sender_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_sender_team_id_fkey"
            columns: ["sender_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_team_id_fkey"
            columns: ["sender_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          is_read: boolean
          profile_id: string
          pushed_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          profile_id: string
          pushed_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          profile_id?: string
          pushed_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_attributions: {
        Row: {
          created_at: string
          profile_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          profile_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          profile_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_attributions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_attributions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_attributions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          profile_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          expo_push_token: string | null
          favorite_team: string | null
          full_name: string
          gender: string | null
          id: string
          is_admin: boolean
          preferred_position: Database["public"]["Enums"]["player_position"]
          referred_by: string | null
          strong_foot: string | null
          updated_at: string
          username: string
          zone: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          expo_push_token?: string | null
          favorite_team?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_admin?: boolean
          preferred_position?: Database["public"]["Enums"]["player_position"]
          referred_by?: string | null
          strong_foot?: string | null
          updated_at?: string
          username: string
          zone?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          expo_push_token?: string | null
          favorite_team?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_admin?: boolean
          preferred_position?: Database["public"]["Enums"]["player_position"]
          referred_by?: string | null
          strong_foot?: string | null
          updated_at?: string
          username?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      result_dispute_votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          voted_for_team: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          voted_for_team: string
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          voted_for_team?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_dispute_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voted_for_team_fkey"
            columns: ["voted_for_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voted_for_team_fkey"
            columns: ["voted_for_team"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          starts_at?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          access_token_secret_id: string | null
          created_at: string
          display_name: string
          external_id: string | null
          handle: string
          id: string
          is_active: boolean
          last_sync_error: string | null
          last_synced_at: string | null
          platform: string
          token_expires_at: string | null
        }
        Insert: {
          access_token_secret_id?: string | null
          created_at?: string
          display_name: string
          external_id?: string | null
          handle: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform: string
          token_expires_at?: string | null
        }
        Update: {
          access_token_secret_id?: string | null
          created_at?: string
          display_name?: string
          external_id?: string | null
          handle?: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform?: string
          token_expires_at?: string | null
        }
        Relationships: []
      }
      social_metrics_daily: {
        Row: {
          account_id: string
          captured_at: string
          created_at: string
          engagements: number | null
          followers: number | null
          following: number | null
          id: string
          posts_count: number | null
          profile_views: number | null
          raw: Json | null
          reach: number | null
          source: string
          views: number | null
        }
        Insert: {
          account_id: string
          captured_at: string
          created_at?: string
          engagements?: number | null
          followers?: number | null
          following?: number | null
          id?: string
          posts_count?: number | null
          profile_views?: number | null
          raw?: Json | null
          reach?: number | null
          source?: string
          views?: number | null
        }
        Update: {
          account_id?: string
          captured_at?: string
          created_at?: string
          engagements?: number | null
          followers?: number | null
          following?: number | null
          id?: string
          posts_count?: number | null
          profile_views?: number | null
          raw?: Json | null
          reach?: number | null
          source?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_metrics_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      team_join_requests: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      team_rankings: {
        Row: {
          created_at: string
          draws: number
          elo_score: number
          format: Database["public"]["Enums"]["team_format"]
          losses: number
          matches_played: number
          team_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          created_at?: string
          draws?: number
          elo_score?: number
          format: Database["public"]["Enums"]["team_format"]
          losses?: number
          matches_played?: number
          team_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          created_at?: string
          draws?: number
          elo_score?: number
          format?: Database["public"]["Enums"]["team_format"]
          losses?: number
          matches_played?: number
          team_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_rankings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_rankings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
        ]
      }
      team_stints: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_reconstructed: boolean
          last_role: Database["public"]["Enums"]["team_role"] | null
          leave_reason: Database["public"]["Enums"]["stint_leave_reason"] | null
          profile_id: string
          shield_url: string | null
          started_at: string
          stats: Json | null
          stats_computed_at: string | null
          team_id: string
          team_name: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_reconstructed?: boolean
          last_role?: Database["public"]["Enums"]["team_role"] | null
          leave_reason?:
            | Database["public"]["Enums"]["stint_leave_reason"]
            | null
          profile_id: string
          shield_url?: string | null
          started_at: string
          stats?: Json | null
          stats_computed_at?: string | null
          team_id: string
          team_name: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_reconstructed?: boolean
          last_role?: Database["public"]["Enums"]["team_role"] | null
          leave_reason?:
            | Database["public"]["Enums"]["stint_leave_reason"]
            | null
          profile_id?: string
          shield_url?: string | null
          started_at?: string
          stats?: Json | null
          stats_computed_at?: string | null
          team_id?: string
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_stints_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_stints_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_stints_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      teams: {
        Row: {
          category: Database["public"]["Enums"]["team_category"]
          created_at: string
          elo_rating: number
          fair_play_score: number
          id: string
          in_ranking: boolean
          invite_code: string
          is_active: boolean
          matches_played: number
          name: string
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws: number
          season_goals_against: number
          season_goals_for: number
          season_losses: number
          season_wins: number
          shield_url: string | null
          updated_at: string
          zone: string
        }
        Insert: {
          category: Database["public"]["Enums"]["team_category"]
          created_at?: string
          elo_rating?: number
          fair_play_score?: number
          id?: string
          in_ranking?: boolean
          invite_code?: string
          is_active?: boolean
          matches_played?: number
          name: string
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws?: number
          season_goals_against?: number
          season_goals_for?: number
          season_losses?: number
          season_wins?: number
          shield_url?: string | null
          updated_at?: string
          zone: string
        }
        Update: {
          category?: Database["public"]["Enums"]["team_category"]
          created_at?: string
          elo_rating?: number
          fair_play_score?: number
          id?: string
          in_ranking?: boolean
          invite_code?: string
          is_active?: boolean
          matches_played?: number
          name?: string
          preferred_format?: Database["public"]["Enums"]["team_format"]
          season_draws?: number
          season_goals_against?: number
          season_goals_for?: number
          season_losses?: number
          season_wins?: number
          shield_url?: string | null
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at: string
          reason: string | null
        }
        Insert: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at?: string
          reason?: string | null
        }
        Update: {
          blocked_profile_id?: string
          blocker_profile_id?: string
          created_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          created_at: string
          formats: Database["public"]["Enums"]["team_format"][]
          google_cid: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          phone: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          formats?: Database["public"]["Enums"]["team_format"][]
          google_cid?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          phone?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          formats?: Database["public"]["Enums"]["team_format"][]
          google_cid?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          phone?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "v_venues"
            referencedColumns: ["zone_id"]
          },
          {
            foreignKeyName: "venues_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_claims: {
        Row: {
          admin_notes: string | null
          claimed_by: string
          claiming_team_id: string
          created_at: string
          id: string
          match_id: string
          mvp_id: string | null
          photo_url: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          scorers: Json
          status: Database["public"]["Enums"]["wo_status"]
        }
        Insert: {
          admin_notes?: string | null
          claimed_by: string
          claiming_team_id: string
          created_at?: string
          id?: string
          match_id: string
          mvp_id?: string | null
          photo_url: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["wo_status"]
        }
        Update: {
          admin_notes?: string | null
          claimed_by?: string
          claiming_team_id?: string
          created_at?: string
          id?: string
          match_id?: string
          mvp_id?: string | null
          photo_url?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scorers?: Json
          status?: Database["public"]["Enums"]["wo_status"]
        }
        Relationships: [
          {
            foreignKeyName: "wo_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "wo_claims_claiming_team_id_fkey"
            columns: ["claiming_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_claiming_team_id_fkey"
            columns: ["claiming_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_mvp_id_fkey"
            columns: ["mvp_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "wo_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          age: number | null
          avatar_url: string | null
          created_at: string | null
          favorite_team: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          preferred_position:
            | Database["public"]["Enums"]["player_position"]
            | null
          strong_foot: string | null
          username: string | null
          zone: string | null
        }
        Insert: {
          age?: never
          avatar_url?: string | null
          created_at?: string | null
          favorite_team?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string | null
          preferred_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          strong_foot?: string | null
          username?: string | null
          zone?: string | null
        }
        Update: {
          age?: never
          avatar_url?: string | null
          created_at?: string | null
          favorite_team?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string | null
          preferred_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          strong_foot?: string | null
          username?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      v_player_stats: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          matches_played: number | null
          profile_id: string | null
          total_goals: number | null
          total_mvps: number | null
          total_wins: number | null
          username: string | null
        }
        Relationships: []
      }
      v_team_ranking: {
        Row: {
          category: Database["public"]["Enums"]["team_category"] | null
          draws: number | null
          elo_rating: number | null
          fair_play_score: number | null
          goal_diff: number | null
          goals_against: number | null
          goals_for: number | null
          id: string | null
          in_ranking: boolean | null
          losses: number | null
          name: string | null
          points: number | null
          preferred_format: Database["public"]["Enums"]["team_format"] | null
          shield_url: string | null
          wins: number | null
          zone: string | null
          zone_rank: number | null
        }
        Relationships: []
      }
      v_venues: {
        Row: {
          address: string | null
          formats: Database["public"]["Enums"]["team_format"][] | null
          id: string | null
          is_active: boolean | null
          lat: number | null
          lng: number | null
          name: string | null
          phone: string | null
          zone_id: string | null
          zone_name: string | null
          zone_slug: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_challenge: { Args: { p_challenge_id: string }; Returns: Json }
      admin_connect_instagram_account: {
        Args: {
          p_access_token: string
          p_account_id: string
          p_expires_in_seconds: number
          p_ig_user_id: string
          p_username: string
        }
        Returns: undefined
      }
      admin_disconnect_instagram_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      admin_get_suspension_status: {
        Args: { p_profile_ids: string[] }
        Returns: {
          banned_until: string
          is_suspended: boolean
          profile_id: string
        }[]
      }
      admin_resolve_dispute: {
        Args: {
          p_admin_notes?: string
          p_match_id: string
          p_resolution: string
        }
        Returns: Json
      }
      admin_set_admin_flag: {
        Args: { p_is_admin: boolean; p_profile_id: string }
        Returns: undefined
      }
      admin_suspend_user: {
        Args: { p_profile_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_unban_user: {
        Args: { p_profile_id: string; p_reason?: string }
        Returns: undefined
      }
      apply_match_outcome: {
        Args: {
          p_at?: string
          p_match: Database["public"]["Tables"]["matches"]["Row"]
        }
        Returns: undefined
      }
      block_user: {
        Args: { p_blocked_profile_id: string; p_reason?: string }
        Returns: undefined
      }
      blocks_exist_between: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      calculate_elo_delta: {
        Args: { loser_elo: number; winner_elo: number }
        Returns: number
      }
      checkin_geofence_radius_m: { Args: never; Returns: number }
      checkin_min_players: {
        Args: { p_format: Database["public"]["Enums"]["team_format"] }
        Returns: number
      }
      checkin_team: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_match_id: string
          p_team_id: string
        }
        Returns: Json
      }
      claim_wo: {
        Args: {
          p_match_id: string
          p_mvp_id?: string
          p_photo_url: string
          p_reason: string
          p_scorers?: Json
          p_team_id: string
        }
        Returns: string
      }
      compute_stint_stats: {
        Args: {
          p_from: string
          p_profile_id: string
          p_team_id: string
          p_to: string
        }
        Returns: Json
      }
      confirm_match_proposal: {
        Args: { p_match_id: string; p_proposal_id: string }
        Returns: undefined
      }
      content_weekly_highlights: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      current_profile_id: { Args: never; Returns: string }
      dashboard_activity_timeseries: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          day: string
          matches_created: number
          matches_finished: number
          matches_scheduled: number
        }[]
      }
      dashboard_attribution_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          signups: number
          utm_campaign: string
          utm_source: string
        }[]
      }
      dashboard_checkin_timeseries: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          checkins: number
          day: string
          participants: number
        }[]
      }
      dashboard_feedback_inbox: {
        Args: { limit_val?: number; offset_val?: number }
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          message: string
          profile_id: string
          username: string
        }[]
      }
      dashboard_growth_summary: {
        Args: never
        Returns: {
          matches_count: number
          profiles_count: number
          teams_count: number
        }[]
      }
      dashboard_growth_timeseries: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          day: string
          signups: number
          teams: number
        }[]
      }
      dashboard_logs_timeseries: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          day: string
          error_count: number
          info_count: number
          warn_count: number
        }[]
      }
      dashboard_market_timeseries: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          applications: number
          day: string
          player_posts: number
          team_posts: number
        }[]
      }
      dashboard_matches_by_status: {
        Args: never
        Returns: {
          matches_count: number
          status: Database["public"]["Enums"]["match_status"]
        }[]
      }
      dashboard_overview_kpis: {
        Args: never
        Returns: {
          active_teams: number
          checkin_rate_30d: number
          disputes_pending: number
          errors_24h: number
          errors_prev_24h: number
          matches_created_7d: number
          matches_created_prev_7d: number
          matches_live: number
          matches_today: number
          matches_upcoming_7d: number
          reports_pending: number
          signups_7d: number
          signups_prev_7d: number
          total_teams: number
          wo_claims_pending: number
        }[]
      }
      dashboard_referral_summary: {
        Args: never
        Returns: {
          ambassador_count: number
          referral_rate: number
          referred_count: number
          referrer_count: number
          total_profiles: number
        }[]
      }
      dashboard_retention_cohorts: {
        Args: { p_weeks?: number }
        Returns: {
          cohort_size: number
          cohort_week: string
          mature_28d: boolean
          mature_7d: boolean
          played_28d: number
          played_7d: number
        }[]
      }
      dashboard_social_timeseries: {
        Args: { p_from?: string; p_platform: string; p_to?: string }
        Returns: {
          day: string
          engagements: number
          followers: number
          following: number
          posts_count: number
          profile_views: number
          reach: number
          views: number
        }[]
      }
      dashboard_top_referrers: {
        Args: { p_limit?: number }
        Returns: {
          full_name: string
          is_ambassador: boolean
          profile_id: string
          referred_count: number
          username: string
        }[]
      }
      dashboard_users_list: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          avatar_url: string
          banned_until: string
          created_at: string
          full_name: string
          is_admin: boolean
          is_suspended: boolean
          matches_count: number
          profile_id: string
          referred_by_username: string
          teams_count: number
          total_count: number
          username: string
          zone: string
        }[]
      }
      deactivate_expired_market_posts: { Args: never; Returns: undefined }
      delete_own_account: { Args: never; Returns: undefined }
      elo_delta: {
        Args: { p_elo_rival: number; p_elo_self: number; p_score: number }
        Returns: number
      }
      enqueue_match_reminders: { Args: never; Returns: undefined }
      enqueue_season_expiry_reminder: { Args: never; Returns: undefined }
      ensure_team_ranking_row: {
        Args: {
          p_format: Database["public"]["Enums"]["team_format"]
          p_team_id: string
        }
        Returns: undefined
      }
      fair_play_absence_penalty: { Args: { p_reason: string }; Returns: number }
      get_disputed_matches: {
        Args: never
        Returns: {
          format: Database["public"]["Enums"]["team_format"]
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          scheduled_at: string
          team_a_fps: number
          team_a_goals: number
          team_a_goals_against: number
          team_a_id: string
          team_a_name: string
          team_a_votes: number
          team_b_fps: number
          team_b_goals: number
          team_b_goals_against: number
          team_b_id: string
          team_b_name: string
          team_b_votes: number
        }[]
      }
      get_favorite_team_census: {
        Args: never
        Returns: {
          fans: number
          percentage: number
          team_name: string
        }[]
      }
      get_instagram_token: {
        Args: { p_account_id: string }
        Returns: {
          access_token: string
          ig_user_id: string
          token_expires_at: string
        }[]
      }
      get_join_request_applicant_push_token: {
        Args: { p_request_id: string }
        Returns: string
      }
      get_market_inbox: {
        Args: { p_profile_id: string }
        Returns: {
          created_at: string
          id: string
          last_msg_at: string
          last_msg_content: string
          last_msg_sender: string
          last_read_at: string
          player_avatar: string
          player_full_name: string
          player_id: string
          team_id: string
          team_name: string
          team_shield: string
          type: string
        }[]
      }
      get_match_detail: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: Json
      }
      get_match_scorers: {
        Args: { p_match_id: string; p_team_id: string }
        Returns: {
          full_name: string
          goals_count: number
          player_id: string
        }[]
      }
      get_my_matches: {
        Args: { p_team_id: string }
        Returns: {
          checkin_team_a_at: string
          checkin_team_b_at: string
          finished_at: string
          format: Database["public"]["Enums"]["team_format"]
          has_pending_cancellation: boolean
          id: string
          location: string
          match_type: Database["public"]["Enums"]["match_type"]
          proposal_format: Database["public"]["Enums"]["team_format"]
          proposal_from_team_id: string
          proposal_id: string
          proposal_location: string
          proposal_scheduled_at: string
          proposal_status: Database["public"]["Enums"]["proposal_status"]
          result_team_a: number
          result_team_b: number
          scheduled_at: string
          signal_amount: number
          started_at: string
          status: Database["public"]["Enums"]["match_status"]
          team_a_elo: number
          team_a_id: string
          team_a_name: string
          team_a_shield_url: string
          team_b_elo: number
          team_b_id: string
          team_b_name: string
          team_b_shield_url: string
          total_cost: number
          unique_code: string
          venue_id: string
          venue_name: string
        }[]
      }
      get_nearest_venues: {
        Args: { p_lat: number; p_limit?: number; p_lng: number }
        Returns: {
          address: string
          distance_km: number
          formats: Database["public"]["Enums"]["team_format"][]
          id: string
          lat: number
          lng: number
          name: string
          phone: string
          zone_id: string
        }[]
      }
      get_own_profile: {
        Args: never
        Returns: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          expo_push_token: string | null
          favorite_team: string | null
          full_name: string
          gender: string | null
          id: string
          is_admin: boolean
          preferred_position: Database["public"]["Enums"]["player_position"]
          referred_by: string | null
          strong_foot: string | null
          updated_at: string
          username: string
          zone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_pending_wo_claims: {
        Args: never
        Returns: {
          claim_id: string
          claiming_team_id: string
          claiming_team_name: string
          created_at: string
          match_id: string
          mvp_id: string
          mvp_name: string
          opponent_team_name: string
          photo_url: string
          reason: string
          scheduled_at: string
          scorers: Json
        }[]
      }
      get_player_badges: {
        Args: { p_profile_id: string }
        Returns: {
          criteria_description: string
          entity_type: string
          icon_url: string
          id: string
          is_earned: boolean
          name: string
          slug: string
        }[]
      }
      get_player_career: { Args: { p_profile_id: string }; Returns: Json }
      get_player_global_stats: { Args: { p_profile_id: string }; Returns: Json }
      get_player_leaderboard: {
        Args: { p_season_id?: string; p_stat: string; p_zone?: string }
        Returns: {
          avatar_url: string
          full_name: string
          profile_id: string
          rank_position: number
          team_id: string
          team_name: string
          username: string
          value: number
          zone: string
        }[]
      }
      get_team_badges: {
        Args: { p_team_id: string }
        Returns: {
          criteria_description: string
          entity_type: string
          icon_url: string
          id: string
          is_earned: boolean
          name: string
          slug: string
        }[]
      }
      get_team_challenges_inbox: {
        Args: { p_team_id: string }
        Returns: {
          challenge_id: string
          created_at: string
          creator_name: string
          direction: string
          match_type: Database["public"]["Enums"]["match_type"]
          opponent_elo: number
          opponent_shield_url: string
          opponent_team_id: string
          opponent_team_name: string
          status: string
        }[]
      }
      get_team_h2h: {
        Args: { p_team_a_id: string; p_team_b_id: string }
        Returns: {
          match_id: string
          match_type: Database["public"]["Enums"]["match_type"]
          scheduled_at: string
          status: Database["public"]["Enums"]["match_status"]
          team_a_goals: number
          team_a_id: string
          team_a_name: string
          team_b_goals: number
          team_b_id: string
          team_b_name: string
        }[]
      }
      get_team_member_push_token: {
        Args: { p_profile_id: string; p_team_id: string }
        Returns: string
      }
      get_team_ranking: {
        Args: {
          p_category?: Database["public"]["Enums"]["team_category"]
          p_format?: Database["public"]["Enums"]["team_format"]
          p_zone?: string
        }
        Returns: {
          category: Database["public"]["Enums"]["team_category"]
          elo_rating: number
          fair_play_score: number
          matches_played: number
          preferred_format: Database["public"]["Enums"]["team_format"]
          rank_position: number
          season_draws: number
          season_losses: number
          season_wins: number
          shield_url: string
          team_id: string
          team_name: string
          zone: string
        }[]
      }
      get_unread_market_chat_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      grant_captain_role: {
        Args: { p_new_captain_profile_id: string; p_team_id: string }
        Returns: Json
      }
      has_block_with: { Args: { p_other: string }; Returns: boolean }
      is_ranking_match_allowed: {
        Args: { p_season_id: string; p_team_a_id: string; p_team_b_id: string }
        Returns: boolean
      }
      join_match_as_guest: {
        Args: { p_team_side: string; p_unique_code: string }
        Returns: Json
      }
      leave_team_as_member: { Args: { p_team_id: string }; Returns: Json }
      list_my_blocks: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          profile_id: string
          reason: string
          username: string
        }[]
      }
      log_checkin_distance: {
        Args: {
          p_distance_m: number
          p_match_id: string
          p_profile_id: string
          p_radius_m: number
          p_source: string
          p_team_id: string
          p_venue_id: string
        }
        Returns: undefined
      }
      mark_instagram_sync: {
        Args: { p_account_id: string; p_error?: string }
        Returns: undefined
      }
      match_guest_code_expires_at: {
        Args: { p_created_at: string; p_scheduled_at: string }
        Returns: string
      }
      match_schedule_conflict: {
        Args: {
          p_duration_minutes: number
          p_match_id: string
          p_start: string
          p_team_ids: string[]
        }
        Returns: string
      }
      recalculate_team_fps: { Args: { p_team_id: string }; Returns: undefined }
      remove_team_member: {
        Args: { p_profile_id: string; p_team_id: string }
        Returns: Json
      }
      request_match_cancellation: {
        Args: {
          p_match_id: string
          p_notes?: string
          p_reason: string
          p_team_id: string
        }
        Returns: undefined
      }
      resolve_match: { Args: { p_match_id: string }; Returns: undefined }
      resolve_wo_claim: {
        Args: { p_admin_notes?: string; p_approve: boolean; p_claim_id: string }
        Returns: undefined
      }
      respond_to_cancellation_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: string
      }
      save_own_profile: {
        Args: {
          p_date_of_birth: string
          p_expo_push_token?: string
          p_favorite_team?: string
          p_full_name: string
          p_gender: string
          p_preferred_position: Database["public"]["Enums"]["player_position"]
          p_strong_foot: string
          p_username: string
          p_zone: string
        }
        Returns: string
      }
      search_teams: {
        Args: {
          p_category?: Database["public"]["Enums"]["team_category"]
          p_format?: Database["public"]["Enums"]["team_format"]
          p_max_elo?: number
          p_min_elo?: number
          p_search?: string
          p_zone?: string
        }
        Returns: {
          category: Database["public"]["Enums"]["team_category"]
          elo_rating: number
          fair_play_score: number
          in_ranking: boolean
          matches_played: number
          preferred_format: Database["public"]["Enums"]["team_format"]
          season_draws: number
          season_losses: number
          season_wins: number
          shield_url: string
          team_id: string
          team_name: string
          zone: string
        }[]
      }
      send_challenge: {
        Args: {
          p_from_team_id: string
          p_match_type: string
          p_to_team_id: string
        }
        Returns: Json
      }
      service_snapshot_upsert: {
        Args: {
          p_account_id: string
          p_captured_at: string
          p_engagements?: number
          p_followers?: number
          p_following?: number
          p_posts?: number
          p_profile_views?: number
          p_raw?: Json
          p_reach?: number
          p_views?: number
        }
        Returns: undefined
      }
      set_referral: {
        Args: {
          p_referred_by_username: string
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: undefined
      }
      social_snapshot_upsert: {
        Args: {
          p_account_id: string
          p_captured_at: string
          p_engagements?: number
          p_followers?: number
          p_following?: number
          p_posts?: number
          p_profile_views?: number
          p_reach?: number
          p_source?: string
          p_views?: number
        }
        Returns: undefined
      }
      submit_dispute_vote: {
        Args: { p_match_id: string; p_voted_team_id: string }
        Returns: undefined
      }
      submit_team_checkin: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_match_id: string
          p_players: Json
          p_team_id: string
        }
        Returns: Json
      }
      sweep_disputed_matches: { Args: never; Returns: Json }
      sweep_stale_matches: { Args: never; Returns: Json }
      transfer_captaincy_and_leave: {
        Args: { p_team_id: string; p_to_profile_id: string }
        Returns: Json
      }
      transfer_to_team: {
        Args: { p_from_team_id?: string; p_to_team_id: string }
        Returns: Json
      }
      transition_season: {
        Args: { p_ends_at: string; p_new_name: string; p_starts_at: string }
        Returns: string
      }
      unblock_user: {
        Args: { p_blocked_profile_id: string }
        Returns: undefined
      }
      update_instagram_token: {
        Args: {
          p_access_token: string
          p_account_id: string
          p_expires_in_seconds: number
        }
        Returns: undefined
      }
      verify_instagram_sync_secret: {
        Args: { p_candidate: string }
        Returns: boolean
      }
      verify_push_webhook_secret: {
        Args: { p_candidate: string }
        Returns: boolean
      }
    }
    Enums: {
      challenge_status: "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "CANCELADA"
      conversation_type: "MATCH_CHAT" | "MARKET_DM"
      join_request_status: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"
      lineup_role: "TITULAR" | "SUPLENTE"
      market_post_type: "BUSCA_EQUIPO" | "BUSCA_PARTIDO"
      match_status:
        | "PENDIENTE"
        | "CONFIRMADO"
        | "EN_VIVO"
        | "FINALIZADO"
        | "EN_DISPUTA"
        | "WO_A"
        | "WO_B"
        | "CANCELADO"
      match_type: "RANKING" | "AMISTOSO"
      notification_type:
        | "SOLICITUD_UNION_EQUIPO"
        | "SOLICITUD_UNION_ACEPTADA"
        | "SOLICITUD_UNION_RECHAZADA"
        | "DESAFIO_RECIBIDO"
        | "DESAFIO_ACEPTADO"
        | "DESAFIO_RECHAZADO"
        | "PARTIDO_CONFIRMADO"
        | "PARTIDO_CANCELADO"
        | "PARTIDO_FINALIZADO"
        | "RESULTADO_EN_DISPUTA"
        | "RECORDATORIO_PARTIDO_24H"
        | "WO_RECLAMADO"
        | "MENSAJE_NUEVO"
        | "ROL_ACTUALIZADO"
        | "EXPULSADO_EQUIPO"
        | "CANCELACION_SOLICITADA"
        | "CANCELACION_RECHAZADA"
        | "POSTULACION_RECIBIDA"
        | "POSTULACION_RESPONDIDA"
        | "TEMPORADA_VENCIDA"
        | "TEMPORADA_INICIADA"
        | "WO_APROBADO"
        | "WO_RECHAZADO"
        | "WO_AUTOMATICO"
        | "DISPUTA_RESUELTA"
      player_position:
        | "CUALQUIERA"
        | "ARQUERO"
        | "DEFENSOR"
        | "MEDIOCAMPISTA"
        | "DELANTERO"
      proposal_status: "PENDIENTE" | "ACEPTADA" | "RECHAZADA"
      report_entity_type: "USER" | "MATCH"
      report_status: "PENDING" | "REVIEWED" | "DISMISSED" | "ACTIONED"
      result_status: "PENDIENTE" | "CARGADO" | "CONFIRMADO" | "EN_DISPUTA"
      stint_leave_reason:
        | "ABANDONO"
        | "EXPULSADO"
        | "TRANSFERENCIA"
        | "EQUIPO_DISUELTO"
      team_category: "HOMBRES" | "MUJERES" | "MIXTO"
      team_format:
        | "FUTBOL_5"
        | "FUTBOL_6"
        | "FUTBOL_7"
        | "FUTBOL_8"
        | "FUTBOL_9"
        | "FUTBOL_11"
      team_role: "CAPITAN" | "SUBCAPITAN" | "JUGADOR" | "DIRECTOR_TECNICO"
      wo_status: "PENDIENTE_REVISION" | "APROBADO" | "RECHAZADO"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      challenge_status: ["ENVIADA", "ACEPTADA", "RECHAZADA", "CANCELADA"],
      conversation_type: ["MATCH_CHAT", "MARKET_DM"],
      join_request_status: ["PENDIENTE", "ACEPTADA", "RECHAZADA"],
      lineup_role: ["TITULAR", "SUPLENTE"],
      market_post_type: ["BUSCA_EQUIPO", "BUSCA_PARTIDO"],
      match_status: [
        "PENDIENTE",
        "CONFIRMADO",
        "EN_VIVO",
        "FINALIZADO",
        "EN_DISPUTA",
        "WO_A",
        "WO_B",
        "CANCELADO",
      ],
      match_type: ["RANKING", "AMISTOSO"],
      notification_type: [
        "SOLICITUD_UNION_EQUIPO",
        "SOLICITUD_UNION_ACEPTADA",
        "SOLICITUD_UNION_RECHAZADA",
        "DESAFIO_RECIBIDO",
        "DESAFIO_ACEPTADO",
        "DESAFIO_RECHAZADO",
        "PARTIDO_CONFIRMADO",
        "PARTIDO_CANCELADO",
        "PARTIDO_FINALIZADO",
        "RESULTADO_EN_DISPUTA",
        "RECORDATORIO_PARTIDO_24H",
        "WO_RECLAMADO",
        "MENSAJE_NUEVO",
        "ROL_ACTUALIZADO",
        "EXPULSADO_EQUIPO",
        "CANCELACION_SOLICITADA",
        "CANCELACION_RECHAZADA",
        "POSTULACION_RECIBIDA",
        "POSTULACION_RESPONDIDA",
        "TEMPORADA_VENCIDA",
        "TEMPORADA_INICIADA",
        "WO_APROBADO",
        "WO_RECHAZADO",
        "WO_AUTOMATICO",
        "DISPUTA_RESUELTA",
      ],
      player_position: [
        "CUALQUIERA",
        "ARQUERO",
        "DEFENSOR",
        "MEDIOCAMPISTA",
        "DELANTERO",
      ],
      proposal_status: ["PENDIENTE", "ACEPTADA", "RECHAZADA"],
      report_entity_type: ["USER", "MATCH"],
      report_status: ["PENDING", "REVIEWED", "DISMISSED", "ACTIONED"],
      result_status: ["PENDIENTE", "CARGADO", "CONFIRMADO", "EN_DISPUTA"],
      stint_leave_reason: [
        "ABANDONO",
        "EXPULSADO",
        "TRANSFERENCIA",
        "EQUIPO_DISUELTO",
      ],
      team_category: ["HOMBRES", "MUJERES", "MIXTO"],
      team_format: [
        "FUTBOL_5",
        "FUTBOL_6",
        "FUTBOL_7",
        "FUTBOL_8",
        "FUTBOL_9",
        "FUTBOL_11",
      ],
      team_role: ["CAPITAN", "SUBCAPITAN", "JUGADOR", "DIRECTOR_TECNICO"],
      wo_status: ["PENDIENTE_REVISION", "APROBADO", "RECHAZADO"],
    },
  },
} as const
