import AdminView from "@/components/AdminView";
export const metadata = {
  title: "Administração",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminView />;
}
