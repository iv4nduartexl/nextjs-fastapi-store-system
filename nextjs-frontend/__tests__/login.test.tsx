import { login } from "@/components/actions/login-action";
import { authJwtLogin } from "@/app/clientService";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/routing";

jest.mock("../app/clientService", () => ({
  authJwtLogin: jest.fn(),
}));

jest.mock("next/headers", () => {
  const mockSet = jest.fn();
  const mockDelete = jest.fn();
  return { cookies: jest.fn().mockResolvedValue({ set: mockSet, delete: mockDelete }) };
});

// /users/me lookup used to pick the landing page after login
function mockMe(me: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => me }) as jest.Mock;
}

beforeEach(() => {
  mockMe({ is_superuser: false, business_id: "b1", must_change_password: false });
});

jest.mock("@/i18n/routing", () => ({
  redirect: jest.fn(),
}));

jest.mock("next-intl/server", () => ({
  getLocale: jest.fn().mockResolvedValue("es"),
}));

describe("login action", () => {
  it("sends the superuser to the admin panel", async () => {
    mockMe({ is_superuser: true, business_id: null, must_change_password: false });
    (authJwtLogin as jest.Mock).mockResolvedValue({ data: { access_token: "admin-token" } });
    const formData = new FormData();
    formData.set("username", "admin@platform.com");
    formData.set("password", "Q12341414#");

    await login({}, formData);

    expect(redirect).toHaveBeenCalledWith({ href: "/admin", locale: "es" });
  });

  it("sends users with a temporary password to change it", async () => {
    mockMe({ is_superuser: false, business_id: "b1", must_change_password: true });
    (authJwtLogin as jest.Mock).mockResolvedValue({ data: { access_token: "t" } });
    const formData = new FormData();
    formData.set("username", "new@store.com");
    formData.set("password", "Q12341414#");

    await login({}, formData);

    expect(redirect).toHaveBeenCalledWith({ href: "/change-password", locale: "es" });
  });

  it("should call login service action with the correct input", async () => {
    const formData = new FormData();
    formData.set("username", "a@a.com");
    formData.set("password", "Q12341414#");

    const mockSet = (await cookies()).set;

    // Mock a successful login
    (authJwtLogin as jest.Mock).mockResolvedValue({
      data: { access_token: "1245token" },
    });

    await login({}, formData);

    expect(authJwtLogin).toHaveBeenCalledWith({
      body: {
        username: "a@a.com",
        password: "Q12341414#",
      },
    });

    expect(cookies).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      "accessToken",
      "1245token",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(redirect).toHaveBeenCalledWith({ href: "/dashboard", locale: "es" });
  });

  it("should should return an error if the server validation fails", async () => {
    const formData = new FormData();
    formData.set("username", "invalid@invalid.com");
    formData.set("password", "Q12341414#");

    // Mock a failed login
    (authJwtLogin as jest.Mock).mockResolvedValue({
      error: {
        detail: "LOGIN_BAD_CREDENTIALS",
      },
    });

    const result = await login(undefined, formData);

    expect(authJwtLogin).toHaveBeenCalledWith({
      body: {
        username: "invalid@invalid.com",
        password: "Q12341414#",
      },
    });

    expect(result).toEqual({
      server_validation_error: "LOGIN_BAD_CREDENTIALS",
    });

    expect(cookies).not.toHaveBeenCalled();
  });

  it("should should return an error if either the password or username is not sent", async () => {
    const formData = new FormData();
    formData.set("username", "");
    formData.set("password", "");

    const result = await login({}, formData);

    expect(authJwtLogin).not.toHaveBeenCalledWith();

    expect(result).toEqual({
      errors: {
        password: ["Password is required"],
        username: ["Username is required"],
      },
    });

    expect(cookies).not.toHaveBeenCalled();
  });

  it("should handle unexpected errors and return server error message", async () => {
    // Mock the authJwtLogin to throw an error
    const mockError = new Error("Network error");
    (authJwtLogin as jest.Mock).mockRejectedValue(mockError);

    const formData = new FormData();
    formData.append("username", "testuser");
    formData.append("password", "password123");

    const result = await login(undefined, formData);

    expect(result).toEqual({
      server_error: "An unexpected error occurred. Please try again later.",
    });
  });
});
