-- Правки 6:
--   п.11 — обращение сотрудника в «Службе поддержки» (0025) доходит только
--          до админа/диспетчера его компании, владельцу сервиса не видно
--          вообще — ни строки. Даём владельцу то же сквозное право читать и
--          отвечать, что у него уже есть на управление аккаунтами (см.
--          update-account/index.ts: caller.role === 'owner' — любая
--          компания, для поддержки), без привязки к company_id.
--          В мобильном приложении у роли owner нет своих экранов (её кабинет
--          — только веб, см. mobile/src/app/_layout.tsx), так что экран
--          очереди обращений (employee-support-inbox.tsx) владельцу тут не
--          добавляем — это право нужно для веб-кабинета.
--   п.12 — тикеты/сообщения поддержки сотрудника не были в публикации
--          Realtime (0026 завела туда только orders/order_crew/
--          driver_reports/notifications) — экран не обновлялся сам, пока
--          открыт у другой стороны.
--
-- Файл можно выполнить повторно.

-- ==========================================================================
-- 1. П.11 — владелец сервиса видит и ведёт обращения сотрудников любой
--    компании, как админ/диспетчер — своей.
-- ==========================================================================
drop policy if exists "employee_support_tickets select" on employee_support_tickets;
create policy "employee_support_tickets select" on employee_support_tickets for select to authenticated
  using (
    employee_id = (select get_my_employee_id())
    or exists (
      select 1 from employees
      where auth_user_id = auth.uid()
        and (
          (role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id)
          or role = 'owner'
        )
    )
  );

drop policy if exists "employee_support_tickets update" on employee_support_tickets;
create policy "employee_support_tickets update" on employee_support_tickets for update to authenticated
  using (exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and (
        (role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id)
        or role = 'owner'
      )
  ))
  with check (exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and (
        (role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id)
        or role = 'owner'
      )
  ));

drop policy if exists "employee_support_messages select" on employee_support_messages;
create policy "employee_support_messages select" on employee_support_messages for select to authenticated
  using (exists (
    select 1 from employee_support_tickets t
    where t.id = employee_support_messages.ticket_id
      and (
        t.employee_id = (select get_my_employee_id())
        or exists (
          select 1 from employees
          where auth_user_id = auth.uid()
            and (
              (role in ('admin', 'dispatcher') and company_id = t.company_id)
              or role = 'owner'
            )
        )
      )
  ));

drop policy if exists "employee_support_messages insert" on employee_support_messages;
create policy "employee_support_messages insert" on employee_support_messages for insert to authenticated
  with check (
    sender_id = (select get_my_employee_id())
    and exists (
      select 1 from employee_support_tickets t
      where t.id = employee_support_messages.ticket_id
        and (
          t.employee_id = (select get_my_employee_id())
          or exists (
            select 1 from employees
            where auth_user_id = auth.uid()
              and (
                (role in ('admin', 'dispatcher') and company_id = t.company_id)
                or role = 'owner'
              )
          )
        )
    )
  );

-- ==========================================================================
-- 2. П.12 — живые обновления для обращений сотрудников (см. 0026).
-- ==========================================================================
do $$
declare
  t text;
begin
  foreach t in array array['employee_support_tickets', 'employee_support_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
