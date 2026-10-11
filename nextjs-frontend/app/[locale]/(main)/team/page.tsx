import { getLocale } from "next-intl/server";

import { listTeam } from "@/components/actions/team-action";
import { TeamClient } from "@/components/team/team-client";
import { requireOwnerPage } from "@/lib/session";

export default async function TeamPage() {
  const me = await requireOwnerPage();
  const [team, locale] = await Promise.all([listTeam(), getLocale()]);
  return (
    <TeamClient
      initialUsers={team.data ?? []}
      businessName={me.business_name ?? ""}
      currentUserId={me.id}
      locale={locale}
    />
  );
}
