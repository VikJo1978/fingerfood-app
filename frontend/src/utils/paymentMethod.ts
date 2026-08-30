import type { PaymentMethod } from "../types";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  VORKASSE: "Vorkasse",
  RECHNUNG: "Rechnung",
  BAR_VOR_ORT: "Bar vor Ort",
};

export const PAYMENT_METHOD_CUSTOMER_TEXT: Record<PaymentMethod, string> = {
  VORKASSE: "Zahlung per Vorkasse",
  RECHNUNG: "Zahlung per Rechnung",
  BAR_VOR_ORT: "Barzahlung vor Ort",
};

export function isCompanyCustomer(companyName: string): boolean {
  return companyName.trim() !== "";
}

export function paymentMethodAllowed(
  companyName: string,
  method: PaymentMethod | undefined
): boolean {
  if (method === undefined) return false;
  if (method === "RECHNUNG") return isCompanyCustomer(companyName);
  return true;
}

export function paymentMethodBlocker(
  companyName: string,
  method: PaymentMethod | undefined
): string | null {
  if (method === undefined) {
    return "Bitte zuerst eine Zahlungsart auswählen.";
  }
  if (!paymentMethodAllowed(companyName, method)) {
    return "Rechnung ist nur für Firmenkunden zulässig. Bitte Vorkasse oder Bar vor Ort wählen.";
  }
  return null;
}

export function allowedPaymentMethods(companyName: string): readonly PaymentMethod[] {
  return isCompanyCustomer(companyName)
    ? ["VORKASSE", "RECHNUNG", "BAR_VOR_ORT"]
    : ["VORKASSE", "BAR_VOR_ORT"];
}
