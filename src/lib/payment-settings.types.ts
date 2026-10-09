export type PaymentSettings = {
  qrImageUrl: string | null;
  qrInstructions: string;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  qrImageUrl: null,
  qrInstructions: "",
};
