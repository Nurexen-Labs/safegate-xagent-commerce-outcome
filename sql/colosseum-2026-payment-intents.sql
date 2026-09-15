-- SafeGate Colosseum 2026
-- Durable pre-payment intent registry.
-- Migration artifact only. This file does not mutate production by itself.

begin;

do $$
begin
    if to_regclass(
        'public.safegate_colosseum_payment_intents'
    ) is not null then
        raise exception
            'SAFEGATE_COLOSSEUM_PAYMENT_INTENTS_ALREADY_EXISTS';
    end if;

    if to_regprocedure(
        'public.safegate_colosseum_create_payment_intent(text,text,text,bigint,text,text,text,text,text,timestamptz,timestamptz)'
    ) is not null then
        raise exception
            'SAFEGATE_COLOSSEUM_CREATE_INTENT_RPC_ALREADY_EXISTS';
    end if;

    if to_regprocedure(
        'public.safegate_colosseum_get_payment_intent(text)'
    ) is not null then
        raise exception
            'SAFEGATE_COLOSSEUM_GET_INTENT_RPC_ALREADY_EXISTS';
    end if;
end;
$$;

create table public.safegate_colosseum_payment_intents (
    intent_id text primary key,
    request_id text not null unique,
    request_hash text not null,
    chain_id bigint not null,
    asset text not null,
    token_contract text not null,
    payment_sender text not null,
    merchant_receiver text not null,
    amount_base_units text not null,
    state text not null default 'OPEN',
    created_at timestamptz not null,
    expires_at timestamptz not null,

    constraint safegate_colosseum_intent_id_format
        check (
            intent_id ~
            '^SG-COL-INTENT-[A-F0-9]{32}$'
        ),

    constraint safegate_colosseum_intent_request_id_format
        check (
            request_id ~
            '^SG-EVM-REQ-[A-Z0-9-]{12,80}$'
        ),

    constraint safegate_colosseum_intent_request_hash_format
        check (
            request_hash ~
            '^[a-f0-9]{64}$'
        ),

    constraint safegate_colosseum_intent_base_only
        check (chain_id = 8453),

    constraint safegate_colosseum_intent_asset
        check (asset = 'USDC'),

    constraint safegate_colosseum_intent_token
        check (
            token_contract =
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        ),

    constraint safegate_colosseum_intent_sender_format
        check (
            payment_sender ~
            '^0x[a-f0-9]{40}$'
        ),

    constraint safegate_colosseum_intent_receiver_format
        check (
            merchant_receiver ~
            '^0x[a-f0-9]{40}$'
        ),

    constraint safegate_colosseum_intent_amount_format
        check (
            amount_base_units ~
            '^[1-9][0-9]*$'
        ),

    constraint safegate_colosseum_intent_state
        check (state = 'OPEN'),

    constraint safegate_colosseum_intent_expiry
        check (expires_at > created_at)
);

alter table public.safegate_colosseum_payment_intents
    enable row level security;

revoke all
    on table public.safegate_colosseum_payment_intents
    from public, anon, authenticated;

grant select, insert
    on table public.safegate_colosseum_payment_intents
    to service_role;

create function public.safegate_colosseum_create_payment_intent(
    p_intent_id text,
    p_request_id text,
    p_request_hash text,
    p_chain_id bigint,
    p_asset text,
    p_token_contract text,
    p_payment_sender text,
    p_merchant_receiver text,
    p_amount_base_units text,
    p_created_at timestamptz,
    p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    affected integer;
begin
    insert into public.safegate_colosseum_payment_intents (
        intent_id,
        request_id,
        request_hash,
        chain_id,
        asset,
        token_contract,
        payment_sender,
        merchant_receiver,
        amount_base_units,
        state,
        created_at,
        expires_at
    )
    values (
        p_intent_id,
        p_request_id,
        lower(p_request_hash),
        p_chain_id,
        upper(p_asset),
        lower(p_token_contract),
        lower(p_payment_sender),
        lower(p_merchant_receiver),
        p_amount_base_units,
        'OPEN',
        p_created_at,
        p_expires_at
    )
    on conflict do nothing;

    get diagnostics affected = row_count;

    return affected = 1;
end;
$$;

create function public.safegate_colosseum_get_payment_intent(
    p_intent_id text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
    select to_jsonb(t)
    from public.safegate_colosseum_payment_intents t
    where t.intent_id = p_intent_id
    limit 1;
$$;

revoke all
    on function public.safegate_colosseum_create_payment_intent(
        text,text,text,bigint,text,text,text,text,text,timestamptz,timestamptz
    )
    from public, anon, authenticated;

revoke all
    on function public.safegate_colosseum_get_payment_intent(text)
    from public, anon, authenticated;

grant execute
    on function public.safegate_colosseum_create_payment_intent(
        text,text,text,bigint,text,text,text,text,text,timestamptz,timestamptz
    )
    to service_role;

grant execute
    on function public.safegate_colosseum_get_payment_intent(text)
    to service_role;

commit;