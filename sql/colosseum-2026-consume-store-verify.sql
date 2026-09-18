-- SafeGate Colosseum 2026
-- READ-ONLY post-migration verification.
-- This script performs no mutation.

select
    to_regclass(
        'public.safegate_colosseum_consumes'
    ) is not null
        as table_exists,

    to_regprocedure(
        'public.safegate_colosseum_consume_once(text,text,text,bigint,text)'
    ) is not null
        as rpc_exists,

    coalesce(
        (
            select c.relrowsecurity
            from pg_class c
            join pg_namespace n
                on n.oid = c.relnamespace
            where
                n.nspname = 'public'
                and c.relname = 'safegate_colosseum_consumes'
                and c.relkind = 'r'
        ),
        false
    )
        as rls_enabled,

    exists (
        select 1
        from pg_constraint
        where
            conrelid =
                to_regclass(
                    'public.safegate_colosseum_consumes'
                )
            and conname =
                'safegate_colosseum_base_chain_only'
    )
        as base_only_constraint_exists,

    exists (
        select 1
        from pg_constraint
        where
            conrelid =
                to_regclass(
                    'public.safegate_colosseum_consumes'
                )
            and conname =
                'safegate_colosseum_chain_tx_unique'
    )
        as chain_tx_unique_exists,

    case
        when to_regclass(
            'public.safegate_colosseum_consumes'
        ) is null
            then false
        else has_table_privilege(
            'service_role',
            'public.safegate_colosseum_consumes',
            'INSERT'
        )
    end
        as service_role_insert_granted,

    not exists (
        select 1
        from information_schema.table_privileges
        where
            table_schema = 'public'
            and table_name =
                'safegate_colosseum_consumes'
            and grantee in (
                'PUBLIC',
                'anon',
                'authenticated'
            )
    )
        as untrusted_table_grants_absent,

    case
        when to_regprocedure(
            'public.safegate_colosseum_consume_once(text,text,text,bigint,text)'
        ) is null
            then false
        else has_function_privilege(
            'service_role',
            'public.safegate_colosseum_consume_once(text,text,text,bigint,text)',
            'EXECUTE'
        )
    end
        as service_role_rpc_execute_granted,

    not exists (
        select 1
        from information_schema.routine_privileges
        where
            routine_schema = 'public'
            and routine_name =
                'safegate_colosseum_consume_once'
            and grantee in (
                'PUBLIC',
                'anon',
                'authenticated'
            )
            and privilege_type = 'EXECUTE'
    )
        as untrusted_rpc_execute_absent,

    coalesce(
        (
            select not p.prosecdef
            from pg_proc p
            where p.oid =
                to_regprocedure(
                    'public.safegate_colosseum_consume_once(text,text,text,bigint,text)'
                )
        ),
        false
    )
        as security_invoker;