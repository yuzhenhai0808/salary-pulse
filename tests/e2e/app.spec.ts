import { expect, test } from "@playwright/test";
test("setup, bilingual switching, privacy, and settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Language" }).selectOption("en-US");
  await page.getByRole("textbox", { name: "Salary Amount" }).fill("10000");
  await page.getByRole("textbox", { name: "Your Name" }).fill("Alex");
  await page.getByRole("button", { name: "Start My Day" }).click();
  await expect(page.getByText("126.38", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Hide Earnings" }).click();
  await expect(page.getByText("••••", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "Alex，辛苦啦" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Alex，辛苦啦" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "按你的节奏来" }),
  ).toBeVisible();
});
test("salary and schedule fields calculate automatically", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").first().selectOption("en-US");
  await page.getByRole("textbox", { name: "Salary Amount" }).fill("10000");
  await expect(page.getByTestId("preview-monthly")).toContainText("10,000.00");
  await expect(page.getByTestId("preview-paid-hours")).toHaveText("8h 0m");
  const originalDays = Number(
    await page.getByTestId("preview-working-days").innerText(),
  );
  await page
    .locator("label")
    .filter({ has: page.getByRole("checkbox", { name: "Sat", exact: true }) })
    .click();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("preview-working-days").innerText()),
    )
    .toBeGreaterThan(originalDays);
  await page.getByLabel("Break Ends At", { exact: true }).fill("14:00");
  await expect(page.getByTestId("preview-paid-hours")).toHaveText("7h 0m");
  await expect(page.getByTestId("preview-monthly")).toContainText("10,000.00");
  const convertedHourly = (await page.getByTestId("preview-hourly").innerText())
    .split(" ")[0]
    .replaceAll(",", "");
  await page
    .getByRole("combobox", { name: "Pay Period", exact: true })
    .selectOption("hourly");
  await expect(
    page.getByRole("textbox", { name: "Salary Amount" }),
  ).toHaveValue(convertedHourly);
  await page.getByRole("textbox", { name: "Salary Amount" }).fill("50");
  await expect(page.getByTestId("preview-daily")).toContainText("350.00");
  await expect(page.getByTestId("preview-hourly")).toContainText("50.00");
  await page.getByLabel("Start", { exact: true }).fill("22:00");
  await page.getByLabel("Finish", { exact: true }).fill("06:00");
  await expect(
    page.getByText("Finishes next day (automatic)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("preview-paid-hours")).toHaveText("7h 0m");
  await expect(
    page.getByRole("spinbutton", {
      name: "Working Days per Month",
      exact: true,
    }),
  ).toHaveCount(0);
});
