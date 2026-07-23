import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";

export interface PushMessage {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

type SendFn = (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

const defaultExpo = new Expo();
const defaultSend: SendFn = (messages) => defaultExpo.sendPushNotificationsAsync(messages);

/**
 * Dumb transport only — no DB writes here, that's notifications.service.ts's
 * job. `sendFn` defaults to the real Expo SDK call but is injectable for
 * tests, same pattern as sendOtpSms's injectable `fetch` in
 * modules/auth/msg91.ts.
 */
export async function sendExpoPush(
    token: string,
    message: PushMessage,
    sendFn: SendFn = defaultSend,
): Promise<void> {
    if (!Expo.isExpoPushToken(token)) {
        throw new Error(`Not a valid Expo push token: ${token}`);
    }

    const tickets = await sendFn([
        {
            to: token,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: "default",
        } satisfies ExpoPushMessage,
    ]);

    const ticket = tickets[0];
    if (ticket?.status === "error") {
        throw new Error(ticket.message ?? "Expo push delivery failed.");
    }
}
