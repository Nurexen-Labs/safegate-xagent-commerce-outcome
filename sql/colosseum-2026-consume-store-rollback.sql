-- SafeGate Colosseum 2026
-- PRE-DATA rollback only.
--
-- Safety rule:
-- If the consume table contains any row, rollback aborts.
-- Never DROP live commerce evidence through this script.

begin;

do $$
declare
    existing_rows bigint := 0;
begin
    if to_regclass(
        'public.safegate_colosseum_consumes'
    ) is not null then

        execute
            'select count(*) from public.safegate_colosseum_consumes'
        into existing_rows;

        if existing_rows > 0 then
            raise exception
                'ROLLBACK_BLOCKED_NONEMPTY_TABLE';
        end if;
    end if;
end;
$$;

drop function if exists
    public.safegate_colosseum_consume_once(
        text,
        text,
        text,
        bigint,
        text
    );

drop table if exists
    public.safegate_colosseum_consumes;

commit;