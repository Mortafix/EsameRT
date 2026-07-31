import type { Metadata } from "next";
import { ReviewFeed } from "@/components/review/review-feed";

export const metadata: Metadata = {
  title: "Ripasso guidato",
};

export default function ReviewPage() {
  return <ReviewFeed />;
}
