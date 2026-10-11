import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorMessage(error: { detail?: unknown }): string {
  let errorMessage = "An unknown error occurred";

  if (typeof error.detail === "string") {
    // If detail is a string, use it directly
    errorMessage = error.detail;
  } else if (
    error.detail !== null &&
    typeof error.detail === "object" &&
    "reason" in error.detail
  ) {
    // If detail is an object with a 'reason' key, use that
    errorMessage = String((error.detail as { reason: unknown }).reason);
  }

  return errorMessage;
}
