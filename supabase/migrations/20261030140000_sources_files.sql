-- MyNota · Phase 3 · book uploads
-- PDFs and photos stay on the student's device (IndexedDB). Postgres keeps only the extracted
-- paragraphs (with page numbers, inside `paragraphs`) and enough about the file to find the
-- device copy again for page previews: its name, size and SHA-256.

alter table public.sources
  add column file_name text,
  add column file_size bigint,
  add column file_hash text,
  add constraint sources_file_name_length
    check (file_name is null or char_length(file_name) between 1 and 255),
  -- Upload limit: 50 MB per book (decided 2026-10-30).
  add constraint sources_file_size_range
    check (file_size is null or file_size between 0 and 52428800),
  add constraint sources_file_hash_format
    check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$');

comment on column public.sources.file_hash is
  'SHA-256 of the original file. The file itself is never uploaded; it stays on the device.';
