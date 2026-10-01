-- «Служба поддержки» в меню сотрудника (Максим, 01.10, вторая половина
-- отложенного пункта «Правки 3» п.5 — первая половина, лента уведомлений,
-- уже в 0024). Отдельно от support_tickets/support_ticket_messages
-- (обращения администратора к владельцу сервиса, миграция 0013): здесь
-- получатель — своя компания (любой админ/диспетчер), а не владелец
-- сервиса, поэтому своя пара таблиц и свои политики, не переиспользуем
-- существующие (разные правила на select/insert/update — проще и
-- безопаснее не смешивать с действующим потоком админ→владелец).
--
-- Файл можно выполнить повторно.

create table if not exists employee_support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id),
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_support_tickets_company_idx on employee_support_tickets (company_id, updated_at desc);
create index if not exists employee_support_tickets_employee_idx on employee_support_tickets (employee_id);

alter table employee_support_tickets enable row level security;

drop trigger if exists employee_support_tickets_set_updated_at on employee_support_tickets;
create trigger employee_support_tickets_set_updated_at
  before update on employee_support_tickets
  for each row
  execute function set_updated_at();

-- select: сам сотрудник видит свои обращения, админ/диспетчер — все по
-- своей компании (это их общая очередь).
drop policy if exists "employee_support_tickets select" on employee_support_tickets;
create policy "employee_support_tickets select" on employee_support_tickets for select to authenticated
  using (
    employee_id = (select get_my_employee_id())
    or exists (
      select 1 from employees
      where auth_user_id = auth.uid() and role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id
    )
  );

-- insert: любой сотрудник своей компании заводит обращение от своего имени.
drop policy if exists "employee_support_tickets insert" on employee_support_tickets;
create policy "employee_support_tickets insert" on employee_support_tickets for insert to authenticated
  with check (
    employee_id = (select get_my_employee_id())
    and company_id = get_my_company_id()
  );

-- update: статус меняет только админ/диспетчер своей компании — как и у
-- support_tickets, автор обращения закрыть его сам не может (чтобы не
-- закрыть случайно нерешённый вопрос).
drop policy if exists "employee_support_tickets update" on employee_support_tickets;
create policy "employee_support_tickets update" on employee_support_tickets for update to authenticated
  using (exists (
    select 1 from employees
    where auth_user_id = auth.uid() and role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id
  ))
  with check (exists (
    select 1 from employees
    where auth_user_id = auth.uid() and role in ('admin', 'dispatcher') and company_id = employee_support_tickets.company_id
  ));

create table if not exists employee_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references employee_support_tickets (id) on delete cascade,
  sender_id uuid not null references employees (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists employee_support_messages_ticket_idx on employee_support_messages (ticket_id);

alter table employee_support_messages enable row level security;

drop policy if exists "employee_support_messages select" on employee_support_messages;
create policy "employee_support_messages select" on employee_support_messages for select to authenticated
  using (exists (
    select 1 from employee_support_tickets t
    where t.id = employee_support_messages.ticket_id
      and (
        t.employee_id = (select get_my_employee_id())
        or exists (
          select 1 from employees
          where auth_user_id = auth.uid() and role in ('admin', 'dispatcher') and company_id = t.company_id
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
            where auth_user_id = auth.uid() and role in ('admin', 'dispatcher') and company_id = t.company_id
          )
        )
    )
  );

-- Пуш админу/диспетчеру компании о новом обращении — симметрично
-- support_tickets_notify_owner (0013) и call_edge_function (0018).
create or replace function notify_support_ticket_created() returns trigger as $$
begin
  perform private.call_edge_function('notify-support-ticket', jsonb_build_object('ticket_id', new.id));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists employee_support_tickets_notify on employee_support_tickets;
create trigger employee_support_tickets_notify
  after insert on employee_support_tickets
  for each row
  execute function notify_support_ticket_created();

-- ==========================================================================
-- Ответ админа/диспетчера сотруднику также попадает в его ленту уведомлений
-- (notifications, 0024) — без этого сотрудник не узнал бы об ответе иначе,
-- чем вручную открыв экран поддержки. Сообщение самого автора тикета
-- (первое, при создании) уведомление не создаёт — проверяем, что
-- отправитель не он сам, а не только роль (админ/диспетчер мог написать
-- себе же, если завёл обращение сам).
-- ==========================================================================
alter table notifications add column if not exists support_ticket_id uuid references employee_support_tickets (id) on delete set null;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('order_changed', 'order_cancelled', 'report_approved', 'report_rejected', 'support_reply'));

create or replace function notify_support_reply() returns trigger as $$
declare
  v_ticket employee_support_tickets%rowtype;
  v_sender_role text;
begin
  select * into v_ticket from employee_support_tickets where id = new.ticket_id;
  select role into v_sender_role from employees where id = new.sender_id;

  if v_sender_role in ('admin', 'dispatcher') and new.sender_id <> v_ticket.employee_id then
    insert into notifications (company_id, employee_id, kind, title, body, support_ticket_id)
    values (
      v_ticket.company_id, v_ticket.employee_id, 'support_reply', 'Ответ в поддержке',
      'Вам ответили по обращению «' || v_ticket.subject || '»', v_ticket.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists employee_support_messages_notify on employee_support_messages;
create trigger employee_support_messages_notify
  after insert on employee_support_messages
  for each row
  execute function notify_support_reply();
