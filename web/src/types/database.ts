// Копия mobile/src/types/database.ts — схема общая у мобильного приложения и
// веб-кабинета. Меняете схему — обновите оба файла.

// Роль сотрудника в экипаже заказа (order_crew) — всегда одна из двух,
// в отличие от роли входа (AccountRole), которая шире.
export type EmployeeRole = 'driver' | 'loader';
// Роль входа в приложение: у каждой — свой набор экранов (см. app/_layout.tsx).
// 'owner' — владелец сервиса (миграция 0013): не привязан к компании
// (company_id всегда null), доступен только в веб-кабинете (/owner/).
export type AccountRole = 'owner' | 'admin' | 'dispatcher' | 'driver' | 'loader';
export type AccountStatus = 'active' | 'pending_payment' | 'suspended';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type OrderStatus = 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type StopType = 'pickup' | 'dropoff';
export type CrewStatus = 'notified' | 'read' | 'confirmed';
// Режим самообслуживания графика: mark_off — отмечает выходные (по
// умолчанию), mark_on — отмечает рабочие дни. См. миграцию 0008.
export type ScheduleMode = 'mark_off' | 'mark_on';
export type ScheduleDayStatus = 'off' | 'on';
// Режим ставки водителя/грузчика (миграция 0014): combined — одна ставка
// за час на любой роли в заказе; split — раздельно вождение/погрузка.
export type RateMode = 'combined' | 'split';
export type DriverReportStatus = 'draft' | 'submitted' | 'confirmed';
export type FuelPaymentMethod = 'cash' | 'cashless';

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          role: AccountRole;
          name: string;
          last_name: string | null;
          phone: string | null;
          login: string | null;
          account_status: AccountStatus;
          paid_until: string | null;
          monthly_price: number | null;
          last_location: { lat: number; lng: number; updated_at: string } | null;
          auth_user_id: string | null;
          expo_push_token: string | null;
          can_manage_orders: boolean;
          can_view_client_stats: boolean;
          can_view_contacts_and_amounts: boolean;
          can_manage_own_schedule: boolean;
          can_edit_order_schedule_and_price: boolean;
          default_vehicle_id: string | null;
          schedule_mode: ScheduleMode;
          birth_date: string | null;
          hire_date: string | null;
          address: string | null;
          personal_vehicle_make: string | null;
          personal_vehicle_plate: string | null;
          // null только у роли 'owner' — остальные роли всегда привязаны
          // к компании (миграция 0013, employees_company_id_by_role).
          company_id: string | null;
          created_at: string;
          // Ставки за час (миграция 0014) — применимы только водителю и
          // грузчику, у остальных ролей null.
          hourly_rate: number | null;
          driving_hourly_rate: number | null;
          loading_hourly_rate: number | null;
          rate_mode: RateMode;
        };
        Insert: {
          id?: string;
          role: AccountRole;
          name: string;
          last_name?: string | null;
          phone?: string | null;
          login?: string | null;
          account_status?: AccountStatus;
          paid_until?: string | null;
          monthly_price?: number | null;
          auth_user_id?: string | null;
          expo_push_token?: string | null;
          can_manage_orders?: boolean;
          can_view_client_stats?: boolean;
          can_view_contacts_and_amounts?: boolean;
          can_manage_own_schedule?: boolean;
          can_edit_order_schedule_and_price?: boolean;
          default_vehicle_id?: string | null;
          schedule_mode?: ScheduleMode;
          birth_date?: string | null;
          hire_date?: string | null;
          address?: string | null;
          personal_vehicle_make?: string | null;
          personal_vehicle_plate?: string | null;
          company_id?: string | null;
          hourly_rate?: number | null;
          driving_hourly_rate?: number | null;
          loading_hourly_rate?: number | null;
          rate_mode?: RateMode;
        };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          discount_percent: number;
          notes: string | null;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          discount_percent?: number;
          notes?: string | null;
          // DEFAULT get_my_company_id() в базе — слать не нужно (миграция 0013).
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['clients']['Insert']>;
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          base_duration_minutes: number | null;
          base_price: number | null;
          category: string | null;
          color: string;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_duration_minutes?: number | null;
          base_price?: number | null;
          category?: string | null;
          color?: string;
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['services']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          client_id: string | null;
          status: OrderStatus;
          cargo_description: string | null;
          scheduled_start: string;
          scheduled_end: string;
          actual_price: number | null;
          comment: string | null;
          photos: string[];
          created_by: string | null;
          vehicle_id: string | null;
          client_sms_sent_at: string | null;
          company_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          status?: OrderStatus;
          cargo_description?: string | null;
          scheduled_start: string;
          scheduled_end: string;
          actual_price?: number | null;
          comment?: string | null;
          photos?: string[];
          created_by?: string | null;
          vehicle_id?: string | null;
          // В обычном INSERT не участвует — заказы заводятся через RPC
          // create_order(), которая сама проставляет company_id сервером
          // (get_my_company_id()). Поле здесь только для полноты Row/Insert.
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [];
      };
      order_stops: {
        Row: {
          id: string;
          order_id: string;
          type: StopType;
          address: string;
          order_index: number;
          is_primary: boolean;
        };
        Insert: {
          id?: string;
          order_id: string;
          type: StopType;
          address: string;
          order_index?: number;
          is_primary?: boolean;
        };
        Update: Partial<Database['public']['Tables']['order_stops']['Insert']>;
        Relationships: [];
      };
      order_crew: {
        Row: {
          order_id: string;
          employee_id: string;
          role: EmployeeRole;
          status: CrewStatus;
          notified_at: string | null;
          read_at: string | null;
        };
        Insert: {
          order_id: string;
          employee_id: string;
          role: EmployeeRole;
          status?: CrewStatus;
          notified_at?: string | null;
          read_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['order_crew']['Insert']>;
        Relationships: [];
      };
      order_services: {
        Row: {
          order_id: string;
          service_id: string;
          qty: number;
        };
        Insert: {
          order_id: string;
          service_id: string;
          qty?: number;
        };
        Update: Partial<Database['public']['Tables']['order_services']['Insert']>;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          name: string;
          plate: string;
          capacity_kg: number | null;
          body_dimensions: string | null;
          europallet_count: number | null;
          top_loading: boolean;
          side_loading: boolean;
          moscow_center_pass: boolean;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plate: string;
          capacity_kg?: number | null;
          body_dimensions?: string | null;
          europallet_count?: number | null;
          top_loading?: boolean;
          side_loading?: boolean;
          moscow_center_pass?: boolean;
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['vehicles']['Insert']>;
        Relationships: [];
      };
      employee_schedule_days: {
        Row: {
          employee_id: string;
          day: string;
          status: ScheduleDayStatus;
          start_time: string | null;
          end_time: string | null;
          created_at: string;
        };
        Insert: {
          employee_id: string;
          day: string;
          status: ScheduleDayStatus;
          start_time?: string | null;
          end_time?: string | null;
        };
        Update: Partial<Database['public']['Tables']['employee_schedule_days']['Insert']>;
        Relationships: [];
      };
      sms_templates: {
        Row: {
          // Первичный ключ теперь (company_id, key), не просто key —
          // миграция 0013, у каждой компании свой набор тех же ключей.
          key: string;
          label: string;
          body: string;
          company_id: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          label: string;
          body: string;
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['sms_templates']['Insert']>;
        Relationships: [];
      };
      reminder_rules: {
        Row: {
          id: string;
          target: 'crew_push';
          offset_minutes: number;
          enabled: boolean;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          target?: 'crew_push';
          offset_minutes: number;
          enabled?: boolean;
          company_id?: string;
        };
        Update: Partial<Database['public']['Tables']['reminder_rules']['Insert']>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          subscription_status: AccountStatus;
          subscription_plan: string | null;
          subscription_price: number | null;
          subscription_expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          subscription_status?: AccountStatus;
          subscription_plan?: string | null;
          subscription_price?: number | null;
          subscription_expires_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          company_id: string;
          created_by: string;
          subject: string;
          status: TicketStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          created_by: string;
          subject: string;
          status?: TicketStatus;
          // Триггер set_updated_at перезапишет любое присланное значение
          // на своё UPDATE — поле здесь только чтобы можно было вызвать
          // update({ updated_at: ... }) ради самого факта UPDATE (см.
          // useSendTicketMessage в api/supportTickets.ts).
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['support_tickets']['Insert']>;
        Relationships: [];
      };
      support_ticket_messages: {
        Row: {
          id: string;
          ticket_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          sender_id: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['support_ticket_messages']['Insert']>;
        Relationships: [];
      };
      driver_reports: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          report_date: string;
          status: DriverReportStatus;
          cash_handed_in: number | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          fuel_amount: number | null;
          fuel_payment_method: FuelPaymentMethod | null;
          odometer_photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string;
          employee_id: string;
          report_date: string;
          status?: DriverReportStatus;
          cash_handed_in?: number | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          fuel_amount?: number | null;
          fuel_payment_method?: FuelPaymentMethod | null;
          odometer_photo_url?: string | null;
        };
        Update: Partial<Database['public']['Tables']['driver_reports']['Insert']>;
        Relationships: [];
      };
      driver_report_orders: {
        Row: {
          id: string;
          report_id: string;
          order_id: string;
          paid_by_transfer: boolean;
        };
        Insert: {
          id?: string;
          report_id: string;
          order_id: string;
          paid_by_transfer?: boolean;
        };
        Update: Partial<Database['public']['Tables']['driver_report_orders']['Insert']>;
        Relationships: [];
      };
      driver_report_expenses: {
        Row: {
          id: string;
          report_id: string;
          description: string;
          amount: number;
        };
        Insert: {
          id?: string;
          report_id: string;
          description: string;
          amount: number;
        };
        Update: Partial<Database['public']['Tables']['driver_report_expenses']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_order: {
        Args: {
          p_client_id: string | null;
          p_cargo_description: string | null;
          p_scheduled_start: string;
          p_scheduled_end: string;
          p_actual_price: number | null;
          p_comment: string | null;
          p_stops: unknown;
          p_crew: unknown;
          p_services?: unknown;
          p_vehicle_id?: string | null;
        };
        Returns: string;
      };
      delete_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      recent_addresses: {
        Args: { p_limit?: number };
        Returns: { address: string; uses: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
