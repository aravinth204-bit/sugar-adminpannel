export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          customer_id: string;
          sale_date: string;
          quantity_kg: number;
          unit_price: number;
          total_amount: number;
          amount_paid: number;
          balance: number;
          notes: string | null;
          sale_unit: "500g" | "1kg" | "bulk";
          sale_quantity: number;
          rate_per_unit: number;
          discount_amount: number;
          payment_method: "cash" | "upi";
          status: "completed" | "cancelled";
          cancelled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          sale_date?: string;
          quantity_kg: number;
          unit_price: number;
          total_amount: number;
          amount_paid: number;
          balance: number;
          notes?: string | null;
          sale_unit?: "500g" | "1kg" | "bulk";
          sale_quantity?: number;
          rate_per_unit?: number;
          discount_amount?: number;
          payment_method?: "cash" | "upi";
          status?: "completed" | "cancelled";
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          sale_date?: string;
          quantity_kg?: number;
          unit_price?: number;
          total_amount?: number;
          amount_paid?: number;
          balance?: number;
          notes?: string | null;
          sale_unit?: "500g" | "1kg" | "bulk";
          sale_quantity?: number;
          rate_per_unit?: number;
          discount_amount?: number;
          payment_method?: "cash" | "upi";
          status?: "completed" | "cancelled";
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          customer_id: string;
          payment_date: string;
          amount: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          payment_date?: string;
          amount: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          payment_date?: string;
          amount?: number;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      stock_entries: {
        Row: {
          id: string;
          stock_unit: "500g" | "1kg" | "bulk";
          quantity: number;
          added_on: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          stock_unit: "500g" | "1kg" | "bulk";
          quantity: number;
          added_on?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          stock_unit?: "500g" | "1kg" | "bulk";
          quantity?: number;
          added_on?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fetch_customers_with_balances: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          phone: string | null;
          address: string | null;
          created_at: string;
          pending_balance: number;
        }[];
      };
      add_sale: {
        Args: {
          p_customer_id: string;
          p_sale_unit: "500g" | "1kg" | "bulk";
          p_quantity: number;
          p_rate_per_unit: number;
          p_amount_paid?: number;
          p_sale_date?: string;
          p_notes?: string | null;
          p_discount?: number;
          p_payment_method?: "cash" | "upi";
        };
        Returns: {
          id: string;
          total_amount: number;
          amount_paid: number;
          balance: number;
        }[];
      };
      update_sale: {
        Args: {
          p_sale_id: string;
          p_sale_unit: "500g" | "1kg" | "bulk";
          p_quantity: number;
          p_rate_per_unit: number;
          p_amount_paid?: number;
          p_discount?: number;
          p_payment_method?: "cash" | "upi";
          p_sale_date?: string;
          p_notes?: string | null;
        };
        Returns: {
          id: string;
          total_amount: number;
          amount_paid: number;
          balance: number;
        }[];
      };
      cancel_sale: {
        Args: {
          p_sale_id: string;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      fetch_dashboard_stats: {
        Args: { p_sale_date: string };
        Returns: {
          todays_sale: number;
          todays_cash_collected: number;
        }[];
      };
      record_old_due_payment: {
        Args: {
          p_customer_id: string;
          p_amount: number;
          p_payment_date?: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
