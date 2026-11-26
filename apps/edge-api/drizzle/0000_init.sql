CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'candidate_cluster',
  chapter_id TEXT NOT NULL,
  origin_anchor TEXT,
  title TEXT NOT NULL,
  concise_markdown TEXT NOT NULL,
  heat_score INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_chapter ON kg_nodes(chapter_id);

CREATE TABLE IF NOT EXISTS kg_edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  relation TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'solid'
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source);

CREATE TABLE IF NOT EXISTS confusion_logs (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  zoom_level TEXT NOT NULL,
  superstep_frame_id INTEGER,
  active_lenses_json TEXT NOT NULL DEFAULT '[]',
  selected_text TEXT NOT NULL,
  user_question TEXT NOT NULL,
  sprout_response_json TEXT NOT NULL,
  confusion_type TEXT NOT NULL,
  endorsed_for_graph INTEGER NOT NULL DEFAULT 0,
  evolution_status TEXT NOT NULL DEFAULT 'logged',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_confusion_chapter_ref ON confusion_logs(chapter_id, target_ref);
