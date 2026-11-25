/// <reference types="vite/client" />

type LahzaTransaction = { reference: string; status?: string };
type LahzaPopupOptions = {
  key: string;
  email: string;
  amount: number;
  currency: 'ILS';
  ref: string;
  metadata?: {
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    products: { id: number; name: string; color: string; quantity: number; price: number }[];
  };
  onSuccess: (transaction: LahzaTransaction) => void;
  onCancel: () => void;
};

interface Window {
  LahzaPopup?: new () => {
    newTransaction: (options: LahzaPopupOptions) => void;
  };
}