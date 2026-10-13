import { Suspense } from "react";

import { ProductWizard } from "@/components/products/wizard/product-wizard";

// Guided product creation: product → price → stock → review (step in ?step=)
export default function CreateItemPage() {
  return (
    <Suspense>
      <ProductWizard />
    </Suspense>
  );
}
