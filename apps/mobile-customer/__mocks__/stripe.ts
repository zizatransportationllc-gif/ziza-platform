/** Jest mock for @stripe/stripe-react-native (native module — not loaded in tests). */
import React from "react";

export const StripeProvider = ({ children }: { children?: React.ReactNode }): React.ReactNode => children;
export const CardField = (): null => null;
export const useConfirmSetupIntent = (): {
  confirmSetupIntent: () => Promise<{ setupIntent: null; error: undefined }>;
  loading: boolean;
} => ({
  confirmSetupIntent: async () => ({ setupIntent: null, error: undefined }),
  loading: false,
});

export const useStripe = (): {
  initPaymentSheet: () => Promise<{ error: undefined }>;
  presentPaymentSheet: () => Promise<{ error: undefined }>;
} => ({
  initPaymentSheet: async () => ({ error: undefined }),
  presentPaymentSheet: async () => ({ error: undefined }),
});
