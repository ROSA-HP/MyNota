// Hand-written to match supabase/migrations. Replace with `supabase gen types typescript`
// once the CLI is linked; keep the shapes identical.

export type ChapterColor =
  'yellow' | 'coral' | 'sky' | 'mint' | 'lavender' | 'pink' | 'orange' | 'lime'

export type ProfileRow = {
  id: string
  username: string
  name: string
  avatar_url: string | null
  role: 'student' | 'admin'
  status: 'active' | 'suspended'
  two_factor_enabled: boolean
  ui_language: 'en' | 'ar' | 'de'
  theme: 'light' | 'dark' | 'system'
  created_at: string
  updated_at: string
}

export type SubjectRow = {
  id: string
  owner_id: string
  name: string
  color: ChapterColor
  sort_order: number
  created_at: string
  updated_at: string
}

/** link_token is intentionally absent: it is not readable through the API. */
export type MapRow = {
  id: string
  owner_id: string
  subject_id: string | null
  type: 'book' | 'notes' | 'blank'
  title: string
  cover_color: ChapterColor
  languages: string[]
  link_access: 'off' | 'view' | 'edit'
  link_expires_at: string | null
  created_at: string
  updated_at: string
}

export type MapMemberRow = {
  map_id: string
  user_id: string
  role: 'editor' | 'viewer'
  invited_by: string | null
  added_at: string
}

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        never,
        Partial<Pick<ProfileRow, 'username' | 'name' | 'avatar_url' | 'ui_language' | 'theme'>>
      >
      subjects: Table<
        SubjectRow,
        Pick<SubjectRow, 'name'> & Partial<Pick<SubjectRow, 'id' | 'color' | 'sort_order'>>,
        Partial<Pick<SubjectRow, 'name' | 'color' | 'sort_order'>>
      >
      maps: Table<
        MapRow,
        Pick<MapRow, 'type' | 'title'> &
          Partial<Pick<MapRow, 'id' | 'subject_id' | 'cover_color' | 'languages'>>,
        Partial<Pick<MapRow, 'subject_id' | 'type' | 'title' | 'cover_color' | 'languages'>>
      >
      map_members: Table<
        MapMemberRow,
        Pick<MapMemberRow, 'map_id' | 'user_id' | 'role'>,
        Partial<Pick<MapMemberRow, 'role'>>
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      username_available: { Args: { candidate: string }; Returns: boolean }
      map_role: { Args: { target_map: string }; Returns: 'owner' | 'editor' | 'viewer' | null }
      is_admin: { Args: never; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
