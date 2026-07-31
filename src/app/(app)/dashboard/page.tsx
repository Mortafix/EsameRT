import type { Metadata } from "next";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return <HomeDashboard />;
}
