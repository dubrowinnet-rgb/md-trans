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
        };
        Update: Partial<Database['public']['Tables']['employees']['Insert']>;
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
      };
    };
  };
}
