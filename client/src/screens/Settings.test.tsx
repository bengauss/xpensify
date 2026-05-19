import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import SettingsScreen from "./Settings.js";
import { api } from "@/lib/api.js";

vi.mock("preact-iso", () => ({
  useLocation: () => ({
    route: vi.fn(),
  }),
  toChildArray: (c: any) => [c],
}));

vi.mock("@/lib/auth", () => ({
  currentUser: { value: { display_name: "Alice", avatar_color: "#6c9cff" } },
  logout: vi.fn(),
}));

vi.mock("@/db/local", () => ({
  db: {
    categories: {
      count: () => Promise.resolve(0),
    },
  },
}));

vi.mock("@/lib/api", () => {
  const getMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      daily_reminder: 1,
      daily_reminder_time: "21:00",
      weekly_summary: 1,
      weekly_summary_day: 2,
      weekly_summary_time: "09:00",
    }),
  });
  const putMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
  const tokensGetMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
  const merchantsGetMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });

  return {
    api: {
      api: {
        push: {
          preferences: {
            $get: getMock,
            $put: putMock,
          },
        },
        tokens: {
          $get: tokensGetMock,
        },
        merchants: {
          $get: merchantsGetMock,
        },
      },
    },
  };
});

describe("SettingsScreen - Notifications Time Preferences", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && !("PushManager" in window)) {
      (window as any).PushManager = {};
    }
    vi.clearAllMocks();
  });

  it("handles notification settings flow: rendering, option lists, and saving updates", async () => {
    render(<SettingsScreen />);

    // 1. Wait for preferences to load and UI to update
    await waitFor(() => {
      expect(api.api.push.preferences.$get).toHaveBeenCalled();
    });

    // 2. Verify reminder time option list and values
    const reminderTimeSelect = await screen.findByDisplayValue("21:00") as HTMLSelectElement;
    expect(reminderTimeSelect).toBeDefined();

    const options = Array.from(reminderTimeSelect.options).map(opt => opt.value);
    expect(options.length).toBe(24);
    expect(options).toContain("00:00");
    expect(options).toContain("12:00");
    expect(options).toContain("23:00");

    // Check weekly summary day and time
    const summaryDaySelect = await screen.findByDisplayValue("tuesdays") as HTMLSelectElement;
    expect(summaryDaySelect).toBeDefined();

    const summaryTimeSelect = await screen.findByDisplayValue("09:00") as HTMLSelectElement;
    expect(summaryTimeSelect).toBeDefined();
    expect(summaryTimeSelect.options.length).toBe(24);

    // 3. Update reminder time and verify PUT payload
    reminderTimeSelect.value = "10:00";
    reminderTimeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    reminderTimeSelect.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(api.api.push.preferences.$put).toHaveBeenLastCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            daily_reminder: 1,
            daily_reminder_time: "10:00",
          }),
        })
      );
    });

    // 4. Update weekly summary day and verify PUT payload
    summaryDaySelect.value = "4"; // Thursdays
    summaryDaySelect.dispatchEvent(new Event("change", { bubbles: true }));
    summaryDaySelect.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(api.api.push.preferences.$put).toHaveBeenLastCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            weekly_summary_day: 4,
          }),
        })
      );
    });

    // 5. Update weekly summary time and verify PUT payload
    summaryTimeSelect.value = "14:00";
    summaryTimeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    summaryTimeSelect.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(api.api.push.preferences.$put).toHaveBeenLastCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            weekly_summary_time: "14:00",
          }),
        })
      );
    });
  });
});
