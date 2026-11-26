import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ io: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

/** Lets everything that is not being held back run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const visitorWith = (...names: string[]) =>
  vi.mocked(cookies).mockResolvedValue({ getAll: () => names.map((name) => ({ name, value: "x" })), set: vi.fn() } as never);

describe("the client that acts as the signed-in visitor", () => {
  let answerRequest = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
    vi.mocked(createServerClient).mockReturnValue({ auth: {} } as never);
    // Next holds this back while it prepares a page ahead of a visit, and lets it through for a visitor's request.
    vi.mocked(io).mockReturnValue(new Promise<void>((resolve) => (answerRequest = resolve)));
  });

  // The client checks a session against the clock as soon as it exists. Next reads the cookies while it prepares
  // what a link fetches ahead of a visit too, and reports a clock read there as an error on every page.
  it.each([
    ["whole", ["sb-example-auth-token"]],
    ["in pieces", ["sb-example-auth-token.0", "sb-example-auth-token.1"]],
  ])("is not made from a session (kept %s) until a visitor's request is being answered", async (_kept, names) => {
    visitorWith(...names);

    const client = createServerSupabase();
    await settle();
    expect(createServerClient).not.toHaveBeenCalled();

    answerRequest();
    await client;
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  it("is made straight away for a visitor with no session, so their page can be prepared ahead", async () => {
    visitorWith("theme");

    await createServerSupabase();

    expect(io).not.toHaveBeenCalled();
    expect(createServerClient).toHaveBeenCalledOnce();
  });

  it("is built with the public settings and the visitor's cookies", async () => {
    visitorWith();

    await createServerSupabase();

    const [url, key, options] = vi.mocked(createServerClient).mock.calls[0];
    expect([url, key]).toEqual(["https://example.supabase.co", "sb_publishable_example"]);
    expect(options.cookies.getAll()).toEqual([]);
  });
});
