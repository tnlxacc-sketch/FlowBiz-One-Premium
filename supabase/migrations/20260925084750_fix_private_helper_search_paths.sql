-- Synced from production Supabase migration 20260925084750: fix_private_helper_search_paths

alter function private.master_ref_count_text(text, text, uuid, text) set search_path = private, public;
alter function private.master_ref_count(text, text, uuid, uuid) set search_path = private, public;
alter function private.master_table_name(text) set search_path = private, public;
