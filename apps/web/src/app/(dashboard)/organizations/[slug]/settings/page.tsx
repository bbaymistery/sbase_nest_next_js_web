import { redirect } from 'next/navigation';

export default async function OrgSettingsIndexPage({ params, }: { params: Promise<{ slug: string }>; }) {
  const { slug } = await params;
  redirect(`/organizations/${slug}/settings/members`);
}
