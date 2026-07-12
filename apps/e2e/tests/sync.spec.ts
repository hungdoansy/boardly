import { expect, test } from "@playwright/test";

import { addCard, createBoard, logIn, signUp } from "./helpers";

// Two clients (separate browser contexts), same account, same board → an edit on
// one converges on the other over the live WebSocket sync server. Exercises the
// full path: per-user doc authz, WS ticket, Hocuspocus relay, Yjs merge.
test.describe("live sync", () => {
  test.slow(); // real network + two clients

  test("a card created on one client appears on another", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const email = await signUp(pageA);
    await createBoard(pageA);
    const boardUrl = pageA.url();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await logIn(pageB, email);
    await pageB.goto(boardUrl);
    await createBoard(pageB);

    // A adds a card into a fixed status column → it converges on B.
    await addCard(pageA, "Todo", "Synced card");
    await expect(pageB.getByRole("button", { name: "Card: Synced card" })).toBeVisible({
      timeout: 20_000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});
