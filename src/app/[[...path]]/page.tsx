import DemoApp from "@/components/demo-app";
import OperationsApp from "@/components/operations/app";
import { supabaseConfig } from "@/lib/supabase/config";
import { notFound } from "next/navigation";
import { connection } from "next/server";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  await connection();
  const { path = [] } = await params;
  const explicitDemo = path[0] === "demo";
  const route = "/" + (explicitDemo ? path.slice(1) : path).join("/");
  if (supabaseConfig() && !explicitDemo && route !== "/s/demo")
    return <OperationsApp route={route} />;
  if (
    ![
      "/",
      "/login",
      "/dashboard",
      "/sermons/new",
      "/sermons/demo",
      "/sermons/demo/review",
      "/sermons/local",
      "/sermons/local/review",
      "/present/demo",
      "/s/demo",
    ].includes(route)
  )
    notFound();
  return <DemoApp route={route} />;
}

export const maxDuration = 180;
