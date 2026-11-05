import EventDetail from "@/components/EventDetail";
export const metadata = { title: "Campeonato online" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventDetail id={id} />;
}
