'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  Home,
  Table2,
  ShieldCheck,
  FolderOpen,
  Code2,
  Radio,
  Building2,
  ChevronsUpDown,
  Plus,
  Check,
  LogOut,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { signOut } from '@/features/auth/sign-out';
import type { OrganizationWithMeta } from '@sbase/types';

const orgNavItem = { icon: Home, label: 'Home', segment: 'projects' } as const;

const projectNavItems = [
  { icon: Table2, label: 'Database', segment: 'database' },
  { icon: ShieldCheck, label: 'Auth', segment: 'auth' },
  { icon: FolderOpen, label: 'Storage', segment: 'storage' },
  { icon: Code2, label: 'API', segment: 'api' },
  { icon: Radio, label: 'Realtime', segment: 'realtime' },
] as const;

function buildNavHref(orgSlug: string | undefined, projectSlug: string | undefined, segment: string, scope: 'org' | 'project',): string {
  if (!orgSlug) return '/organizations';

  if (scope === 'org') {
    return `/organizations/${orgSlug}/projects`;
  }

  if (projectSlug) {
    return `/organizations/${orgSlug}/${projectSlug}/${segment}`;
  }

  return `/organizations/${orgSlug}/projects`;
}

interface AppSidebarProps {
  orgs: OrganizationWithMeta[];
  user: { email: string; name: string | null };
}

export function AppSidebar({ orgs, user }: AppSidebarProps) {
  const pathname = usePathname();
  const params = useParams<{ slug: string; projectSlug?: string }>();
  const currentOrg = orgs.find((org) => org.slug === params?.slug) ?? orgs[0];
  const orgSlug = params?.slug;
  const projectSlug = params?.projectSlug;

  return (
    <Sidebar collapsible="icon">
      {/* ── Header — org switcher ─────────────────────────────────── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Building2 size={16} />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">{currentOrg?.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {currentOrg?.role}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-popper-anchor-width]"
                align="start"
              >
                {orgs.map((org) => (
                  <DropdownMenuItem key={org.id} asChild>
                    <Link
                      href={`/organizations/${org.slug}/projects`}
                      className="flex items-center justify-between"
                    >
                      <span>{org.name}</span>
                      {org.slug === params?.slug && <Check size={14} />}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/organizations">All organizations</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/organizations/new"
                    className="flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    New organization
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Home — projects list for this org */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={
                    pathname ===
                    buildNavHref(
                      orgSlug,
                      projectSlug,
                      orgNavItem.segment,
                      'org',
                    )
                  }
                  tooltip={orgNavItem.label}
                >
                  <Link
                    href={buildNavHref(
                      orgSlug,
                      projectSlug,
                      orgNavItem.segment,
                      'org',
                    )}
                  >
                    <orgNavItem.icon />
                    <span>{orgNavItem.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Project-scoped items */}
              {projectNavItems.map(({ icon: Icon, label, segment }) => {
                const href = buildNavHref(
                  orgSlug,
                  projectSlug,
                  segment,
                  'project',
                );
                const isActive = pathname === href;

                return (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer — user profile ─────────────────────────────────── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">
                      {user.name ?? 'Account'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-popper-anchor-width]"
                side="top"
                align="start"
              >
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  asChild
                  onSelect={(event) => event.preventDefault()}
                >
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-1.5 text-destructive text-sm"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
