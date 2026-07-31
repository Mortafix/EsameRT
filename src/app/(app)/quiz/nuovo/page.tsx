import type { Metadata } from "next";
import { ExamPicker } from "@/components/quiz/exam-picker";

export const metadata: Metadata = {
  title: "Nuova simulazione",
};

export default function NewQuizPage() {
  return <ExamPicker />;
}
