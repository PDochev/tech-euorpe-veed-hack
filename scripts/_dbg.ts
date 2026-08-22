import { launch, login } from "../app/_lib/driver/playwright";
async function main() {
  const { browser, page } = await launch();
  await login(page, "https://opensource-demo.orangehrmlive.com", { username: "Admin", password: "admin123" });
  await page.goto("https://opensource-demo.orangehrmlive.com/web/index.php/pim/viewEmployeeList", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const rows = await page.locator("div.oxd-table-body .oxd-table-row").count();
  console.log("rows:", rows);
  for (let i=0;i<Math.min(3,rows);i++){
    const cells = await page.locator("div.oxd-table-body .oxd-table-row").nth(i).locator(".oxd-table-cell").allTextContents();
    console.log(" row",i,cells.map(c=>c.replace(/\s+/g," ").trim()).filter(Boolean).join(" | "));
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
