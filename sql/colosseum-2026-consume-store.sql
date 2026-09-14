-- SafeGate Colosseum 2026
-- Durable consume-once store for hosted agent commerce.
--
-- IMPORTANT:
-- This file is only a migration artifact in Git.
-- Committing it does NOT mutate production.
--
-- Security model:
-- - no wallet/private-key material is stored
-- - no payment authorization capability is stored
-- - service_role-only RPC execution
-- - unique constraints enforce durable single-consume

begin;

create table if not exists public.safegate_colosseum_consumes (
    consume_key text primary key,
    request_id text not null,
    request_hash text not null,
    chain_id bigint not null,
    transaction_hash text not null,
    created_at timestamptz not null default now(),

    constraint safegate_colosseum_consume_key_format
        check (consume_key ~ '^[a-f0-9]{64}$'),

    constraint safegate_colosseum_request_hash_format
        check (request_hash ~ '^[a-f0-9]{64}$'),

    constraint safegate_colosseum_chain_id_positive
        check (chain_id > 0),

    constraint safegate_colosseum_tx_hash_format
        check (transaction_hash ~ '^0x[a-f0-9]{64}$'),

    constraint safegate_colosseum_chain_tx_unique
        unique (chain_id, transaction_hash)
);

alter table public.safegate_colosseum_consumes
    enable row level security;

revoke all
    on table public.safegate_colosseum_consumes
    from anon, authenticated;

create or replace function public.safegate_colosseum_consume_once(
    p_consume_key text,
    p_request_id text,
    p_request_hash text,
    p_chain_id bigint,
    p_transaction_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    affected integer;
begin
    insert into public.safegate_colosseum_consumes (
        consume_key,
        request_id,
        request_hash,
        chain_id,
        transaction_hash
    )
    values (
        lower(p_consume_key),
        p_request_id,
        lower(p_request_hash),
        p_chain_id,
        lower(p_transaction_hash)
    )
    on conflict do nothing;

    get diagnostics affected = row_count;

    return affected = 1;
end;
$$;

revoke all
    on function public.safegate_colosseum_consume_once(
        text,
        text,
        text,
        bigint,
        text
    )
    from public, anon, authenticated;

grant execute
    on function public.safegate_colosseum_consume_once(
        text,
        text,
        text,
        bigint,
        text
    )
    to service_role;

commit;