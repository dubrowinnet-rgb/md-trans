// Ручное отражение supabase/migrations/0001_init_schema.sql.
// Сгенерировать автоматически (`supabase gen types typescript`) можно будет,
// когда появится сетевой доступ к проекту; до тех пор поддерживаем руками
// синхронно со схемой.

export type EmployeeRole = 'driver' | 'loader';
export type AccountStatus = 'active' | 'pending_payment' | 'suspended';
export type OrderStatus = 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type StopType = 'pickup' | 'dropoff';
export type CrewStatus = 'notified' | 'read' | 'confirmed';

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          role: EmployeeRole;
          name: string;
          phone: string | null;
          account_status: AccountStatus;
          paid_until: string | null;
          monthly_price: number | null;
          last_location: { lat: number; lng: number; updated_at: string } | null;
          auth_user_id: string | null;
          expo_push_token: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          role: EmployeeRole;
          name: string;
          phone?: string | null;
          account_status?: AccountStatus;
          paid_until?: string | null;
          monthly_price?: number | null;
          auth_user_id?: string | null;
          expo_push_token?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          discount_percent?: number;
          notes?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_duration_minutes?: number | null;
          base_price?: number | null;
          category?: string | null;
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
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
