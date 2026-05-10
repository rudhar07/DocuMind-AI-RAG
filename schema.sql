-- ============================================================
-- DocuMind AI — Supabase schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: drops and recreates the table + function each time.
-- ============================================================

-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Clean slate (so re-running this script always gives a known-good state).
drop function if exists match_documents(vector, int);
drop table if exists documents cascade;

-- 3. Table for chunks + embeddings
--    Embedding dimension MUST match the embedding model.
--    Google text-embedding-004 → 768 dims.
create table documents (
  id          bigserial primary key,
  content     text not null,
  metadata    jsonb,
  embedding   vector(768)
);

-- 4. HNSW index for fast cosine similarity search
create index documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

-- 5. Similarity-search RPC.
--    pgvector's <=> operator returns cosine *distance* (0 = identical, 2 = opposite).
--    We return similarity = 1 - distance so it reads naturally (1.0 = perfect).
create or replace function match_documents(
  query_embedding vector(768),
  match_count     int default 4
)
returns table (
  id          bigint,
  content     text,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
