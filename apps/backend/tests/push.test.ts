import { describe, expect, it, vi } from "vitest";
import { sendExpoPush } from "../src/common/push";

// A real Expo push token shape ("ExponentPushToken[...]"), just enough to
// pass Expo.isExpoPushToken's format check without hitting the network.
const VALID_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

describe("sendExpoPush", () => {
    it("rejects a malformed token before ever calling the send function", async () => {
        const sendFn = vi.fn();
        await expect(sendExpoPush("not-a-token", { title: "t", body: "b" }, sendFn))
            .rejects.toThrow(/not a valid expo push token/i);
        expect(sendFn).not.toHaveBeenCalled();
    });

    it("sends title/body/data through to the injected send function", async () => {
        const sendFn = vi.fn().mockResolvedValue([{ status: "ok" }]);
        await sendExpoPush(VALID_TOKEN, { title: "KYC Approved", body: "You're verified.", data: { screen: "home" } }, sendFn);

        expect(sendFn).toHaveBeenCalledTimes(1);
        const [messages] = sendFn.mock.calls[0];
        expect(messages).toEqual([
            {
                to: VALID_TOKEN,
                title: "KYC Approved",
                body: "You're verified.",
                data: { screen: "home" },
                sound: "default",
            },
        ]);
    });

    it("throws when Expo's ticket reports an error", async () => {
        const sendFn = vi.fn().mockResolvedValue([{ status: "error", message: "DeviceNotRegistered" }]);
        await expect(sendExpoPush(VALID_TOKEN, { title: "t", body: "b" }, sendFn))
            .rejects.toThrow(/DeviceNotRegistered/);
    });
});
