import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/preact";
import SettingsCategoriesScreen from "./SettingsCategories.js";
import { db } from "@/db/local.js";
import type { Category, Subcategory } from "@/db/local.js";
import { api } from "@/lib/api.js";
import { subcategoriesSignal } from "@/lib/categories.js";

vi.mock("preact-iso", () => ({
  useLocation: () => ({ route: vi.fn() }),
}));

// Hono RPC client stub. Subcategory endpoints:
//   POST   /api/categories/:id/subcategories      -> categories[":id"].subcategories.$post
//   PATCH  /api/categories/subcategories/:id       -> categories.subcategories[":id"].$patch
//   DELETE /api/categories/subcategories/:id        -> categories.subcategories[":id"].$delete
vi.mock("@/lib/api", () => {
  const subPost = vi.fn();
  const subPatch = vi.fn();
  const subDelete = vi.fn();
  return {
    api: {
      api: {
        categories: {
          ":id": {
            subcategories: { $post: subPost },
            $patch: vi.fn(),
            $delete: vi.fn(),
          },
          subcategories: {
            ":id": { $patch: subPatch, $delete: subDelete },
          },
          $post: vi.fn(),
        },
      },
    },
  };
});

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-food",
    name: "food",
    icon: "other",
    color: "#6c9cff",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSubcategory(overrides: Partial<Subcategory> = {}): Subcategory {
  return {
    id: "sub-groceries",
    category_id: "cat-food",
    name: "groceries",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const subPost = api.api.categories[":id"].subcategories.$post as ReturnType<typeof vi.fn>;
const subPatch = (api.api.categories as any).subcategories[":id"].$patch as ReturnType<typeof vi.fn>;
const subDelete = (api.api.categories as any).subcategories[":id"].$delete as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await db.categories.clear();
  await db.subcategories.clear();
  vi.clearAllMocks();
});

describe("SettingsCategoriesScreen — subcategory management", () => {
  it("hides subcategories until the category row is tapped, then reveals them", async () => {
    await db.categories.put(makeCategory());
    await db.subcategories.put(makeSubcategory());

    render(<SettingsCategoriesScreen />);

    // Category visible, subcategory hidden while the drawer is collapsed.
    await screen.findByText("food");
    expect(screen.queryByText("groceries")).toBeNull();

    fireEvent.click(screen.getByText("food"));

    await waitFor(() => expect(screen.getByText("groceries")).toBeTruthy());
  });

  it("adds a subcategory via POST and shows it in the drawer", async () => {
    await db.categories.put(makeCategory());
    subPost.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeSubcategory({ id: "sub-dining", name: "dining", sort_order: 0 }),
        ),
    });

    render(<SettingsCategoriesScreen />);
    fireEvent.click(await screen.findByText("food"));

    fireEvent.click(await screen.findByText("+ subcategory"));
    const input = (await screen.findByPlaceholderText(
      "subcategory name",
    )) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "dining" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(subPost).toHaveBeenCalledWith(
        expect.objectContaining({
          param: { id: "cat-food" },
          json: { name: "dining" },
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("dining")).toBeTruthy());
    // The shared signal that Add/History/Analytics read must refresh too —
    // not just Dexie — so the new subcategory shows up without a full sync.
    await waitFor(() =>
      expect(
        subcategoriesSignal.value.some((s) => s.id === "sub-dining"),
      ).toBe(true),
    );
  });

  it("renames a subcategory via PATCH", async () => {
    await db.categories.put(makeCategory());
    await db.subcategories.put(makeSubcategory());
    subPatch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(makeSubcategory({ name: "food shopping" })),
    });

    render(<SettingsCategoriesScreen />);
    fireEvent.click(await screen.findByText("food"));
    await screen.findByText("groceries");

    fireEvent.click(screen.getByTitle("rename subcategory"));
    const input = (await screen.findByDisplayValue(
      "groceries",
    )) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "food shopping" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(subPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          param: { id: "sub-groceries" },
          json: { name: "food shopping" },
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("food shopping")).toBeTruthy());
  });

  it("surfaces the server's 409 error inline and keeps the subcategory on delete conflict", async () => {
    await db.categories.put(makeCategory());
    await db.subcategories.put(makeSubcategory());
    subDelete.mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "Cannot delete subcategory: 2 expense(s) still reference it",
        }),
    });

    render(<SettingsCategoriesScreen />);
    fireEvent.click(await screen.findByText("food"));
    await screen.findByText("groceries");

    fireEvent.click(screen.getByTitle("delete subcategory"));
    // ConfirmDialog confirm button reads "delete".
    fireEvent.click(await screen.findByText("delete"));

    await waitFor(() => expect(subDelete).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText(
          "Cannot delete subcategory: 2 expense(s) still reference it",
        ),
      ).toBeTruthy(),
    );
    // Subcategory still present — not optimistically removed.
    expect(screen.getByText("groceries")).toBeTruthy();
  });

  it("removes a subcategory on successful delete", async () => {
    await db.categories.put(makeCategory());
    await db.subcategories.put(makeSubcategory());
    subDelete.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    render(<SettingsCategoriesScreen />);
    fireEvent.click(await screen.findByText("food"));
    await screen.findByText("groceries");

    fireEvent.click(screen.getByTitle("delete subcategory"));
    fireEvent.click(await screen.findByText("delete"));

    await waitFor(() => expect(subDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("groceries")).toBeNull());
  });
});
