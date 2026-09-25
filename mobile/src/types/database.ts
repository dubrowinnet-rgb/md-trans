// Ручное отражение supabase/migrations/0001_init_schema.sql.
// Сгенерировать автоматически (`supabase gen types typescript`) можно будет,
// когда появится сетевой доступ к проекту; до тех пор поддерживаем руками
// синхронно со схемой.

// Роль сотрудника в экипаже заказа (order_crew) — всегда одна из двух,
// в отличие от роли входа (AccountRole), которая шире.
export type EmployeeRole = 'driver' | 'loader';
// Роль входа в приложение: у каждой — свой набор экранов (см. app/_layout.tsx).
// 'owner' — владелец сервиса (миграция 0013): не привязан к компании,
// своего набора экранов в мобильном приложении не получает (см.
// _layout.tsx) — заведён здесь только затем, чтобы employees.role и
// company_id-логика типизировались на него полностью, без пропусков.
export type AccountRole = 'owner' | 'admin' | 'dispatcher' | 'driver' | 'loader';
export type AccountStatus = 'active' | 'pending_payment' | 'suspended';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';
// Режим ставки (миграция 0014): combined — одна hourly_rate на все роли в
// заказе; split — своя ставка на вождение и на погрузку/разгрузку.
export type RateMode = 'combined' | 'split';
export type DriverReportStatus = 'draft' | 'submitted' | 'confirmed';
export type FuelPaymentMethod = 'cash' | 'cashless';
export type OrderStatus = 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type StopType = 'pickup' | 'dropoff';
export type CrewStatus = 'notified' | 'read' | 'confirmed';
// Режим самообслуживания графика: mark_off — отмечает выходные (по
// умолчанию), mark_on — отмечает рабочие дни. См. миграцию 0008.
export type ScheduleMode = 'mark_off' | 'mark_on';
export type ScheduleDayStatus = 'off' | 'on';

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
          hourly_rate: number | null;
          driving_hourly_rate: number | null;
          loading_hourly_rate: number | null;
          rate_mode: RateMode;
          created_at: string;
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
          created_at?: string;
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
          key: string;
          label: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          label: string;
          body: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          target?: 'crew_push';
          offset_minutes: number;
          enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['reminder_rules']['Insert']>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
