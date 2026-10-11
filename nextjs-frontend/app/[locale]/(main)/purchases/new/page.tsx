import { Suspense } from "react";

import { PurchaseWizard } from "@/components/purchases/wizard/purchase-wizard";

// Guided purchase entry: supplier → products → payment → review (step in ?step=)
export default function NewPurchasePage() {
  return (
    <Suspense>
      <PurchaseWizard />
    </Suspense>
  );
}
