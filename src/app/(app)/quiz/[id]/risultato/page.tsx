import type { Metadata } from "next";
import { ResultView } from "@/components/results/result-view";

export const metadata: Metadata = {
  title: "Risultato",
};

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultView attemptId={id} />;
}
