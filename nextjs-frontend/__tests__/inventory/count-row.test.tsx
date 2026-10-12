/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { CountRow } from "@/components/inventory/count-row";
import type { PosProduct } from "@/lib/pos/catalog-search";

// next-intl ships ESM this jest setup can't load: resolve keys from the real Spanish messages
jest.mock("next-intl", () => {
  const messages = jest.requireActual("../../messages/es.json");
  return {
    useTranslations: (namespace: string) => (key: string, values: Record<string, string> = {}) => {
      const text = `${namespace}.${key}`.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages) as string;
      return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
    },
  };
});

const product: PosProduct = {
  id: "p1", name: "Cola", sku: null, category: null, unit_type: "unit", price: "1000", stock: "30", min_stock: null,
};

function setup() {
  const onSet = jest.fn();
  const onDone = jest.fn();
  render(
    <ul>
      <CountRow product={product} entry={undefined} onSet={onSet} onDone={onDone} />
    </ul>,
  );
  return { onSet, onDone, input: screen.getByLabelText("Cantidad contada de Cola") as HTMLInputElement };
}

describe("count row", () => {
  it("doesn't save while typing, only on Enter", () => {
    const { onSet, onDone, input } = setup();
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "12" } });
    expect(onSet).not.toHaveBeenCalled();
    // The difference against the system (30) shows while typing
    expect(screen.getByText("-18")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSet).toHaveBeenCalledWith(12);
    expect(onDone).toHaveBeenCalled();
  });

  it("'=' only fills the field; the ✓ button saves it", () => {
    const { onSet, input } = setup();
    fireEvent.click(screen.getByLabelText("Igual al sistema"));
    expect(onSet).not.toHaveBeenCalled();
    expect(input.value).toBe("30");
    fireEvent.click(screen.getByLabelText("Guardar"));
    expect(onSet).toHaveBeenCalledWith(30);
  });
});
