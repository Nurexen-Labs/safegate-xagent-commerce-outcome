-- SafeGate Colosseum 2026
-- Durable consume-once store for hosted Base agent commerce.
--
-- FORWARD MIGRATION
--
-- This file is intentionally one-time and fail-closed.
-- It must not silently replace an existing production table or RPC.
--
-- Stored:
-- - consume key
-- - request ID
-- - request hash
-- - Base chain ID
-- - transaction hash
--
-- Not stored:
-- - wallet credentials
-- - private keys
-- - seed phrases
-- - payment authorization
-- - request bodies
-- - service-role credentials

begin;

do $$
begin
    if to_regclass(
        'public.safegate_colosseum_consumes'
    ) is not null then
        raise exception
            'SAFEGATE_COLOSSEUM_TABLE_ALREADY_EXISTS';
    end if;

    if to_regprocedure(
        'public.safegate_colosseum_consume_once(text,text,text,bigint,text)'
    ) is not null then
        raise exception
            'SAFEGATE_COLOSSEUM_RPC_ALREADY_EXISTS';
    end if;
end;
$$;

create table public.safegate_colosseum_consumes (
    consume_key text primary key,
    request_id text not null,
    request_hash text not null,
    chain_id bigint not null,
    transaction_hash text not null,
    created_at timestamptz not null default now(),

    constraint safegate_colosseum_consume_key_format
        check (consume_key ~ '^[a-f0-9]{64}$'),

    constraint safegate_colosseum_request_id_format
        check (request_id ~ '^SG-EVM-REQ-[A-Z0-9-]{12,80}$'),

    constraint safegate_colosseum_request_hash_format
        check (request_hash ~ '^[a-f0-9]{64}$'),

    constraint safegate_colosseum_base_chain_only
        check (chain_id = 8453),

    constraint safegate_colosseum_tx_hash_format
        check (transaction_hash ~ '^0x[a-f0-9]{64}$'),

    constraint safegate_colosseum_chain_tx_unique
        unique (chain_id, transaction_hash)
);

alter table public.safegate_colosseum_consumes
    enable row level security;

revoke all
    on table public.safegate_colosseum_consumes
    from public, anon, authenticated;

grant insert
    on table public.safegate_colosseum_consumes
    to service_role;

create function public.safegate_colosseum_consume_once(
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