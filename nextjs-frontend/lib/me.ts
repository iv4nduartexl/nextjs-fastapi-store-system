// The signed-in user as reported by the API (/users/me). Safe to import from client components.
export interface Me {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: "owner" | "cashier";
  is_superuser: boolean;
  must_change_password: boolean;
  business_id: string | null;
  business_name: string | null;
  impersonated_by: string | null;
  impersonator_email: string | null;
}

export function displayName(me: Pick<Me, "full_name" | "username" | "email">): string {
  return me.full_name || me.username || me.email;
}
