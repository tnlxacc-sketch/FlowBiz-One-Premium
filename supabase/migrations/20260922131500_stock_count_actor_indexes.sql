create index if not exists stock_counts_submitted_by_idx on public.stock_counts(submitted_by);
create index if not exists stock_counts_finalized_by_idx on public.stock_counts(finalized_by);
