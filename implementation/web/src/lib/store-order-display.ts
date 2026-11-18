export function orderLabel(value: string) {
  const labels: Record<string, string> = {
    request_received: "Awaiting confirmation", needs_review: "Needs review", quote_changes_requested: "Changes requested",
    partially_fulfilled: "Partially delivered", fulfilled: "Delivered", reserved: "Stock reserved", unfulfilled: "Not yet delivered",
    merchant_delivery: "Store delivery", customer_arranged: "Customer-arranged delivery", pickup: "Pickup",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function orderProgress(order: { commercial_status: string; fulfilment_status: string; created_at: string }) {
  if (["cancelled", "declined"].includes(order.commercial_status)) return [
    { key: "received", label: "Request received", state: "done" as const, date: order.created_at },
    { key: "closed", label: orderLabel(order.commercial_status), state: "done" as const },
  ];
  const delivered = order.fulfilment_status === "fulfilled" || order.commercial_status === "completed";
  const current = delivered ? 4 : ["packed", "partially_fulfilled"].includes(order.fulfilment_status) ? 3 : order.commercial_status === "confirmed" ? 2 : 1;
  return ["Request received", "Store confirmation", "Packed", "Delivered"].map((label, index) => ({ key: String(index), label, state: index < current ? "done" as const : index === current ? "current" as const : "todo" as const, date: index === 0 ? order.created_at : undefined }));
}
