import type { Metadata } from "next";
import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = {
  title: "Storico",
};

export default function HistoryPage() {
  return <HistoryView />;
}
