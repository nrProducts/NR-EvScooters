import { app } from "./app";
import { env } from "./config/env";
import { reportGatewayKeyStatus } from "./config/razorpay";
import { startRefundStatusSync } from "./modules/refunds/refunds.service";

app.listen(env.port, () => {
    console.log(`Backend running on port ${env.port}`);
    // Fire-and-forget: surfaces a dead payment key in the boot log instead
    // of leaving it to be discovered by a rider inside Checkout.
    void reportGatewayKeyStatus();
    // Refunds Razorpay has finished are marked completed even when its
    // webhook never arrives — so the rider app and the admin console both
    // stop showing "Processing" for money already returned.
    startRefundStatusSync();
});
