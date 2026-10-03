export interface CashfreeCustomerDetails {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

export interface CashfreeOrderData {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_tags?: Record<string, string>;
}

export interface CashfreePaymentData {
  cf_payment_id: string | number;
  payment_status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED' | 'CANCELLED' | 'PENDING';
  payment_amount: number;
  payment_currency: string;
  payment_message?: string;
  payment_time?: string;
  bank_reference?: string;
  auth_id?: string;
  payment_method?: Record<string, any>;
  payment_group?: string;
  payment_error_code?: string;
}

export interface CashfreeWebhookPayload {
  data: {
    order: CashfreeOrderData;
    payment: CashfreePaymentData;
    customer_details: CashfreeCustomerDetails;
  };
  event_time: string;
  type: string;
}
