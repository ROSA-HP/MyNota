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

/** Flashcards: new cards and reviews per day (Settings › Study). Read on their own, so the
 *  profile query does not depend on the Phase 4 migration. */
export type StudyLimits = { daily_new_limit: number; daily_review_limit: number }

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

export type NodeLevel = 'book' | 'chapter' | 'section' | 'block'
export type NodeType =
  | 'definition'
  | 'concept'
  | 'process_step'
  | 'event'
  | 'person'
  | 'formula'
  | 'example'
  | 'comparison'
  | 'key_fact'
  | 'warning'
  | 'vocabulary'
export type Importance = 'core' | 'supporting' | 'extra'
export type BranchView = 'tree' | 'process' | 'timeline' | 'comparison' | 'cause_effect'
export type RelationType =
  | 'causes'
  | 'leads_to'
  | 'part_of'
  | 'example_of'
  | 'contrasts_with'
  | 'prerequisite'
  | 'analogy'
  | 'derived_from'
  | 'related'

/** Detail blocks (stored as JSON in nodes.details). Validated with Zod in src/features/workspace/model. */
export type DetailBlock =
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'example'; text: string; translation?: string }
  | {
      kind: 'vocab'
      term: string
      meaning: string
      article?: string
      plural?: string
      lang?: string
    }
  | { kind: 'formula'; latex: string; variables?: string }
  | { kind: 'question'; front: string; back: string }
  | { kind: 'cloze'; text: string }

export type NodeRow = {
  id: string
  map_id: string
  parent_id: string | null
  sort_order: number
  level: NodeLevel
  title: string
  summary: string
  type: NodeType | null
  icon: string | null
  color: ChapterColor | null
  importance: Importance
  details: DetailBlock[]
  lang: string | null
  dir: 'ltr' | 'rtl'
  branch_view: BranchView
  position: { x: number; y: number } | null
  size: { w: number; h: number } | null
  collapsed: boolean
  source: { paragraphs: number[]; page?: number }
  ai_added: boolean
  ai_added_reason: string | null
  origin: 'user' | 'ai'
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RelationRow = {
  id: string
  map_id: string
  from_node: string
  to_node: string
  type: RelationType
  label: string
  direction: 'forward' | 'backward' | 'both'
  /** dismissed: an AI suggestion the student turned down (kept so it is never suggested again). */
  status: 'suggested' | 'accepted' | 'dismissed'
  /** AI suggestions only. */
  confidence: 'high' | 'medium' | null
  origin: 'user' | 'ai'
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SourceParagraph = { n: number; text: string; page?: number }

export type SourceRow = {
  id: string
  map_id: string
  chapter_node_id: string | null
  kind: 'pdf' | 'images' | 'text'
  storage_path: string | null
  pages: number | null
  paragraphs: SourceParagraph[]
  /** Book uploads: the original stays on the device; these find it again for page previews. */
  file_name: string | null
  file_size: number | null
  file_hash: string | null
  created_by: string | null
  created_at: string
}

export type AiProvider = 'gemini' | 'anthropic' | 'openai_compatible'

export type CardType = 'basic' | 'reversed' | 'vocab' | 'cloze'

export type CardRow = {
  id: string
  map_id: string
  node_id: string | null
  type: CardType
  front: string
  back: string
  languages: string[]
  /** auto: from a block's type · ai: the AI's card ideas · manual: written by hand */
  origin: 'auto' | 'ai' | 'manual'
  /** Made cards: the rule that made it ('type', 'q:<n>'), so syncing never adds it twice. */
  source_key: string | null
  /** A made card the student removed (hidden, so syncing never makes it again). */
  suspended: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** FSRS state of one card for one student (0 new, 1 learning, 2 review, 3 relearning). */
export type CardProgressRow = {
  card_id: string
  user_id: string
  map_id: string
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: 0 | 1 | 2 | 3
  last_review: string | null
  updated_at: string
}

export type ReviewLogRow = {
  id: string
  card_id: string
  user_id: string
  map_id: string
  rating: 1 | 2 | 3 | 4
  state: 0 | 1 | 2 | 3
  elapsed_days: number
  scheduled_days: number
  duration_ms: number | null
  reviewed_at: string
}

/** One search_all() result (Phase 4.5). source: title is the paragraph number, node_id its chapter. */
export type SearchResultRow = {
  kind: 'map' | 'node' | 'card' | 'source'
  map_id: string
  map_title: string
  map_type: MapRow['type']
  node_id: string | null
  card_id: string | null
  title: string
  snippet: string
  rank: number
}

export type DeckStatsRow = {
  map_id: string
  total: number
  new_cards: number
  due: number
  learning: number
  mastered: number
}

/** Library card numbers (Postgres function map_stats, read under RLS). */
export type MapStatsRow = {
  map_id: string
  blocks: number
  chapters: number
  chapters_built: number
  chapter_colors: ChapterColor[]
}

export type AiJobRow = {
  id: string
  map_id: string
  chapter_node_id: string | null
  node_id: string | null
  pass: 'outline' | 'details' | 'links' | 'merge' | 'tool'
  provider: AiProvider
  model: string
  prompt_version: string
  status: 'queued' | 'running' | 'done' | 'failed'
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
  error: string | null
  created_by: string
  created_at: string
  updated_at: string
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
        ProfileRow & StudyLimits,
        never,
        Partial<
          Pick<ProfileRow, 'username' | 'name' | 'avatar_url' | 'ui_language' | 'theme'> &
            StudyLimits
        >
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
      nodes: Table<
        NodeRow,
        Pick<NodeRow, 'map_id' | 'level' | 'title'> &
          Partial<
            Omit<NodeRow, 'map_id' | 'level' | 'title' | 'created_by' | 'created_at' | 'updated_at'>
          >,
        Partial<Omit<NodeRow, 'id' | 'map_id' | 'created_by' | 'created_at' | 'updated_at'>>
      >
      relations: Table<
        RelationRow,
        Pick<RelationRow, 'map_id' | 'from_node' | 'to_node'> &
          Partial<
            Omit<
              RelationRow,
              'map_id' | 'from_node' | 'to_node' | 'created_by' | 'created_at' | 'updated_at'
            >
          >,
        Partial<
          Pick<
            RelationRow,
            'type' | 'label' | 'direction' | 'status' | 'confidence' | 'from_node' | 'to_node'
          >
        >
      >
      sources: Table<
        SourceRow,
        Pick<SourceRow, 'map_id' | 'paragraphs'> &
          Partial<
            Pick<
              SourceRow,
              | 'id'
              | 'chapter_node_id'
              | 'kind'
              | 'storage_path'
              | 'pages'
              | 'file_name'
              | 'file_size'
              | 'file_hash'
            >
          >,
        never
      >
      ai_jobs: Table<
        AiJobRow,
        Pick<AiJobRow, 'map_id' | 'pass' | 'provider' | 'model' | 'prompt_version'> &
          Partial<Pick<AiJobRow, 'id' | 'chapter_node_id' | 'node_id' | 'status'>>,
        Partial<Pick<AiJobRow, 'status' | 'tokens_in' | 'tokens_out' | 'duration_ms' | 'error'>>
      >
      cards: Table<
        CardRow,
        Pick<CardRow, 'map_id' | 'front'> &
          Partial<
            Pick<
              CardRow,
              | 'id'
              | 'node_id'
              | 'type'
              | 'back'
              | 'languages'
              | 'origin'
              | 'source_key'
              | 'suspended'
            >
          >,
        Partial<Pick<CardRow, 'type' | 'front' | 'back' | 'languages' | 'node_id' | 'suspended'>>
      >
      card_progress: Table<
        CardProgressRow,
        Omit<CardProgressRow, 'updated_at' | 'user_id'> & Partial<Pick<CardProgressRow, 'user_id'>>,
        Partial<Omit<CardProgressRow, 'card_id' | 'user_id' | 'map_id' | 'updated_at'>>
      >
      review_logs: Table<
        ReviewLogRow,
        Omit<ReviewLogRow, 'id' | 'user_id' | 'reviewed_at'> &
          Partial<Pick<ReviewLogRow, 'id' | 'user_id' | 'reviewed_at'>>,
        never
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
      map_stats: { Args: { map_ids: string[] }; Returns: MapStatsRow[] }
      deck_stats: { Args: { map_ids?: string[] | null }; Returns: DeckStatsRow[] }
      study_activity: {
        Args: { days?: number; tz?: string }
        Returns: Array<{ day: string; reviews: number }>
      }
      search_all: { Args: { q: string; max_results?: number }; Returns: SearchResultRow[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
