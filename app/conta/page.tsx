import { Suspense } from "react";
import AccountView from "@/components/AccountView";
import { Loading } from "@/components/ui";
export const metadata = { title: "Minha conta" };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountView />
    </Suspense>
  );
}
