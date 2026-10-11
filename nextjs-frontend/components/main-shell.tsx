"use client";

import { Link } from "@/i18n/routing";
import { Home, LayoutDashboard, Calculator, KeyRound, LogOut } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logout } from "@/components/actions/logout-action";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useEffect, useState } from "react";
import CalculatorModal from "@/components/Modals/calculator-modal";
import { AppSidebar } from "@/components/app-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { MeProvider } from "@/components/me-provider";
import { displayName, type Me } from "@/lib/me";

export function MainShell({
  me,
  children,
}: {
  me: Me;
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tAccount = useTranslations("account");
  const name = displayName(me);

  const [isOpenCalulator, setIsOpenCalculator] = useState(false);

  useEffect(() => {
    const openCalculatorShortcut = (e: { key: string }) => {
      e.key === "+" && setIsOpenCalculator(true);
    };
    window.addEventListener("keydown", openCalculatorShortcut);
    return () => window.removeEventListener("keydown", openCalculatorShortcut);
  }, []);

  return (
    <MeProvider me={me}>
    {me.impersonated_by && <ImpersonationBanner me={me} />}
    <div className="flex min-h-screen">
      <AppSidebar />

      <main className="ml-16 w-full p-8 bg-muted/40">
        <header className="flex justify-between items-center mb-6">
          <Breadcrumb>
            <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
               <Link href="/" className="flex items-center gap-2">
                 <Home className="h-4 w-4" />
                 <span>{t("home")}</span>
               </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
               <Link href="/dashboard" className="flex items-center gap-2">
                 <LayoutDashboard className="h-4 w-4" />
                 <span>{t("dashboardTitle")}</span>
               </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-3">
            <Calculator
              className="h-5 w-5 cursor-pointer"
              onClick={() => setIsOpenCalculator(true)}
            />
            <CalculatorModal
              isOpen={isOpenCalulator}
              onClose={() => setIsOpenCalculator(false)}
            />
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-gray-200/70 transition-colors"
                  aria-label={name}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-300 text-sm font-semibold">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:flex flex-col items-start leading-tight text-left">
                    <span className="text-sm font-medium text-gray-800 max-w-[10rem] truncate">{name}</span>
                    <span className="text-[11px] text-gray-500 max-w-[10rem] truncate">
                      {me.business_name}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">{me.email}</p>
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {me.business_name} · {tAccount(`roles.${me.role}`)}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/change-password" className="flex items-center gap-2 cursor-pointer">
                    <KeyRound className="h-4 w-4" />
                    {tAccount("changePassword")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => logout()}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  {tCommon("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <section className="grid gap-6">{children}</section>
      </main>
    </div>
    </MeProvider>
  );
}
