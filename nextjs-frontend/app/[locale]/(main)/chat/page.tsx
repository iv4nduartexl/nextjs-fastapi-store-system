"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import { sendMessage, executeTool } from "@/components/actions/chat-action";
import { Check, X } from "lucide-react";

const VALUE_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    cash: "Efectivo",
    card: "Tarjeta",
    transfer: "Transferencia",
    credit: "Crédito",
    paid: "Pagado",
    unpaid: "No pagado",
    partial: "Parcial",
    received: "Recibido",
    internal: "Interno",
    other: "Otro",
    completed: "Completado",
    cancelled: "Cancelado",
    refunded: "Reembolsado"
  },
  en: {
    cash: "Cash",
    card: "Card",
    transfer: "Transfer",
    credit: "Credit",
    paid: "Paid",
    unpaid: "Unpaid",
    partial: "Partial",
    received: "Received",
    internal: "Internal",
    other: "Other",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded"
  }
};

export default function ChatPage() {
  const params = useParams();
  const locale = params?.locale as string || "en";

  const [messages, setMessages] = useState<{ role: string; content: string; toolCall?: any; status?: "pending" | "approved" | "rejected" }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const t = locale === "es" 
    ? { 
        item: "Producto", qty: "Cant", price: "Precio", total: "Total", 
        approval: "Operación aprobada", cancellation: "Operación cancelada", 
        placeholder: "Describe la operación o haz una pregunta...", 
        send: "Enviar", approve: "Aprobar", cancel: "Cancelar", 
        approved_msg: "Operación aprobada.", cancelled_msg: "Operación cancelada por el usuario."
    }
    : { 
        item: "Item", qty: "Qty", price: "Price", total: "Total", 
        approval: "Operation approved", cancellation: "Operation cancelled", 
        placeholder: "Describe the operation or ask a question...", 
        send: "Send", approve: "Approve", cancel: "Cancel", 
        approved_msg: "Operation completed.", cancelled_msg: "Operation cancelled by user."
    };

  const getDisplayValue = (value: any) => {
    if (value === null || value === undefined || value === "") {
        return (locale === "es" ? "Vacío" : "Empty");
    } else if (typeof value === 'object') {
        return value.name || value.label || value.item_name || JSON.stringify(value);
    } else {
        const strValue = String(value).toLowerCase().trim();
        const langMap = VALUE_TRANSLATIONS[locale] || VALUE_TRANSLATIONS.en;
        return langMap[strValue] || String(value);
    }
  };

  const getLabel = (key: string) => {
    const lowerKey = key.toLowerCase();
    
    // Lista de etiquetas fijas que deben traducirse siempre
    const commonLabels: Record<string, Record<string, string>> = {
        es: {
            payment_method: "Método de pago",
            payment_method_label: "Método de pago",
            payment_status: "Estado de pago",
            supplier: "Proveedor",
            supplier_name: "Proveedor",
            item_name: "Producto",
            quantity: "Cantidad",
            price: "Precio",
            total: "Total",
            notes: "Notas",
            supplier_id: "ID del Proveedor",
            customer_id: "ID del Cliente",
            customer_name: "Cliente",
            customer_phone: "Teléfono del Cliente",
            customer_email: "Email del Cliente",
            supplier_phone: "Teléfono del Proveedor",
            supplier_email: "Email del Proveedor",
            total_cost: "Costo Total",
            status: "Estado",
            reference_number: "Número de referencia"
        },
        en: {
            payment_method: "Payment Method",
            payment_method_label: "Payment Method",
            payment_status: "Payment Status",
            supplier: "Supplier",
            supplier_name: "Supplier",
            item_name: "Item Name",
            quantity: "Quantity",
            price: "Price",
            total: "Total",
            notes: "Notes",
            supplier_id: "Supplier ID",
            customer_id: "Customer ID",
            customer_name: "Customer Name",
            customer_phone: "Customer Phone",
            customer_email: "Customer Email",
            supplier_phone: "Supplier Phone",
            supplier_email: "Supplier Email",
            total_cost: "Total Cost",
            status: "Status",
            reference_number: "Reference Number"
        }
    };

    const langMap = commonLabels[locale] || commonLabels.en;
    return langMap[lowerKey] || key.replace(/_/g, ' ');
  };

  const requestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const data = await sendMessage(input);
  
    data.error ? (
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }])
    ) : (
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, toolCall: data.toolCall, status: data.toolCall ? "pending" : undefined }])
    );
    setIsLoading(false);
  };

  const approveTool = async (index: number, toolCall: any) => {
    setMessages((prev) => prev.map((m, i) => i === index ? { ...m, status: "approved" } : m));
    
    const data = await executeTool(toolCall.name, toolCall.args);
    
    if (data.error) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || t.approved_msg }]);
    }
  };

  const rejectTool = (index: number) => {
    setMessages((prev) => prev.map((m, i) => i === index ? { ...m, status: "rejected" } : m));
    setMessages((prev) => [...prev, { role: "assistant", content: t.cancelled_msg }]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <Card className={`p-4 shadow-sm border ${
              m.role === "user" 
                ? "bg-primary text-primary-foreground ml-12" 
                : "bg-muted/50 mr-12"
            } max-w-[90%] md:max-w-[75%]`}>
              <div className="prose prose-sm dark:prose-invert">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              
              {m.toolCall && m.status === "pending" && (
                <div className="mt-4 p-3 bg-background rounded-lg border border-border space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                    <span className="px-2 py-0.5 bg-secondary rounded text-xs uppercase tracking-wider font-bold">{locale === "es" ? "Solicitud de herramienta" : "Tool Request"}</span>
                    <span className="font-mono text-foreground">{m.toolCall.name}</span>
                  </div>
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto font-mono">
                    {Array.isArray(m.toolCall.args.items) ? (
                      <div className="space-y-4">
                        {/* Tabla de ítems */}
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr>
                              <th>{t.item}</th>
                              <th>{t.qty}</th>
                              <th>{t.price}</th>
                              <th>{t.total}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.toolCall.args.items.map((it: any, idx: number) => (
                              <tr key={idx}>
                                <td>{it.item_name || it.item_id}</td>
                                <td>{it.quantity}</td>
                                <td>{it.price ? `$${it.price.toFixed(2)}` : '-'}</td>
                                <td>{it.total_price ? `$${it.total_price.toFixed(2)}` : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {/* Campos extra de la operación */}
                        <div className="border-t border-muted pt-2 space-y-1">
                          {Object.entries(m.toolCall.args).map(([key, value]) => {
                            if (key === "items") return null;
                            
                            const displayValue = getDisplayValue(value);
                            const label = getLabel(key);

                            return (
                              <div key={key} className="flex justify-between gap-4">
                                <span className="font-bold capitalize">{label}:</span>
                                <span className="text-right text-foreground">{displayValue}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        {Object.entries(m.toolCall.args).map(([key, value]) => {
                          if (key === "id" || key === "user_id") return null;
                          return (
                            <div key={key} className="flex justify-between gap-4 border-b border-muted py-0.5">
                              <span className="font-bold capitalize">{getLabel(key)}:</span>
                              <span className="text-right text-foreground">{getDisplayValue(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </pre>
                  <div className="flex gap-2 pt-1">
                    <Button 
                      size="sm" 
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      onClick={() => approveTool(i, m.toolCall)}
                    >
                      <Check className="w-4 h-4" /> {t.approve}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="flex-1 gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                      onClick={() => rejectTool(i)}
                    >
                      <X className="w-4 h-4" /> {t.cancel}
                    </Button>
                  </div>
                </div>
              )}

              {m.status === "approved" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">
                  <Check className="w-3 h-3" /> {t.approval}
                </div>
              )}
              {m.status === "rejected" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-destructive font-medium bg-destructive/5 dark:bg-destructive/950/30 p-2 rounded">
                  <X className="w-3 h-3" /> {t.cancellation}
                </div>
              )}
            </Card>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <Card className="p-4 bg-muted/50 mr-12 max-w-[90%]">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </Card>
          </div>
        )}
      </div>
      <div className="p-4 border-t bg-background">
        <form onSubmit={requestMessage} className="flex gap-2 max-w-4xl mx-auto w-full">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder={t.placeholder} 
            disabled={isLoading}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {t.send}
          </Button>
        </form>
      </div>
    </div>
  );
}